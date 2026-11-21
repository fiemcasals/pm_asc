import { INestApplication, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { InMemoryHistorialWhatsAppRepository } from '../src/whatsapp/historial-whatsapp.repository';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { createTestApp } from './create-test-app';

/** HU-11 / RF-12: el historial de envíos de WhatsApp sobrevive a un reinicio de la API (reinicio simulado sobre el mismo repositorio). */

const APP_SECRET = 'app-secret-rf12';
const ENV = { WHATSAPP_META_APP_SECRET: APP_SECRET, WHATSAPP_META_VERIFY_TOKEN: 'verify-rf12' };
const AVISO = { telefonoDestino: '+54 9 11 6666-7777', nombreEca: 'ECA Uno', consorcio: 'Av. Corrientes 1234', equipo: 'M1', estado: 'Fuera de Servicio', detalle: 'Cabina trabada' };

describe('HU-11 RF-12 · El historial de WhatsApp sobrevive a un reinicio', () => {
  let repo: InMemoryHistorialWhatsAppRepository;
  let app: INestApplication;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let n = 0;

  const arrancar = async () => {
    ({ app } = await createTestApp(ENV, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, repo));
    app.get(WhatsAppConnectorService).setTransport({ proveedor: 'meta', postMessage: async () => ({ status: 200, providerMessageId: `wamid.RF12.${++n}` }) } as never);
  };
  /** Espera las escrituras pendientes y apaga la aplicación, como un reinicio. */
  const reiniciar = async () => {
    await app.get(WhatsAppConnectorService).esperarGuardados();
    await app.close();
    await arrancar();
  };
  const http = () => request(app.getHttpServer());
  const enviar = async () => (await http().post('/api/whatsapp/enviar-alerta').send(AVISO).expect(201)).body.idMensaje as string;
  const historial = async () => (await http().get('/api/whatsapp/historial').expect(200)).body.registros as any[];
  const estadoDe = async (id: string) => (await historial()).find((r) => r.idMensaje === id)?.estadoEntrega;
  const proveedor = (id: string, status: string) => {
    const cuerpo = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp: '1790000000' }] } }] }] });
    const firma = `sha256=${createHmac('sha256', APP_SECRET).update(cuerpo).digest('hex')}`;
    return http().post('/api/whatsapp/webhook/meta').set('Content-Type', 'application/json').set('X-Hub-Signature-256', firma).send(cuerpo).expect(200);
  };

  beforeEach(async () => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    repo = new InMemoryHistorialWhatsAppRepository();
    n = 0;
    await arrancar();
  });
  afterEach(async () => {
    await app?.close();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('criterio 1: un envío con su estado sigue en el historial (y en la bandeja) después de reiniciar', async () => {
    const id = await enviar();
    await proveedor(id, 'delivered');
    const antes = (await historial()).find((r) => r.idMensaje === id);

    await reiniciar();

    const despues = (await historial()).find((r) => r.idMensaje === id);
    expect(despues).toEqual(antes);
    expect(despues.estadoEntrega).toBe('entregado');
  });

  it('criterio 2: un envío «aceptado» antes del reinicio se actualiza en el registro correcto cuando el proveedor avisa después', async () => {
    const a = await enviar();
    const b = await enviar();
    await reiniciar();

    await proveedor(b, 'read');

    expect(await estadoDe(b)).toBe('leido');
    expect(await estadoDe(a)).toBe('aceptado');
    // Y la actualización también queda guardada: sobrevive a otro reinicio.
    await reiniciar();
    expect(await estadoDe(b)).toBe('leido');
  });

  it('criterio 3: un aviso viejo del proveedor no hace retroceder el estado, antes y después del reinicio', async () => {
    const id = await enviar();
    await proveedor(id, 'read');
    await proveedor(id, 'delivered');
    expect(await estadoDe(id)).toBe('leido');
    await reiniciar();
    await proveedor(id, 'sent');
    await proveedor(id, 'delivered');
    expect(await estadoDe(id)).toBe('leido');
  });

  it('criterio 3: un fallido se mantiene después del reinicio', async () => {
    const id = await enviar();
    const cuerpoFallo = await proveedor(id, 'failed');
    expect(cuerpoFallo.status).toBe(200);
    await reiniciar();
    await proveedor(id, 'delivered');
    expect(await estadoDe(id)).toBe('fallido');
  });

  it('los registros conservan su orden y no se duplican al reiniciar varias veces', async () => {
    const ids = [await enviar(), await enviar(), await enviar()];
    await reiniciar();
    await reiniciar();
    expect((await historial()).map((r) => r.idMensaje)).toEqual(ids);
    expect(repo.registros.size).toBe(3);
  });

  it('si la base no responde al guardar, el envío sale igual y queda en el historial en memoria', async () => {
    repo.errorAlGuardar = new Error('base caída');
    const id = await enviar();
    await app.get(WhatsAppConnectorService).esperarGuardados();
    expect(await estadoDe(id)).toBe('aceptado');
    expect(repo.registros.size).toBe(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('si la base no responde al arrancar, la API arranca igual con el historial vacío', async () => {
    await enviar();
    await app.get(WhatsAppConnectorService).esperarGuardados();
    await app.close();
    const leer = jest.spyOn(repo, 'leer').mockRejectedValueOnce(new Error('base caída'));
    await arrancar();
    expect(await historial()).toEqual([]);
    expect(leer).toHaveBeenCalled();
  });
});
