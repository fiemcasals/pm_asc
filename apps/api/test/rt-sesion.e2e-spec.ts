import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { createTestApp } from './create-test-app';
import { NombreSesion, USUARIO_DE, bearer, crearSesiones } from './sesiones-e2e';

jest.setTimeout(30_000);

// HU-06 RF-06 — RT con sesión: fallas críticas y checklist solo para quien corresponde.
const MAQUINA = 'MAQ-CORRIENTES-M1';
const informe = (extra: Record<string, unknown> = {}) => ({ maquinaId: MAQUINA, fallasCriticas: ['BOTON_PARE_FALLA'], ...extra });
const inspeccion = () => ({
  consorcioId: '11111111-1111-4111-8111-111111111111',
  maquinaId: '22222222-2222-4222-8222-222222222222',
  referenciaAgc: 'm1',
  tipoMaquina: 'hidraulico',
  estadoEquipo: 'en_uso',
  datos: {},
});

describe('RT con sesión: fallas críticas y checklist (HU-06 RF-06)', () => {
  let app: INestApplication;
  let tokens: Record<NombreSesion, string>;
  const http = () => request(app.getHttpServer());
  const get = (ruta: string, sesion: NombreSesion) => http().get(ruta).set('Authorization', bearer(tokens[sesion]));
  const post = (ruta: string, sesion: NombreSesion) => http().post(ruta).set('Authorization', bearer(tokens[sesion]));
  /** Cuántos informes de falla crítica hay, vistos por la Secretaría. */
  const cantidadDeInformes = async () => (await get('/api/fallas-criticas/informes', 'secretaria').expect(200)).body.length as number;

  // Una app nueva por prueba: cada una parte sin informes de falla crítica.
  beforeEach(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'test' }, undefined, undefined, undefined, { usuarios }));
    tokens = await crearSesiones(app, usuarios);
  });
  afterEach(async () => {
    await app?.close();
  });

  describe('criterio 1: sin sesión, 401', () => {
    it.each([
      ['POST', '/api/fallas-criticas/informes'],
      ['GET', '/api/checklist/config?tipo=traccion'],
      ['POST', '/api/checklist/inspecciones'],
      ['GET', '/api/checklist/inspecciones/11111111-1111-4111-8111-111111111111'],
    ])('%s %s sin Authorization → 401', async (metodo, ruta) => {
      const res = await (metodo === 'GET' ? http().get(ruta) : http().post(ruta).send(informe({ inspector: 'intruso' })));

      expect(res.status).toBe(401);
    });

    it('con un token inventado también → 401', async () => {
      expect((await http().post('/api/fallas-criticas/informes').set('Authorization', 'Bearer abc.def.ghi').send(informe())).status).toBe(401);
      expect((await http().get('/api/checklist/config').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
    });

    it('sin sesión no se registra ninguna falla crítica, ni dispara el aviso a la Secretaría', async () => {
      await http().post('/api/fallas-criticas/informes').send(informe({ inspector: 'intruso' }));

      expect(await cantidadDeInformes()).toBe(0);
    });
  });

  describe('criterio 2: solo el RT registra y crea; el resto de los roles, 403', () => {
    it('el RT registra la falla crítica (201) y se ve en la lista de la Secretaría', async () => {
      const res = await post('/api/fallas-criticas/informes', 'rt_calle').send(informe());

      expect(res.status).toBe(201);
      expect(res.body.eventoEmitido).toBe(true);
      expect(await cantidadDeInformes()).toBe(1);
    });

    it.each([['secretaria'], ['administrador'], ['firmante'], ['ecaPortena']] as [NombreSesion][])('%s no registra fallas críticas: 403 y no queda nada', async (sesion) => {
      const res = await post('/api/fallas-criticas/informes', sesion).send(informe());

      expect(res.status).toBe(403);
      expect(await cantidadDeInformes()).toBe(0);
    });

    it('el RT crea una inspección del checklist (201); los demás roles, 403', async () => {
      expect((await post('/api/checklist/inspecciones', 'rt_calle').send(inspeccion())).status).toBe(201);
      for (const sesion of ['secretaria', 'administrador', 'firmante', 'ecaPortena'] as NombreSesion[]) {
        expect([sesion, (await post('/api/checklist/inspecciones', sesion).send(inspeccion())).status]).toEqual([sesion, 403]);
      }
    });

    it.each([['rt_calle'], ['secretaria'], ['administrador'], ['firmante']] as [NombreSesion][])('%s lee la configuración del checklist (200)', async (sesion) => {
      const res = await get('/api/checklist/config?tipo=traccion', sesion);

      expect(res.status).toBe(200);
      expect(res.body.solapas.length).toBeGreaterThan(0);
    });

    it('la ECA no lee la configuración ni las inspecciones del checklist (403)', async () => {
      expect((await get('/api/checklist/config', 'ecaPortena')).status).toBe(403);
      expect((await get('/api/checklist/inspecciones/11111111-1111-4111-8111-111111111111', 'ecaPortena')).status).toBe(403);
    });

    it.each([['rt_calle'], ['secretaria'], ['administrador'], ['firmante']] as [NombreSesion][])('%s puede leer una inspección (404 si no existe, no 403)', async (sesion) => {
      expect((await get('/api/checklist/inspecciones/11111111-1111-4111-8111-111111111111', sesion)).status).toBe(404);
    });
  });

  describe('criterio 3: el inspector es el usuario de la sesión', () => {
    it('lo que venga como inspector en el cuerpo se ignora', async () => {
      const res = await post('/api/fallas-criticas/informes', 'rt_calle').send(informe({ inspector: 'otra.persona' }));

      expect(res.status).toBe(201);
      expect(res.body.informe.inspector).toBe(USUARIO_DE.rt_calle);
      const lista = (await get('/api/fallas-criticas/informes', 'secretaria').expect(200)).body;
      expect(lista[0].inspector).toBe(USUARIO_DE.rt_calle);
    });

    it('el cuerpo ya no necesita traer el inspector', async () => {
      const res = await post('/api/fallas-criticas/informes', 'rt_calle').send(informe());

      expect(res.status).toBe(201);
      expect(res.body.informe.inspector).toBe(USUARIO_DE.rt_calle);
    });

    it('un cuerpo inválido sigue dando 400 con el detalle (sin pedir el inspector)', async () => {
      const res = await post('/api/fallas-criticas/informes', 'rt_calle').send({ maquinaId: MAQUINA });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('cablesDesgastados tiene que ser true o false');
      expect(res.body.message).not.toContain('inspector es obligatorio');
    });

    it('el reintento de la cola con el mismo identificador devuelve el informe original, no uno nuevo', async () => {
      const cuerpo = informe({ clientReportId: 'rep-rt-sesion-0001', inspector: 'otro' });
      const primero = await post('/api/fallas-criticas/informes', 'rt_calle').send(cuerpo);
      const segundo = await post('/api/fallas-criticas/informes', 'rt_calle').send(cuerpo);

      expect(segundo.body.informe.id).toBe(primero.body.informe.id);
      expect(segundo.body.eventoEmitido).toBe(false);
      expect(await cantidadDeInformes()).toBe(1);
    });
  });
});
