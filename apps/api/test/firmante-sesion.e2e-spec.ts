import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { FirmanteService } from '../src/firmante/firmante.service';
import { createTestApp } from './create-test-app';
import { NombreSesion, USUARIO_DE, bearer, crearSesiones } from './sesiones-e2e';

jest.setTimeout(30_000);

// HU-08 RF-04 — Portal del Firmante con sesión: cada Firmante ve y firma solo lo suyo.
// «gonza» es el Firmante de todas las máquinas de los datos de demostración; «firmanteOtro» no tiene ninguna.
const M1 = 'MAQ-CORRIENTES-M1'; // recorrida, con fotos y firma del encargado: se puede autorizar o rechazar

describe('Portal del Firmante con sesión (HU-08 RF-04)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;
  const http = () => request(app.getHttpServer());
  const get = (ruta: string, sesion: NombreSesion) => http().get(ruta).set('Authorization', bearer(tokens[sesion]));
  const post = (ruta: string, sesion: NombreSesion) => http().post(ruta).set('Authorization', bearer(tokens[sesion]));
  const maquinasDe = async (sesion: NombreSesion, query = '') => (await get(`/api/firmante/maquinas${query}`, sesion).expect(200)).body as { id: string; firmanteUsername: string; visita: { autorizada: boolean; rechazada?: boolean } | null }[];
  /** El estado de la máquina M1, visto por la Secretaría (que ve las de todos). */
  const estadoM1 = async () => (await maquinasDe('secretaria')).find((m) => m.id === M1)!.visita!;

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
  });
  beforeEach(() => {
    app.get(FirmanteService).resetSeed();
  });
  afterAll(async () => {
    await app?.close();
  });

  describe('criterio 1: sin sesión, 401', () => {
    it.each([
      ['GET', '/api/firmante/maquinas'],
      ['POST', '/api/firmante/autorizar'],
      ['POST', '/api/firmante/rechazar'],
    ])('%s %s sin Authorization → 401', async (metodo, ruta) => {
      const res = await (metodo === 'GET' ? http().get(ruta) : http().post(ruta).send({ maquinaId: M1, motivo: 'x' }));

      expect(res.status).toBe(401);
    });

    it('con un token inventado también → 401', async () => {
      expect((await http().get('/api/firmante/maquinas').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
      expect((await http().post('/api/firmante/autorizar').set('Authorization', 'Bearer abc.def.ghi').send({ maquinaId: M1 })).status).toBe(401);
    });

    it('sin sesión no se autoriza ni se rechaza nada, aunque la URL, el cuerpo o los headers traigan un usuario', async () => {
      await http().post('/api/firmante/autorizar').set('x-user-name', 'gonza').set('x-user-id', 'USR-1793292123166').send({ maquinaId: M1 });
      await http().post('/api/firmante/rechazar').set('x-user-name', 'gonza').send({ maquinaId: M1, motivo: 'intruso' });

      expect(await estadoM1()).toMatchObject({ autorizada: false });
      expect((await estadoM1()).rechazada).toBeFalsy();
    });
  });

  describe('criterio 2: un Firmante ve y firma solo lo suyo', () => {
    it('un Firmante ve sus máquinas, aunque pida las de otro por header o por parámetro', async () => {
      const propias = await maquinasDe('firmante');
      const pidiendoOtro = (await get('/api/firmante/maquinas?firmante=otro.firmante@e2e', 'firmante').set('x-user-name', 'otro.firmante@e2e').set('x-user-id', 'USR-OTRO').expect(200)).body;

      expect(propias.length).toBeGreaterThan(0);
      expect(propias.every((m) => m.firmanteUsername === 'gonza')).toBe(true);
      expect(pidiendoOtro).toEqual(propias);
    });

    it('un Firmante sin máquinas asignadas no ve ninguna', async () => {
      expect(await maquinasDe('firmanteOtro')).toEqual([]);
    });

    it('cada Firmante ve solo las suyas cuando se reparten las máquinas', async () => {
      app.get(FirmanteService).getMaquinas().find((m) => m.id === M1)!.firmanteUsername = USUARIO_DE.firmanteOtro;

      expect((await maquinasDe('firmanteOtro')).map((m) => m.id)).toEqual([M1]);
      expect((await maquinasDe('firmante')).map((m) => m.id)).not.toContain(M1);
    });

    it('no se puede autorizar ni rechazar la máquina de otro Firmante: 404, igual al de una máquina inexistente, y no cambia nada', async () => {
      const autorizar = await post('/api/firmante/autorizar', 'firmanteOtro').send({ maquinaId: M1 });
      const rechazar = await post('/api/firmante/rechazar', 'firmanteOtro').send({ maquinaId: M1, motivo: 'no es mío' });
      const inexistente = await post('/api/firmante/autorizar', 'firmanteOtro').send({ maquinaId: 'MAQ-NO-EXISTE' });

      expect([autorizar.status, rechazar.status, inexistente.status]).toEqual([404, 404, 404]);
      expect(autorizar.body.message).toBe(inexistente.body.message);
      expect(rechazar.body.message).toBe(inexistente.body.message);
      expect(await estadoM1()).toMatchObject({ autorizada: false });
      expect((await estadoM1()).rechazada).toBeFalsy();
    });

    it('tampoco por el id de la visita', async () => {
      const visitaId = (await estadoM1() as unknown as { id: string }).id;

      expect((await post('/api/firmante/autorizar', 'firmanteOtro').send({ visitaId })).status).toBe(404);
      expect((await post('/api/firmante/rechazar', 'firmanteOtro').send({ visitaId, motivo: 'x' })).status).toBe(404);
    });

    it('el dueño sí puede: autoriza lo suyo', async () => {
      expect((await post('/api/firmante/autorizar', 'firmante').send({ maquinaId: M1 })).status).toBe(200);

      expect(await estadoM1()).toMatchObject({ autorizada: true });
    });
  });

  describe('criterio 3: Secretaría y Administrador ven todo pero no autorizan; RT y ECA, 403', () => {
    it.each([['secretaria'], ['administrador']] as [NombreSesion][])('%s ve las máquinas de todos los Firmantes, o las del que elija', async (sesion) => {
      const todas = await maquinasDe(sesion);

      expect(todas.length).toBe((await maquinasDe('firmante')).length);
      expect((await maquinasDe(sesion, '?firmante=gonza')).length).toBe(todas.length);
      expect(await maquinasDe(sesion, '?firmante=otro.firmante@e2e')).toEqual([]);
      expect((await maquinasDe(sesion, '?mes=2025-01'))).toEqual([]);
    });

    it.each([['secretaria'], ['administrador'], ['rt_calle'], ['ecaPortena']] as [NombreSesion][])('%s no autoriza ni rechaza: 403 y no cambia nada', async (sesion) => {
      expect((await post('/api/firmante/autorizar', sesion).send({ maquinaId: M1 })).status).toBe(403);
      expect((await post('/api/firmante/rechazar', sesion).send({ maquinaId: M1, motivo: 'x' })).status).toBe(403);

      expect(await estadoM1()).toMatchObject({ autorizada: false });
      expect((await estadoM1()).rechazada).toBeFalsy();
    });

    it.each([['rt_calle'], ['ecaPortena']] as [NombreSesion][])('%s tampoco ve las máquinas del Firmante: 403', async (sesion) => {
      expect((await get('/api/firmante/maquinas', sesion)).status).toBe(403);
    });
  });

  describe('criterio 4: la autorización y el rechazo quedan a nombre del usuario de la sesión', () => {
    beforeEach(() => {
      // La máquina pasa a «firmanteOtro»: así la identidad de la sesión se distingue del «gonza» que el sistema usaba por defecto.
      app.get(FirmanteService).getMaquinas().find((m) => m.id === M1)!.firmanteUsername = USUARIO_DE.firmanteOtro;
    });

    it('autorizar: queda el usuario de la sesión, no el de un header ni el de «gonza»', async () => {
      const res = await post('/api/firmante/autorizar', 'firmanteOtro').set('x-user-name', 'gonza').set('x-user-id', 'USR-1793292123166').send({ maquinaId: M1, firmante: 'gonza' });

      expect(res.status).toBe(200);
      expect(res.body.autorizacion.autorizadoPor).toBe(USUARIO_DE.firmanteOtro);
      expect((await maquinasDe('firmanteOtro'))[0].visita).toMatchObject({ autorizada: true, autorizadoPor: USUARIO_DE.firmanteOtro });
    });

    it('rechazar: queda el usuario de la sesión, no el de un header ni el de «gonza»', async () => {
      const res = await post('/api/firmante/rechazar', 'firmanteOtro').set('x-user-name', 'gonza').send({ maquinaId: M1, motivo: 'Falta la foto de cables' });

      expect(res.status).toBe(200);
      expect(res.body.rechazo.rechazadoPor).toBe(USUARIO_DE.firmanteOtro);
      expect((await maquinasDe('firmanteOtro'))[0].visita).toMatchObject({ rechazada: true, rechazadoPor: USUARIO_DE.firmanteOtro });
    });

    it('el Firmante anterior («gonza») ya no puede firmarla: dejó de ser suya', async () => {
      expect((await post('/api/firmante/autorizar', 'firmante').send({ maquinaId: M1 })).status).toBe(404);
    });
  });
});
