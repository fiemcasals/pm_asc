import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { COSTO_BCRYPT, MENSAJE_REVOCADA } from '../src/auth/auth.service';
import { Reloj, Rol } from '../src/auth/auth.types';
import { VERSION_CONSENTIMIENTO_UBICACION } from '../src/auth/consentimiento';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';

jest.setTimeout(60_000);

class RelojDePrueba implements Reloj {
  t = Date.UTC(2026, 10, 12, 12, 0, 0);
  ahora(): number {
    return this.t;
  }
  adelantarSegundos(s: number): void {
    this.t += s * 1000;
  }
}

const PASSWORD = 'Clave-Segura-2026';

describe('Consentimiento de ubicación y revocación de sesiones (HU-14 RNF-01)', () => {
  let app: INestApplication;
  let usuarios: InMemoryUsuariosRepository;
  let reloj: RelojDePrueba;
  let hash: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    hash = await bcrypt.hash(PASSWORD, COSTO_BCRYPT);
  });

  async function alta(usuario: string, rol: Rol): Promise<string> {
    const u = await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hash });
    return u!.id;
  }

  const ingresar = (usuario: string) => http().post('/api/auth/login').send({ usuario, password: PASSWORD });
  const cookieDe = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('mant_refresh='))!.split(';')[0];

  let idRt: string;

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository();
    reloj = new RelojDePrueba();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios, reloj }));
    idRt = await alta('rt1', 'rt_calle');
    await alta('secretaria1', 'secretaria');
    await alta('admin1', 'administrador');
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Condición 1: aviso de uso de ubicación, aceptación obligatoria con fecha y versión', () => {
    it('el texto vigente dice para qué, cuándo se toma y quién ve la ubicación, con su versión', async () => {
      const { body } = await http().get('/api/consentimientos/ubicacion').expect(200);
      expect(body.version).toBe(VERSION_CONSENTIMIENTO_UBICACION);
      const texto = body.parrafos.join(' ');
      expect(texto).toMatch(/constancia de que estuviste en el edificio/); // para qué
      expect(texto).toMatch(/Iniciar Inspección.*No se pudo realizar la inspección/); // cuándo
      expect(texto).toMatch(/segundo plano/);
      expect(texto).toMatch(/Secretaría y el RT Firmante/); // quién la ve
      expect(texto).toMatch(/Ley 25\.326/);
    });

    it('el RT de Calle sin aceptar lo tiene pendiente al ingresar; la Secretaría no', async () => {
      expect((await ingresar('rt1').expect(200)).body.usuario.consentimientoUbicacionPendiente).toBe(true);
      expect((await ingresar('secretaria1').expect(200)).body.usuario.consentimientoUbicacionPendiente).toBe(false);
    });

    it('aceptar registra fecha y versión, y deja de estar pendiente en /me, en el refresco y en el próximo ingreso', async () => {
      const login = await ingresar('rt1').expect(200);
      const auth = `Bearer ${login.body.accessToken}`;

      const r = await http()
        .post('/api/consentimientos/ubicacion')
        .set('Authorization', auth)
        .send({ version: VERSION_CONSENTIMIENTO_UBICACION })
        .expect(201);
      expect(r.body).toEqual({ version: VERSION_CONSENTIMIENTO_UBICACION, aceptadoEn: new Date(reloj.t).toISOString() });
      expect(usuarios.consentimientos.get(`${idRt}|${VERSION_CONSENTIMIENTO_UBICACION}`)).toEqual(new Date(reloj.t));

      expect((await http().get('/api/auth/me').set('Authorization', auth).expect(200)).body.consentimientoUbicacionPendiente).toBe(false);
      const ref = await http().post('/api/auth/refresh').set('Cookie', cookieDe(login)).expect(200);
      expect(ref.body.usuario.consentimientoUbicacionPendiente).toBe(false);
      expect((await ingresar('rt1').expect(200)).body.usuario.consentimientoUbicacionPendiente).toBe(false);
    });

    it('aceptar dos veces conserva la fecha de la primera aceptación', async () => {
      const auth = `Bearer ${(await ingresar('rt1')).body.accessToken}`;
      const primera = new Date(reloj.t);
      await http().post('/api/consentimientos/ubicacion').set('Authorization', auth).send({ version: VERSION_CONSENTIMIENTO_UBICACION }).expect(201);
      reloj.adelantarSegundos(60);
      await http().post('/api/consentimientos/ubicacion').set('Authorization', auth).send({ version: VERSION_CONSENTIMIENTO_UBICACION }).expect(201);
      expect(usuarios.consentimientos.get(`${idRt}|${VERSION_CONSENTIMIENTO_UBICACION}`)).toEqual(primera);
    });

    it('una versión distinta de la vigente se rechaza con 400, y sin sesión con 401', async () => {
      const auth = `Bearer ${(await ingresar('rt1')).body.accessToken}`;
      await http().post('/api/consentimientos/ubicacion').set('Authorization', auth).send({ version: 'ubicacion-vieja' }).expect(400);
      await http().post('/api/consentimientos/ubicacion').set('Authorization', auth).send({}).expect(400);
      await http().post('/api/consentimientos/ubicacion').send({ version: VERSION_CONSENTIMIENTO_UBICACION }).expect(401);
      expect(usuarios.consentimientos.size).toBe(0);
    });
  });

  describe('Condición 3: el Administrador revoca las sesiones y desde ese momento todo responde 401', () => {
    it('el token de acceso todavía vigente y la cookie de refresco del RT dejan de servir al instante', async () => {
      const rt = await ingresar('rt1').expect(200);
      const authRt = `Bearer ${rt.body.accessToken}`;
      const cookieRt = cookieDe(rt);
      await http().get('/api/auth/me').set('Authorization', authRt).expect(200);

      const admin = await ingresar('admin1').expect(200);
      reloj.adelantarSegundos(30); // el token del RT sigue vigente: le quedan 14 min 30 s
      await http().post(`/api/usuarios/${idRt}/revocar-sesiones`).set('Authorization', `Bearer ${admin.body.accessToken}`).expect(204);

      const me = await http().get('/api/auth/me').set('Authorization', authRt).expect(401);
      expect(me.body).toMatchObject({ message: MENSAJE_REVOCADA, motivo: 'revocada' });
      const envio = await http()
        .post('/api/consentimientos/ubicacion')
        .set('Authorization', authRt)
        .send({ version: VERSION_CONSENTIMIENTO_UBICACION })
        .expect(401);
      expect(envio.body.motivo).toBe('revocada');
      expect(usuarios.consentimientos.size).toBe(0);

      const ref = await http().post('/api/auth/refresh').set('Cookie', cookieRt).expect(401);
      expect(ref.body).toMatchObject({ message: MENSAJE_REVOCADA, motivo: 'revocada' });
    });

    it('revoca todas las sesiones del usuario (dos celulares) y no toca las de otros', async () => {
      const cel1 = await ingresar('rt1');
      const cel2 = await ingresar('rt1');
      const otra = await ingresar('secretaria1');
      const admin = await ingresar('admin1');
      reloj.adelantarSegundos(1);
      await http().post(`/api/usuarios/${idRt}/revocar-sesiones`).set('Authorization', `Bearer ${admin.body.accessToken}`).expect(204);

      await http().post('/api/auth/refresh').set('Cookie', cookieDe(cel1)).expect(401);
      await http().post('/api/auth/refresh').set('Cookie', cookieDe(cel2)).expect(401);
      await http().post('/api/auth/refresh').set('Cookie', cookieDe(otra)).expect(200);
      await http().get('/api/auth/me').set('Authorization', `Bearer ${otra.body.accessToken}`).expect(200);
    });

    it('después de la revocación el RT puede volver a ingresar con su contraseña', async () => {
      await ingresar('rt1');
      const admin = await ingresar('admin1');
      await http().post(`/api/usuarios/${idRt}/revocar-sesiones`).set('Authorization', `Bearer ${admin.body.accessToken}`).expect(204);
      reloj.adelantarSegundos(1);
      const nuevo = await ingresar('rt1').expect(200);
      await http().get('/api/auth/me').set('Authorization', `Bearer ${nuevo.body.accessToken}`).expect(200);
      await http().post('/api/auth/refresh').set('Cookie', cookieDe(nuevo)).expect(200);
    });

    it('sólo el Administrador puede revocar (401 sin sesión, 403 con otro rol) y un usuario inexistente da 404', async () => {
      const otro = await ingresar('secretaria1');
      await http().post(`/api/usuarios/${idRt}/revocar-sesiones`).expect(401);
      await http().post(`/api/usuarios/${idRt}/revocar-sesiones`).set('Authorization', `Bearer ${otro.body.accessToken}`).expect(403);
      const admin = await ingresar('admin1');
      await http()
        .post('/api/usuarios/00000000-0000-0000-0000-000000000000/revocar-sesiones')
        .set('Authorization', `Bearer ${admin.body.accessToken}`)
        .expect(404);
      expect((await usuarios.buscarPorId(idRt))?.sesionesRevocadasEn).toBeNull();
    });

    it('un vencimiento común (sin revocación) no trae motivo "revocada"', async () => {
      const rt = await ingresar('rt1');
      reloj.adelantarSegundos(15 * 60);
      const r = await http().get('/api/auth/me').set('Authorization', `Bearer ${rt.body.accessToken}`).expect(401);
      expect(r.body.motivo).toBeUndefined();
    });
  });
});
