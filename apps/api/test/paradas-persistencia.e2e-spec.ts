import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { InMemoryParadasRepository } from '../src/paradas/paradas.repository';
import { ParadasService } from '../src/paradas/paradas.service';
import { createTestApp } from './create-test-app';

/** HU-17 / RF-09: los reportes de parada sobreviven a un reinicio de la API (reinicio simulado sobre el mismo repositorio). */

const MAQUINA = 'MAQ-CORRIENTES-M1'; // de la Firmante de ejemplo «gonza», ECA «Conservación Porteña S.R.L.»
const FOTO = 'data:image/jpeg;base64,AAAA';

describe('HU-17 RF-09 · Los reportes de parada sobreviven a un reinicio', () => {
  let repo: InMemoryParadasRepository;
  let app: INestApplication;
  let silencio: jest.SpyInstance;

  const arrancar = async () => {
    ({ app } = await createTestApp(
      {}, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, repo,
    ));
  };
  const reiniciar = async () => {
    await app.get(ParadasService).esperarGuardados();
    await app.close();
    await arrancar();
  };
  const http = () => request(app.getHttpServer());
  const reportar = (extra: Record<string, unknown> = {}) =>
    http().post('/api/paradas').set('x-rol-de-prueba', 'rt_calle').send({ maquinaId: MAQUINA, estado: 'Fuera de Servicio', causa: 'Cabina trabada', fotos: [FOTO], ...extra });
  const reportes = async () => (await http().get('/api/paradas').expect(200)).body as any[];
  const maquinaEca = async () => {
    const res = await http().get('/api/eca/maquinas').set('x-rol-de-prueba', 'secretaria').expect(200);
    return (res.body as any[]).find((m) => m.id === MAQUINA);
  };

  beforeEach(async () => {
    silencio = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    repo = new InMemoryParadasRepository();
    await arrancar();
  });
  afterEach(async () => {
    await app?.close();
    silencio.mockRestore();
  });

  it('criterio 1: el reporte sigue visible después de reiniciar, y el equipo sigue «Fuera de Servicio» para la ECA', async () => {
    const r = (await reportar().expect(201)).body;
    const antes = await maquinaEca();
    expect(antes.estadoOperativo).toBe('Fuera de Servicio');

    await reiniciar();

    expect(await reportes()).toEqual([r]);
    expect((await maquinaEca()).estadoOperativo).toBe('Fuera de Servicio');
  });

  it('criterio 2: el mismo reporte reintentado por el celular después del reinicio no se duplica', async () => {
    const r = (await reportar({ clientReportId: 'cel-rt1-0001' }).expect(201)).body;
    await reiniciar();

    const otraVez = (await reportar({ clientReportId: 'cel-rt1-0001' }).expect(201)).body;

    expect(otraVez.id).toBe(r.id);
    expect(await reportes()).toHaveLength(1);
    expect(repo.reportes.size).toBe(1);
  });

  it('el reintento sin reinicio tampoco duplica; un reporte nuevo del mismo equipo pendiente sigue dando 409', async () => {
    const r = (await reportar({ clientReportId: 'cel-rt1-0002' }).expect(201)).body;
    expect((await reportar({ clientReportId: 'cel-rt1-0002' }).expect(201)).body.id).toBe(r.id);
    await reportar({ clientReportId: 'cel-rt1-0003' }).expect(409);
  });

  it('la confirmación del Firmante y la vuelta a Normal también sobreviven al reinicio', async () => {
    const r = (await reportar().expect(201)).body;
    // Las pruebas sin usuarios propios entran como «test-dev»: el Firmante asignado («gonza») confirma desde el servicio.
    await app.get(ParadasService).resolver(r.id, 'confirmar', { usuario: 'gonza', rol: 'firmante' });
    await reiniciar();
    expect((await reportes())[0].confirmacion).toBe('Confirmado');
    expect((await maquinaEca()).estadoOperativo).toBe('Fuera de Servicio');

    await http().post(`/api/paradas/maquinas/${MAQUINA}/normalizar`).set('x-rol-de-prueba', 'rt_calle').send({ fotos: [FOTO] }).expect(200);
    await reiniciar();
    expect((await maquinaEca()).estadoOperativo).toBe('Normal');
    expect((await reportes())[0].normalizadoEn).toEqual(expect.any(String));
  });

  it('un rechazo sobrevive al reinicio y el equipo sigue normal', async () => {
    const r = (await reportar().expect(201)).body;
    await app.get(ParadasService).resolver(r.id, 'rechazar', { usuario: 'gonza', rol: 'firmante' }, 'Falsa alarma');
    await reiniciar();
    expect((await reportes())[0]).toMatchObject({ confirmacion: 'Rechazado', motivoRechazo: 'Falsa alarma' });
    expect((await maquinaEca()).estadoOperativo).toBe('Normal');
  });

  it('si la base no responde, el reporte no se da por hecho: 500 y el equipo sigue como estaba', async () => {
    repo.errorAlGuardar = new Error('base caída');
    await reportar().expect(500);
    expect(await reportes()).toEqual([]);
    expect((await maquinaEca()).estadoOperativo).not.toBe('Fuera de Servicio');
  });

  it('si la base no responde al confirmar, la decisión no se da por hecha y se puede reintentar', async () => {
    const r = (await reportar().expect(201)).body;
    repo.errorAlGuardar = new Error('base caída');
    await expect(app.get(ParadasService).resolver(r.id, 'confirmar', { usuario: 'gonza', rol: 'firmante' })).rejects.toThrow('base caída');
    expect((await reportes())[0].confirmacion).toBe('Pendiente de confirmación');
    repo.errorAlGuardar = null;
    expect((await app.get(ParadasService).resolver(r.id, 'confirmar', { usuario: 'gonza', rol: 'firmante' })).confirmacion).toBe('Confirmado');
  });
});
