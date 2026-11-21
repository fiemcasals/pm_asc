import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { AvisosService } from '../src/avisos/avisos.service';
import { InMemoryAvisosRepository } from '../src/avisos/avisos.repository';
import { InMemoryFallasCriticasRepository } from '../src/fallas-criticas/fallas-criticas.repository';
import { FallasCriticasService } from '../src/fallas-criticas/fallas-criticas.service';
import { InMemoryParadasRepository } from '../src/paradas/paradas.repository';
import { ParadasService } from '../src/paradas/paradas.service';
import { InMemoryHistorialWhatsAppRepository } from '../src/whatsapp/historial-whatsapp.repository';
import { createTestApp } from './create-test-app';

/** HU-06 / RF-08: los informes de falla crítica y el estado del ascensor sobreviven a un reinicio (reinicio simulado sobre los mismos repositorios). */

const MAQUINA = 'MAQ-CORRIENTES-M1'; // de la Firmante de ejemplo «gonza»
const FOTO = 'data:image/jpeg;base64,AAAA';

describe('HU-06 RF-08 · Los informes de falla crítica sobreviven a un reinicio', () => {
  let fallas: InMemoryFallasCriticasRepository;
  let avisos: InMemoryAvisosRepository;
  let paradas: InMemoryParadasRepository;
  let historial: InMemoryHistorialWhatsAppRepository;
  let app: INestApplication;
  let silencio: jest.SpyInstance;

  const arrancar = async () => {
    ({ app } = await createTestApp(
      {}, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      historial, avisos, paradas, fallas,
    ));
  };
  const reiniciar = async () => {
    await app.get(FallasCriticasService).esperarGuardados();
    await app.get(AvisosService).esperarGuardados();
    await app.get(ParadasService).esperarGuardados();
    await app.close();
    await arrancar();
  };
  const http = () => request(app.getHttpServer());
  const informar = (clientReportId?: string) =>
    http().post('/api/fallas-criticas/informes').set('x-rol-de-prueba', 'rt_calle').send({ maquinaId: MAQUINA, fallasCriticas: ['BOTON_PARE_FALLA'], ...(clientReportId ? { clientReportId } : {}) });
  const panel = async (rol = 'secretaria') => (await http().get('/api/fallas-criticas/informes').set('x-rol-de-prueba', rol).expect(200)).body as any[];
  const bandeja = async () => (await http().get('/api/avisos').expect(200)).body as any[];

  beforeEach(async () => {
    silencio = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    fallas = new InMemoryFallasCriticasRepository();
    avisos = new InMemoryAvisosRepository();
    paradas = new InMemoryParadasRepository();
    historial = new InMemoryHistorialWhatsAppRepository();
    await arrancar();
  });
  afterEach(async () => {
    await app?.close();
    silencio.mockRestore();
  });

  it('criterio 1: el informe y su alerta siguen visibles después de reiniciar (panel de la Secretaría, informe y aviso de la bandeja)', async () => {
    const r = (await informar('cel-1').expect(201)).body;
    expect(r.eventoEmitido).toBe(true);
    const id = r.informe.id;

    await reiniciar();

    expect((await panel()).map((e) => e.informeId)).toContain(id);
    await http().get(`/api/fallas-criticas/informes/${id}`).set('x-rol-de-prueba', 'secretaria').expect(200);
    expect(app.get(FallasCriticasService).obtenerInforme(id)).toMatchObject({ id, maquinaId: MAQUINA, clientReportId: 'cel-1' });
    expect((await bandeja()).map((a) => a.alertaId)).toContain(id);
  });

  it('criterio 2: el mismo informe reintentado después del reinicio no se duplica ni vuelve a avisar', async () => {
    const r = (await informar('cel-2').expect(201)).body;
    await reiniciar();
    const eventos: unknown[] = [];
    const sub = app.get(FallasCriticasService).eventos$().subscribe((e) => eventos.push(e));

    const otraVez = (await informar('cel-2').expect(201)).body;

    sub.unsubscribe();
    expect(otraVez.informe.id).toBe(r.informe.id);
    expect(otraVez.eventoEmitido).toBe(false);
    expect(eventos).toEqual([]);
    expect((await panel()).filter((e) => e.informeId === r.informe.id)).toHaveLength(1);
    expect((await bandeja()).filter((a) => a.alertaId === r.informe.id)).toHaveLength(1);
    expect(fallas.informes.size).toBe(1);
  });

  it('al arrancar no se vuelven a emitir los eventos de los informes guardados', async () => {
    await informar('cel-3').expect(201);
    await app.get(FallasCriticasService).esperarGuardados();
    await app.close();
    const eventos: unknown[] = [];
    await arrancar();
    const sub = app.get(FallasCriticasService).eventos$().subscribe((e) => eventos.push(e));
    await new Promise((r) => setTimeout(r, 50));
    sub.unsubscribe();
    expect(eventos).toEqual([]);
    expect(await bandeja()).toHaveLength(1);
  });

  it('quién abrió la alerta primero también sobrevive al reinicio', async () => {
    const id = (await informar().expect(201)).body.informe.id;
    await http().post(`/api/fallas-criticas/informes/${id}/abrir`).set('x-rol-de-prueba', 'secretaria').expect(200);
    await reiniciar();
    const abierta = (await http().post(`/api/fallas-criticas/informes/${id}/abrir`).set('x-rol-de-prueba', 'secretaria').expect(200)).body;
    expect(abierta).toMatchObject({ abiertaPor: 'test-dev', primera: false });
  });

  it('criterio 3: el estado del ascensor marcado por el RT y confirmado por el Firmante se mantiene después de reiniciar', async () => {
    const p = (await http().post('/api/paradas').set('x-rol-de-prueba', 'rt_calle').send({ maquinaId: MAQUINA, estado: 'Reparación Urgente', causa: 'Freno', fotos: [FOTO] }).expect(201)).body;
    await app.get(ParadasService).resolver(p.id, 'confirmar', { usuario: 'gonza', rol: 'firmante' });
    await reiniciar();
    const reportes = (await http().get('/api/paradas').set('x-rol-de-prueba', 'secretaria').expect(200)).body as any[];
    expect(reportes[0]).toMatchObject({ confirmacion: 'Confirmado', estadoMarcado: 'Reparación Urgente' });
  });

  it('criterio 4: un Firmante sigue viendo sólo las alertas de sus edificios después de reiniciar', async () => {
    const id = (await informar().expect(201)).body.informe.id;
    await reiniciar();
    const otroFirmante = await http().get('/api/fallas-criticas/informes').set('x-rol-de-prueba', 'firmante').expect(200);
    expect((otroFirmante.body as any[]).map((e) => e.informeId)).not.toContain(id); // la sesión de prueba («test-dev») no es «gonza»
    const ajena = await http().post(`/api/fallas-criticas/informes/${id}/abrir`).set('x-rol-de-prueba', 'firmante');
    expect(ajena.status).toBe(403);
  });

  it('si la base no responde, el informe queda registrado en memoria y el aviso sale igual', async () => {
    fallas.errorAlGuardar = new Error('base caída');
    const r = (await informar('cel-4').expect(201)).body;
    await app.get(FallasCriticasService).esperarGuardados();
    expect((await panel()).map((e) => e.informeId)).toContain(r.informe.id);
    expect(fallas.informes.size).toBe(0);
  });
});
