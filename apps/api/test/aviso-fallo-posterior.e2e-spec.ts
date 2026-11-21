import { INestApplication, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { createTestApp } from './create-test-app';

/**
 * HU-11 / RF-14: un aviso «Enviado» cuyo WhatsApp el proveedor informa después como fallido vuelve a «Falló el envío», ofrece reintentar,
 * y al reintentar bien vuelve a «Enviado» conservando el fallo anterior.
 */

const APP_SECRET = 'app-secret-rf14';
const ENV = { WHATSAPP_META_APP_SECRET: APP_SECRET, WHATSAPP_META_VERIFY_TOKEN: 'verify-rf14' };

function cuerpoMeta(id: string, status: string, error?: { code: number; title: string }): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '1', changes: [{ field: 'messages', value: { statuses: [{ id, status, timestamp: '1790000000', ...(error ? { errors: [error] } : {}) }] } }] }],
  });
}

describe('HU-11 RF-14 · El estado del aviso refleja un WhatsApp que falla después de enviado', () => {
  let app: INestApplication;
  let warnSpy: jest.SpyInstance;
  let n = 0;
  let falla = false;

  beforeEach(async () => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    ({ app } = await createTestApp(ENV));
    n = 0;
    falla = false;
    // Proveedor falso estilo Meta: acepta cada envío con un id propio (o lo rechaza si `falla`).
    app.get(WhatsAppConnectorService).setTransport({
      proveedor: 'meta',
      postMessage: async () => (falla ? { status: 500, body: { error: { message: 'caído' } } } : { status: 200, providerMessageId: `wamid.RF14.${++n}` }),
    } as never);
  });
  afterEach(async () => {
    await app?.close();
    warnSpy.mockRestore();
  });

  const http = () => request(app.getHttpServer());
  const informar = async () =>
    (await http().post('/api/fallas-criticas/informes').set('x-rol-de-prueba', 'rt_calle').send({ maquinaId: 'MAQ-CORRIENTES-M1', fallasCriticas: ['BOTON_PARE_FALLA'] }).expect(201)).body.informe.id as string;
  const aviso = async (id: string) => (await http().get(`/api/avisos/${id}`).expect(200)).body;
  const bandeja = async (id: string) => ((await http().get('/api/avisos').expect(200)).body as { alertaId: string }[]).find((a) => a.alertaId === id) as any;
  const avisoProveedor = (idMensaje: string, status: string, error?: { code: number; title: string }) => {
    const cuerpo = cuerpoMeta(idMensaje, status, error);
    const firma = `sha256=${createHmac('sha256', APP_SECRET).update(cuerpo).digest('hex')}`;
    return http().post('/api/whatsapp/webhook/meta').set('Content-Type', 'application/json').set('X-Hub-Signature-256', firma).send(cuerpo).expect(200);
  };
  const idDe = (a: any, canal: string) => a.envios.find((e: any) => e.canal === canal && e.ok)?.idMensaje as string;

  it('cada WhatsApp del aviso guarda el id de mensaje que devolvió el proveedor', async () => {
    const id = await informar();
    const a = (await http().post(`/api/avisos/${id}/aprobar`).send({}).expect(201)).body;
    expect(a.estado).toBe('Enviado');
    expect(idDe(a, 'whatsapp_eca')).toMatch(/^wamid\.RF14\.\d+$/);
    expect(idDe(a, 'whatsapp_firmante')).toMatch(/^wamid\.RF14\.\d+$/);
  });

  it('criterio 1: si el proveedor informa después que un envío falló, la bandeja muestra «Falló el envío» y se puede reintentar', async () => {
    const id = await informar();
    const a = (await http().post(`/api/avisos/${id}/aprobar`).send({}).expect(201)).body;
    const wamidEca = idDe(a, 'whatsapp_eca');

    await avisoProveedor(wamidEca, 'failed', { code: 131026, title: 'Message undeliverable' });

    const enBandeja = await bandeja(id);
    expect(enBandeja.estado).toBe('Falló el envío');
    const envioEca = enBandeja.envios.find((e: any) => e.idMensaje === wamidEca);
    expect(envioEca).toMatchObject({ ok: false, estado: 'fallido' });
    expect(envioEca.motivo).toContain('131026');
    expect(envioEca.falloInformadoEn).toEqual(expect.any(String));
    // El del Firmante no cambió.
    expect(enBandeja.envios.find((e: any) => e.canal === 'whatsapp_firmante')).toMatchObject({ ok: true });
    // «Falló el envío» es el estado con el que la bandeja ofrece «Reintentar envío», y aprobar de nuevo ya no da 409.
    expect((await aviso(id)).estado).toBe('Falló el envío');
  });

  it('criterio 2: al reintentar bien vuelve a «Enviado», sólo se reenvía lo que falló y el historial conserva el fallo anterior', async () => {
    const id = await informar();
    const a = (await http().post(`/api/avisos/${id}/aprobar`).send({}).expect(201)).body;
    const wamidEca = idDe(a, 'whatsapp_eca');
    await avisoProveedor(wamidEca, 'failed', { code: 131026, title: 'Message undeliverable' });
    const enviadosAntes = n;

    const r = (await http().post(`/api/avisos/${id}/aprobar`).send({}).expect(201)).body;

    expect(r.estado).toBe('Enviado');
    expect(n - enviadosAntes).toBe(1); // sólo el WhatsApp a la ECA; el del Firmante ya había salido
    const ecas = r.envios.filter((e: any) => e.canal === 'whatsapp_eca');
    expect(ecas).toHaveLength(2);
    expect(ecas[0]).toMatchObject({ idMensaje: wamidEca, ok: false, estado: 'fallido' });
    expect(ecas[1]).toMatchObject({ ok: true });
    expect(ecas[1].idMensaje).not.toBe(wamidEca);
    expect(r.envios.filter((e: any) => e.canal === 'whatsapp_firmante')).toHaveLength(1);
    // El historial de WhatsApp conserva el registro fallido.
    const historial = (await http().get('/api/whatsapp/historial').expect(200)).body.registros as any[];
    expect(historial.find((h) => h.idMensaje === wamidEca)).toMatchObject({ estadoEntrega: 'fallido' });
    // Y sigue «Enviado» al volver a leer la bandeja.
    expect((await bandeja(id)).estado).toBe('Enviado');
  });

  it('si el reintento también falla, el aviso sigue en «Falló el envío»', async () => {
    const id = await informar();
    const a = (await http().post(`/api/avisos/${id}/aprobar`).send({}).expect(201)).body;
    await avisoProveedor(idDe(a, 'whatsapp_eca'), 'failed', { code: 131026, title: 'Message undeliverable' });
    falla = true;
    const r = (await http().post(`/api/avisos/${id}/aprobar`).send({}).expect(201)).body;
    expect(r.estado).toBe('Falló el envío');
  });

  it('criterio 3: con todos sus envíos entregados o leídos sigue «Enviado», y un fallo tardío después de entregado no lo cambia', async () => {
    const id = await informar();
    const a = (await http().post(`/api/avisos/${id}/aprobar`).send({}).expect(201)).body;
    await avisoProveedor(idDe(a, 'whatsapp_eca'), 'delivered');
    await avisoProveedor(idDe(a, 'whatsapp_firmante'), 'read');
    expect((await bandeja(id)).estado).toBe('Enviado');

    await avisoProveedor(idDe(a, 'whatsapp_eca'), 'failed', { code: 131026, title: 'Message undeliverable' });
    const b = await bandeja(id);
    expect(b.estado).toBe('Enviado');
    expect(b.envios.every((e: any) => e.ok)).toBe(true);
  });

  it('un aviso todavía pendiente de revisión no cambia por avisos del proveedor', async () => {
    const id = await informar();
    expect((await bandeja(id)).estado).toBe('Pendiente de revisión');
  });
});
