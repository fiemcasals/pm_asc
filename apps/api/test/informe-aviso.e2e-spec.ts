import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { createTestApp } from './create-test-app';

// HU-11 RF-06 por HTTP: el enlace del aviso abre el informe sin sesión, con token imposible de adivinar y vencimiento a los 7 días.
const PASSWORD = 'Clave-Segura-2026';
const DIA = 24 * 60 * 60 * 1000;
jest.setTimeout(30_000);

describe('Enlace del aviso sin contraseña y válido por 7 días (HU-11 RF-06)', () => {
  let app: INestApplication;
  let whatsapp: WhatsAppConnectorService;
  let mensajes: { to: string; text: string }[];
  let tokenSecretaria = '';
  let tokenRt = '';

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, undefined, undefined, undefined, { usuarios }));
    whatsapp = app.get(WhatsAppConnectorService);
    const hash = await bcrypt.hash(PASSWORD, 4);
    const cuentas: [string, Rol][] = [['secretaria', 'secretaria'], ['rt1', 'rt_calle']];
    for (const [usuario, rol] of cuentas) await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hash, eca: null });
    tokenSecretaria = (await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: 'secretaria', password: PASSWORD })).body.accessToken;
    tokenRt = (await request(app.getHttpServer()).post('/api/auth/login').send({ usuario: 'rt1', password: PASSWORD })).body.accessToken;
  });
  afterAll(async () => {
    jest.useRealTimers();
    await app?.close();
  });
  beforeEach(() => {
    mensajes = [];
    whatsapp.setTransport({
      postMessage: async (_u, p) => {
        mensajes.push(p as { to: string; text: string });
        return { status: 200 };
      },
    });
  });

  const http = () => request(app.getHttpServer());
  const informar = async (extra: Record<string, unknown> = {}, maquinaId = 'MAQ-CORRIENTES-M1') =>
    (await http().post('/api/fallas-criticas/informes').set('Authorization', `Bearer ${tokenRt}`).send({ maquinaId, inspector: 'rt1', fallasCriticas: ['BOTON_PARE_FALLA'], ...extra })).body.informe.id as string;
  const aprobar = (id: string) => http().post(`/api/avisos/${id}/aprobar`).set('Authorization', `Bearer ${tokenSecretaria}`).send({});
  /** Aprueba el aviso y devuelve la ruta del enlace que viajó en el WhatsApp. */
  const enlaceDe = async (id: string): Promise<string> => {
    mensajes = [];
    await aprobar(id);
    return /(\/api\/informe-aviso\/[A-Za-z0-9_-]+)/.exec(mensajes[0].text)![1];
  };

  it('criterio 1: el enlace abre el informe de la falla sin iniciar sesión', async () => {
    const id = await informar({ observaciones: 'Pulsador trabado' });
    const enlace = await enlaceDe(id);

    const res = await http().get(enlace); // sin Authorization

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Falla crítica reportada');
    expect(res.text).toContain('Av. Corrientes 1234');
    expect(res.text).toContain('Pulsador trabado');
    expect(res.text).toContain('Botón de PARE');
  });

  it('el enlace no se cachea ni se indexa, y no se filtra por el Referer', async () => {
    const res = await http().get(await enlaceDe(await informar()));

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toMatch(/noindex/);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('criterio 2: el token tiene 256 bits (43 caracteres base64url) y es distinto en cada aviso', async () => {
    const e1 = await enlaceDe(await informar());
    const e2 = await enlaceDe(await informar());

    expect(e1.split('/').pop()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(e1).not.toBe(e2);
  });

  it('el enlace lo ve la Secretaría en la bandeja, pero no queda en el historial de WhatsApp (que no pide sesión)', async () => {
    const id = await informar();
    const enlace = await enlaceDe(id);
    const token = enlace.split('/').pop()!;

    const bandeja = await http().get('/api/avisos').set('Authorization', `Bearer ${tokenSecretaria}`);
    expect(bandeja.body.find((a: { alertaId: string }) => a.alertaId === id).enlace).toContain(token);
    expect(JSON.stringify(whatsapp.getHistorialEnvios(id))).not.toContain(token);
    const publico = await http().get('/api/whatsapp/historial').query({ alertaId: id }); // sin sesión
    expect(JSON.stringify(publico.body)).not.toContain(token);
  });

  it.each([
    ['un token que no existe', '/api/informe-aviso/' + 'A'.repeat(43)],
    ['un token con otro formato', '/api/informe-aviso/abc'],
    ['el id del informe en lugar del token', '/api/informe-aviso/INF-1234'],
    ['una alerta conocida (ALT-MAICON-001)', '/api/informe-aviso/ALT-MAICON-001'],
  ])('criterio 2: %s → 404 sin revelar nada', async (_n, ruta) => {
    const res = await http().get(ruta);

    expect(res.status).toBe(404);
    expect(res.text).toContain('El enlace no es válido');
    expect(res.text).not.toMatch(/Corrientes|MAICON-001|Falla crítica reportada/);
  });

  it('criterio 2: un token alterado (un carácter cambiado) → 404', async () => {
    const enlace = await enlaceDe(await informar());
    const alterado = enlace.slice(0, -1) + (enlace.endsWith('A') ? 'B' : 'A');

    expect((await http().get(alterado)).status).toBe(404);
    expect((await http().get(enlace)).status).toBe(200);
  });

  it('criterio 3: a los 7 días justos sirve; pasados 7 días → 410 «Este enlace venció» y no muestra el informe', async () => {
    const informe = await informar({ observaciones: 'Texto reservado' });
    const antes = Date.now(); // el enlace se emite después de este instante, y dentro de los 2 segundos siguientes
    const enlace = await enlaceDe(informe);
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    try {
      jest.setSystemTime(antes + 7 * DIA); // el enlace se emitió después de `antes`: todavía no pasaron 7 días
      expect((await http().get(enlace)).status).toBe(200);

      jest.setSystemTime(antes + 7 * DIA + 2000); // ya pasaron más de 7 días
      const vencido = await http().get(enlace);

      expect(vencido.status).toBe(410);
      expect(vencido.text).toContain('Este enlace venció');
      expect(vencido.text).not.toContain('Texto reservado');
      expect(vencido.text).not.toContain('Corrientes');
    } finally {
      jest.useRealTimers();
    }
  });

  it('el vencimiento se informa en el aviso (7 días desde el envío)', async () => {
    const id = await informar();
    const antes = Date.now();

    const res = await aprobar(id);

    const vence = Date.parse(res.body.enlaceVenceEn);
    expect(vence - antes).toBeGreaterThanOrEqual(7 * DIA - 1000);
    expect(vence - antes).toBeLessThanOrEqual(7 * DIA + 5000);
  });

  it('criterio 4: cada enlace muestra sólo el informe de su aviso, no los de otros edificios', async () => {
    const a = await enlaceDe(await informar({ observaciones: 'Observación del primero' }, 'MAQ-CORRIENTES-M1'));
    const b = await enlaceDe(await informar({ observaciones: 'Observación del segundo' }, 'MAQ-CALLAO-M1'));

    const ra = (await http().get(a)).text;
    const rb = (await http().get(b)).text;

    expect(ra).toContain('Observación del primero');
    expect(ra).not.toContain('Observación del segundo');
    expect(ra).not.toContain('Callao');
    expect(rb).toContain('Observación del segundo');
    expect(rb).not.toContain('Observación del primero');
    expect(rb).not.toContain('Corrientes');
  });

  it('lo que escribió una persona se escapa: un script en las observaciones no llega al HTML', async () => {
    const enlace = await enlaceDe(await informar({ observaciones: '<script>alert(1)</script>' }));

    const res = await http().get(enlace);

    expect(res.text).not.toContain('<script>alert(1)');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('las fotos del informe se muestran en el enlace', async () => {
    const enlace = await enlaceDe(await informar({ fotografias: ['https://fotos.example/cabina.jpg'] }));

    expect((await http().get(enlace)).text).toContain('<img src="https://fotos.example/cabina.jpg"');
  });

  it('un reintento de envío conserva el mismo token: el enlace que ya recibió la ECA sigue valiendo', async () => {
    const id = await informar();
    whatsapp.setTransport({
      postMessage: async (_u, p) => {
        const m = p as { to: string; text: string };
        if (m.to === '+5491100000002') throw new Error('Proveedor caído'); // el Firmante no recibe el aviso
        mensajes.push(m);
        return { status: 200 };
      },
    });
    mensajes = [];
    await http().post(`/api/avisos/${id}/aprobar`).set('Authorization', `Bearer ${tokenSecretaria}`).send({ telefonoEca: '+5491100000001', telefonoFirmante: '+5491100000002' });
    const enlaceDeLaEca = /(\/api\/informe-aviso\/[A-Za-z0-9_-]+)/.exec(mensajes[0].text)![1];

    mensajes = [];
    whatsapp.setTransport({ postMessage: async (_u, p) => { mensajes.push(p as { to: string; text: string }); return { status: 200 }; } });
    await http().post(`/api/avisos/${id}/aprobar`).set('Authorization', `Bearer ${tokenSecretaria}`).send({ telefonoEca: '+5491100000001', telefonoFirmante: '+5491100000002' });
    const enlaceDelFirmante = /(\/api\/informe-aviso\/[A-Za-z0-9_-]+)/.exec(mensajes[0].text)![1];

    expect(enlaceDelFirmante).toBe(enlaceDeLaEca);
    expect((await http().get(enlaceDeLaEca)).status).toBe(200);
  });

  it('un aviso que todavía no se aprobó no tiene enlace: no hay nada que abrir', async () => {
    await informar();

    expect((await http().get('/api/informe-aviso/' + 'B'.repeat(43))).status).toBe(404);
  });
});
