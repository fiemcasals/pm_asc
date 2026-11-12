import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AuthService, COSTO_BCRYPT } from '../src/auth/auth.service';
import { Reloj, Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';

jest.setTimeout(60_000);

class RelojDePrueba implements Reloj {
  t = Date.UTC(2026, 10, 12, 17, 0, 0);
  ahora(): number {
    return this.t;
  }
  adelantarSegundos(s: number): void {
    this.t += s * 1000;
  }
}

const PASSWORD = 'Clave-Segura-2026';
const ECA = 'Conservación Porteña S.R.L.';

describe('ECA del usuario en la sesión (HU-15 RF-01)', () => {
  let app: INestApplication;
  let usuarios: InMemoryUsuariosRepository;
  let reloj: RelojDePrueba;
  let hash: string;
  let auth: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    hash = await bcrypt.hash(PASSWORD, COSTO_BCRYPT);
  });

  beforeEach(async () => {
    usuarios = new InMemoryUsuariosRepository();
    reloj = new RelojDePrueba();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios, reloj }));
    await usuarios.crear({ usuario: 'admin1', nombre: 'Admin', rol: 'administrador', passwordHash: hash });
    auth = `Bearer ${(await http().post('/api/auth/login').send({ usuario: 'admin1', password: PASSWORD })).body.accessToken}`;
  });

  afterEach(async () => {
    await app.close();
  });

  const alta = (cuerpo: Record<string, unknown>) =>
    http().post('/api/usuarios').set('Authorization', auth).send({ nombre: 'Prueba', password: PASSWORD, ...cuerpo });
  const ingresar = (usuario: string) => http().post('/api/auth/login').send({ usuario, password: PASSWORD });

  describe('Condición 1: el alta exige "eca" para el rol eca y la rechaza para los demás', () => {
    it('rol eca sin "eca" responde 400 y no crea el usuario', async () => {
      const r = await alta({ usuario: 'eca1', rol: 'eca' }).expect(400);
      expect(JSON.stringify(r.body.message)).toMatch(/eca es obligatoria para el rol eca/);
      expect(await usuarios.buscarPorUsuario('eca1')).toBeNull();
    });

    it.each([['vacía', ''], ['sólo espacios', '   '], ['no es texto', 42], ['nula', null]])(
      'rol eca con "eca" %s responde 400',
      async (_nombre, eca) => {
        await alta({ usuario: 'eca1', rol: 'eca', eca }).expect(400);
        expect(await usuarios.buscarPorUsuario('eca1')).toBeNull();
      },
    );

    it('rol eca con una "eca" de más de 120 caracteres responde 400', async () => {
      await alta({ usuario: 'eca1', rol: 'eca', eca: 'x'.repeat(121) }).expect(400);
    });

    it('rol eca con "eca" válida responde 201, la devuelve sin espacios sobrantes y la guarda', async () => {
      const r = await alta({ usuario: 'eca1', rol: 'eca', eca: `  ${ECA}  ` }).expect(201);
      expect(r.body).toMatchObject({ usuario: 'eca1', rol: 'eca', eca: ECA });
      expect(r.body.passwordHash).toBeUndefined();
      expect((await usuarios.buscarPorUsuario('eca1'))?.eca).toBe(ECA);
    });

    it.each(['rt_calle', 'firmante', 'secretaria', 'administrador'] as Rol[])(
      'rol %s con "eca" responde 400 y no crea el usuario',
      async (rol) => {
        const r = await alta({ usuario: `u-${rol}`, rol, eca: ECA }).expect(400);
        expect(JSON.stringify(r.body.message)).toMatch(/eca sólo se admite para el rol eca/);
        expect(await usuarios.buscarPorUsuario(`u-${rol}`)).toBeNull();
      },
    );

    it.each(['rt_calle', 'firmante', 'secretaria', 'administrador'] as Rol[])(
      'rol %s sin "eca" (o con "eca" vacía o nula) responde 201 con eca null',
      async (rol) => {
        expect((await alta({ usuario: `a-${rol}`, rol }).expect(201)).body.eca).toBeNull();
        expect((await alta({ usuario: `b-${rol}`, rol, eca: '' }).expect(201)).body.eca).toBeNull();
        expect((await alta({ usuario: `c-${rol}`, rol, eca: null }).expect(201)).body.eca).toBeNull();
      },
    );

    it('sigue siendo sólo del Administrador: 401 sin sesión y 403 con otro rol', async () => {
      await usuarios.crear({ usuario: 'rt1', nombre: 'RT', rol: 'rt_calle', passwordHash: hash });
      await http().post('/api/usuarios').send({ usuario: 'x', nombre: 'X', rol: 'eca', eca: ECA, password: PASSWORD }).expect(401);
      const rt = (await ingresar('rt1')).body.accessToken;
      await http().post('/api/usuarios').set('Authorization', `Bearer ${rt}`)
        .send({ usuario: 'x', nombre: 'X', rol: 'eca', eca: ECA, password: PASSWORD }).expect(403);
    });
  });

  describe('Condición 2: login, refresco y /me devuelven la "eca" cuando el usuario tiene una', () => {
    beforeEach(async () => {
      await alta({ usuario: 'eca1', rol: 'eca', eca: ECA }).expect(201);
      await alta({ usuario: 'sec1', rol: 'secretaria' }).expect(201);
    });

    it('el usuario de una ECA la recibe en el login, en el refresco y en /me', async () => {
      const login = await ingresar('eca1').expect(200);
      expect(login.body.usuario).toMatchObject({ rol: 'eca', eca: ECA });

      const cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith('mant_refresh='))!.split(';')[0];
      const refresco = await http().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
      expect(refresco.body.usuario).toMatchObject({ rol: 'eca', eca: ECA });

      const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${refresco.body.accessToken}`).expect(200);
      expect(me.body).toMatchObject({ usuario: 'eca1', rol: 'eca', eca: ECA });
    });

    it('un usuario sin ECA recibe eca null en el login y en /me', async () => {
      const login = await ingresar('sec1').expect(200);
      expect(login.body.usuario.eca).toBeNull();
      const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
      expect(me.body.eca).toBeNull();
    });
  });

  describe('Condición 3: el guard deja la ECA en la petición, leída de la base en cada pedido', () => {
    it('AuthService.autenticar (lo que usa el guard) devuelve la ECA; cambiarla vale en el pedido siguiente con el mismo token', async () => {
      await alta({ usuario: 'eca1', rol: 'eca', eca: ECA }).expect(201);
      const token = (await ingresar('eca1').expect(200)).body.accessToken as string;
      const servicio = app.get(AuthService);

      expect(await servicio.autenticar(token)).toMatchObject({ usuario: 'eca1', rol: 'eca', eca: ECA });

      const guardado = await usuarios.buscarPorUsuario('eca1');
      usuarios.usuarios.get(guardado!.id)!.eca = 'Otra Conservadora S.A.';
      reloj.adelantarSegundos(60); // el token (15 min) sigue vigente

      expect(await servicio.autenticar(token)).toMatchObject({ eca: 'Otra Conservadora S.A.' });
      const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(me.body.eca).toBe('Otra Conservadora S.A.');
    });

    it('un usuario de otro rol llega a la petición con eca null', async () => {
      await alta({ usuario: 'rt1', rol: 'rt_calle' }).expect(201);
      const token = (await ingresar('rt1').expect(200)).body.accessToken as string;
      expect(await app.get(AuthService).autenticar(token)).toMatchObject({ rol: 'rt_calle', eca: null });
    });
  });
});
