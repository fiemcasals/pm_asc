import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { FallasCriticasService } from '../src/fallas-criticas/fallas-criticas.service';
import { FirmanteService } from '../src/firmante/firmante.service';
import { createTestApp } from './create-test-app';
import { NombreSesion, USUARIO_DE, bearer, crearSesiones } from './sesiones-e2e';
import { CanalAbierto, abrirCanal } from './sse-cliente';

jest.setTimeout(30_000);

// HU-06 RF-07 — Canal en tiempo real de fallas críticas con sesión.
// M1 se le reasigna a otro Firmante; M2 sigue siendo de «gonza» (el Firmante de todas las máquinas de los datos de demostración).
const M1 = 'MAQ-CORRIENTES-M1';
const M2 = 'MAQ-CORRIENTES-M2';

describe('Canal en tiempo real de fallas críticas con sesión (HU-06 RF-07)', () => {
  let app: INestApplication;
  let port: number;
  let tokens: Record<NombreSesion, string>;
  let usuarios: InMemoryUsuariosRepository;
  let abiertos: CanalAbierto[] = [];

  const levantar = async (env: NodeJS.ProcessEnv = { NODE_ENV: 'test' }) => {
    usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp(env, undefined, undefined, undefined, { usuarios }));
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    tokens = await crearSesiones(app, usuarios);
    app.get(FirmanteService).resetSeed();
    app.get(FirmanteService).getMaquinas().find((m) => m.id === M1)!.firmanteUsername = USUARIO_DE.firmanteOtro;
  };
  const canal = async (sesion?: NombreSesion | 'inventado') => {
    const token = sesion === undefined ? undefined : sesion === 'inventado' ? 'token.inventado.x' : tokens[sesion];
    const c = await abrirCanal(port, token);
    abiertos.push(c);
    return c;
  };
  const registrar = async (maquinaId: string) =>
    (
      await request(app.getHttpServer())
        .post('/api/fallas-criticas/informes')
        .set('Authorization', bearer(tokens.rt_calle))
        .send({ maquinaId, fallasCriticas: ['BOTON_PARE_FALLA'], observaciones: 'prueba del canal' })
        .expect(201)
    ).body.informe.id as string;
  const abrirAlerta = (id: string, sesion: NombreSesion = 'secretaria') =>
    request(app.getHttpServer()).post(`/api/fallas-criticas/informes/${id}/abrir`).set('Authorization', bearer(tokens[sesion])).expect(200);
  const idsDe = (c: CanalAbierto, tipo: string) => c.mensajes.filter((m) => m.event === tipo).map((m) => (m.data as { informeId: string }).informeId);

  afterEach(async () => {
    abiertos.forEach((c) => c.cerrar());
    abiertos = [];
    await app?.close();
  });

  describe('criterio 1: sin sesión, 401', () => {
    beforeEach(() => levantar());

    it('sin Authorization responde 401, no abre ningún flujo y no manda nada', async () => {
      const c = await canal();
      expect(c.status).toBe(401);
      expect(c.contentType).not.toContain('text/event-stream');
      await registrar(M1);
      await c.cerrado;
      expect(c.mensajes).toEqual([]);
    });

    it('con un token inventado también responde 401', async () => {
      const c = await canal('inventado');
      expect(c.status).toBe(401);
      expect(c.contentType).not.toContain('text/event-stream');
    });
  });

  describe('criterio 2: la Secretaría, el Administrador y el Firmante entran; el resto, 403', () => {
    beforeEach(() => levantar());

    it.each(['secretaria', 'administrador', 'firmante'] as const)('%s abre el canal (200, flujo de eventos)', async (sesion) => {
      const c = await canal(sesion);
      expect(c.status).toBe(200);
      expect(c.contentType).toContain('text/event-stream');
    });

    it.each(['rt_calle', 'ecaPortena'] as const)('%s recibe 403 y ningún evento', async (sesion) => {
      const c = await canal(sesion);
      expect(c.status).toBe(403);
      expect(c.contentType).not.toContain('text/event-stream');
      await registrar(M1);
      await c.cerrado;
      expect(c.mensajes).toEqual([]);
    });
  });

  describe('criterio 3: el Firmante recibe solo lo de sus edificios', () => {
    beforeEach(() => levantar());

    it('la Secretaría y el Administrador reciben las fallas críticas de todos los Firmantes', async () => {
      const secretaria = await canal('secretaria');
      const admin = await canal('administrador');
      const id1 = await registrar(M1);
      const id2 = await registrar(M2);
      await secretaria.esperar('falla-critica', 2);
      await admin.esperar('falla-critica', 2);
      expect(idsDe(secretaria, 'falla-critica')).toEqual([id1, id2]);
      expect(idsDe(admin, 'falla-critica')).toEqual([id1, id2]);
    });

    it('cada Firmante recibe solo las fallas críticas de sus edificios', async () => {
      const gonza = await canal('firmante');
      const otro = await canal('firmanteOtro');
      const id1 = await registrar(M1); // de «otro»
      const id2 = await registrar(M2); // de «gonza»
      await gonza.esperar('falla-critica', 1);
      await otro.esperar('falla-critica', 1);
      // Llegan en orden: si «gonza» hubiera recibido la de M1, estaría delante de la suya.
      expect(idsDe(gonza, 'falla-critica')).toEqual([id2]);
      expect(idsDe(otro, 'falla-critica')).toEqual([id1]);
      expect((gonza.mensajes[0].data as { firmanteUsername: string }).firmanteUsername).toBe(USUARIO_DE.firmante);
    });

    it('el Firmante se reconoce sin distinguir mayúsculas (igual que en la lista y al abrir una alerta)', async () => {
      const servicio = app.get(FallasCriticasService);
      const recibidos: string[] = [];
      const sub = servicio.eventosPara({ usuario: USUARIO_DE.firmante.toUpperCase(), rol: 'firmante' }).subscribe((e) => recibidos.push(e.informeId));
      const id2 = await registrar(M2);
      sub.unsubscribe();
      expect(recibidos).toEqual([id2]);
    });

    it('las aperturas de alerta también llegan solo a quien ve esa alerta', async () => {
      const secretaria = await canal('secretaria');
      const gonza = await canal('firmante');
      const otro = await canal('firmanteOtro');
      const id1 = await registrar(M1);
      const id2 = await registrar(M2);
      await abrirAlerta(id1);
      await abrirAlerta(id2);
      await secretaria.esperar('falla-abierta', 2);
      await gonza.esperar('falla-abierta', 1);
      await otro.esperar('falla-abierta', 1);
      expect(idsDe(secretaria, 'falla-abierta')).toEqual([id1, id2]);
      expect(idsDe(gonza, 'falla-abierta')).toEqual([id2]);
      expect(idsDe(otro, 'falla-abierta')).toEqual([id1]);
    });

    it('lo que ya se registró antes de conectarse no se repite por el canal (para eso está la lista)', async () => {
      await registrar(M2);
      const c = await canal('secretaria');
      const id1 = await registrar(M1);
      await c.esperar('falla-critica', 1);
      expect(idsDe(c, 'falla-critica')).toEqual([id1]);
    });
  });

  describe('criterio 4: el servidor corta el canal y una sesión revocada no vuelve a entrar', () => {
    it('pasado el plazo el servidor cierra la conexión (y no antes)', async () => {
      await levantar({ NODE_ENV: 'test', CANAL_FALLAS_VIGENCIA_SEG: '1' });
      const inicio = Date.now();
      const c = await canal('secretaria');
      expect(c.status).toBe(200);
      const cerroAntes = await Promise.race([c.cerrado.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 400))]);
      expect(cerroAntes).toBe(false);
      await c.cerrado;
      const duro = Date.now() - inicio;
      expect(duro).toBeGreaterThanOrEqual(900);
      expect(duro).toBeLessThan(5000);
    });

    it('al reabrir con la sesión vigente entra de nuevo; si el Administrador la revocó, responde 401', async () => {
      await levantar({ NODE_ENV: 'test', CANAL_FALLAS_VIGENCIA_SEG: '1' });
      const primera = await canal('secretaria');
      await primera.cerrado;

      const vigente = await canal('secretaria');
      expect(vigente.status).toBe(200);
      await vigente.cerrado;

      const id = (await usuarios.buscarPorUsuario(USUARIO_DE.secretaria))!.id;
      await request(app.getHttpServer()).post(`/api/usuarios/${id}/revocar-sesiones`).set('Authorization', bearer(tokens.administrador)).expect(204);
      const revocada = await canal('secretaria');
      expect(revocada.status).toBe(401);
      expect(revocada.contentType).not.toContain('text/event-stream');
    });
  });
});
