import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { InMemoryAvisosRepository } from '../src/avisos/avisos.repository';
import { AvisosService } from '../src/avisos/avisos.service';
import { VENCIMIENTO_ENLACE_MS } from '../src/avisos/avisos.types';
import { InMemoryHistorialWhatsAppRepository } from '../src/whatsapp/historial-whatsapp.repository';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { createTestApp } from './create-test-app';

/** HU-11 / RF-11: los avisos de falla crítica de la bandeja sobreviven a un reinicio de la API (reinicio simulado sobre los mismos repositorios). */

describe('HU-11 RF-11 · Los avisos de la bandeja sobreviven a un reinicio', () => {
  let avisosRepo: InMemoryAvisosRepository;
  let historialRepo: InMemoryHistorialWhatsAppRepository;
  let app: INestApplication;
  let enviados: number;
  let silencio: jest.SpyInstance[];

  const arrancar = async () => {
    ({ app } = await createTestApp(
      {}, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      historialRepo, avisosRepo,
    ));
    app.get(WhatsAppConnectorService).setTransport({ proveedor: 'meta', postMessage: async () => ({ status: 200, providerMessageId: `wamid.RF11.${++enviados}` }) } as never);
  };
  const reiniciar = async () => {
    await app.get(AvisosService).esperarGuardados();
    await app.get(WhatsAppConnectorService).esperarGuardados();
    await app.close();
    await arrancar();
  };
  const http = () => request(app.getHttpServer());
  const informar = async () =>
    (await http().post('/api/fallas-criticas/informes').set('x-rol-de-prueba', 'rt_calle').send({ maquinaId: 'MAQ-CORRIENTES-M1', fallasCriticas: ['BOTON_PARE_FALLA'] }).expect(201)).body.informe.id as string;
  const bandeja = async () => (await http().get('/api/avisos').expect(200)).body as any[];
  const aviso = async (id: string) => (await bandeja()).find((a) => a.alertaId === id);
  const aprobar = (id: string) => http().post(`/api/avisos/${id}/aprobar`).send({});

  beforeEach(async () => {
    silencio = [jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined), jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)];
    avisosRepo = new InMemoryAvisosRepository();
    historialRepo = new InMemoryHistorialWhatsAppRepository();
    enviados = 0;
    await arrancar();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await app?.close();
    silencio.forEach((s) => s.mockRestore());
  });

  it('criterio 1: un aviso «Pendiente de revisión» sigue pendiente en la bandeja después de reiniciar y se puede aprobar', async () => {
    const id = await informar();
    const antes = await aviso(id);
    expect(antes.estado).toBe('Pendiente de revisión');

    await reiniciar();

    expect(await aviso(id)).toEqual(antes);
    const aprobado = (await aprobar(id).expect(201)).body;
    expect(aprobado.estado).toBe('Enviado');
    expect(enviados).toBe(2); // WhatsApp a la ECA y al Firmante
  });

  it('criterio 2: el enlace sigue abriendo el informe después de reiniciar y vence a los 7 días de emitido, no del reinicio', async () => {
    const id = await informar();
    const aprobado = (await aprobar(id).expect(201)).body;
    const ruta = new URL(aprobado.enlace).pathname;
    const vence = Date.parse(aprobado.enlaceVenceEn);

    await reiniciar();

    const abierto = await http().get(ruta).expect(200);
    expect(abierto.text).toContain('Botón de PARE');
    expect((await aviso(id)).enlaceVenceEn).toBe(aprobado.enlaceVenceEn);
    // Un minuto antes de vencer sigue abriendo; un minuto después ya no, aunque la API se haya reiniciado hace un rato.
    const ahora = jest.spyOn(Date, 'now');
    ahora.mockReturnValue(vence - 60_000);
    await http().get(ruta).expect(200);
    ahora.mockReturnValue(vence + 60_000);
    const vencido = await http().get(ruta);
    expect(vencido.status).not.toBe(200);
    expect(vence - Date.parse(aprobado.aprobadoEn)).toBeLessThanOrEqual(VENCIMIENTO_ENLACE_MS + 5_000);
  });

  it('criterio 3: un aviso ya aprobado y enviado no se vuelve a enviar después de reiniciar y conserva el estado de cada envío', async () => {
    const id = await informar();
    const aprobado = (await aprobar(id).expect(201)).body;
    await reiniciar();

    const despues = await aviso(id);
    expect(despues.estado).toBe('Enviado');
    expect(despues.envios).toEqual(aprobado.envios);
    await aprobar(id).expect(409);
    expect(enviados).toBe(2);
  });

  it('un aviso que falló y se reintenta después del reinicio manda sólo lo que no salió', async () => {
    const id = await informar();
    app.get(WhatsAppConnectorService).setTransport({ proveedor: 'meta', postMessage: async () => ({ status: 500, body: { error: { message: 'caído' } } }) } as never);
    expect((await aprobar(id).expect(201)).body.estado).toBe('Falló el envío');

    await reiniciar();

    const r = (await aprobar(id).expect(201)).body;
    expect(r.estado).toBe('Enviado');
    expect(r.aprobadoPor).toBeTruthy();
    expect(enviados).toBe(2);
  });

  it('un aviso que el proveedor informó como fallido después de enviado sigue «Falló el envío» tras reiniciar (RF-14 + RF-12)', async () => {
    const id = await informar();
    const aprobado = (await aprobar(id).expect(201)).body;
    const wamid = aprobado.envios.find((e: any) => e.canal === 'whatsapp_eca').idMensaje;
    app.get(WhatsAppConnectorService).registrarEventoProveedor(wamid, { estado: 'fallido', codigoError: '131026' });
    expect((await aviso(id)).estado).toBe('Falló el envío');
    await reiniciar();
    expect((await aviso(id)).estado).toBe('Falló el envío');
  });

  it('varios reinicios no duplican avisos y conservan el orden', async () => {
    const ids = [await informar(), await informar(), await informar()];
    await reiniciar();
    await reiniciar();
    const lista = (await bandeja()).map((a) => a.alertaId);
    expect(lista).toEqual(ids);
    expect(avisosRepo.avisos.size).toBe(3);
  });

  it('si la base no responde, el aviso queda en memoria y la bandeja sigue funcionando', async () => {
    avisosRepo.errorAlGuardar = new Error('base caída');
    const id = await informar();
    expect((await aviso(id)).estado).toBe('Pendiente de revisión');
    expect((await aprobar(id).expect(201)).body.estado).toBe('Enviado');
    expect(avisosRepo.avisos.size).toBe(0);
  });
});
