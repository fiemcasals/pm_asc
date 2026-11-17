import { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Rol } from '../src/auth/auth.types';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { Mailer } from '../src/auth/mailer';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { createTestApp, MailerDePrueba } from './create-test-app';

// HU-11 RF-05 por HTTP, con roles reales: ningún aviso sale hasta que la Secretaría lo aprueba.
const PASSWORD = 'Clave-Segura-2026';
jest.setTimeout(30_000);

describe('Avisos de falla crítica con revisión de la Secretaría (HU-11 RF-05)', () => {
  let app: INestApplication;
  let whatsapp: WhatsAppConnectorService;
  let correo: MailerDePrueba;
  let enviados: { to: string; text: string }[];
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const usuarios = new InMemoryUsuariosRepository();
    ({ app } = await createTestApp({ NODE_ENV: 'development' }, undefined, undefined, undefined, { usuarios }));
    whatsapp = app.get(WhatsAppConnectorService);
    correo = app.get(Mailer) as unknown as MailerDePrueba;
    const hash = await bcrypt.hash(PASSWORD, 4);
    const cuentas: [string, Rol][] = [['secretaria', 'secretaria'], ['administrador', 'administrador'], ['gonza', 'firmante'], ['rt1', 'rt_calle'], ['eca1', 'eca']];
    for (const [usuario, rol] of cuentas) {
      await usuarios.crear({ usuario, nombre: usuario, rol, passwordHash: hash, eca: rol === 'eca' ? 'ECA-E2E' : null });
      tokens[usuario] = (await request(app.getHttpServer()).post('/api/auth/login').send({ usuario, password: PASSWORD })).body.accessToken;
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    enviados = [];
    whatsapp.setTransport({
      postMessage: async (_url, payload) => {
        enviados.push(payload as { to: string; text: string });
        return { status: 200 };
      },
    });
  });

  const http = () => request(app.getHttpServer());
  const con = (usuario: string) => ({
    lista: (estado?: string) => http().get('/api/avisos').query(estado ? { estado } : {}).set('Authorization', `Bearer ${tokens[usuario]}`),
    aprobar: (id: string, cuerpo: Record<string, unknown> = {}) => http().post(`/api/avisos/${id}/aprobar`).set('Authorization', `Bearer ${tokens[usuario]}`).send(cuerpo),
  });
  const informar = async () => {
    const res = await http().post('/api/fallas-criticas/informes').send({ maquinaId: 'MAQ-CORRIENTES-M1', inspector: 'rt1', fallasCriticas: ['BOTON_PARE_FALLA'] });
    return res.body.informe.id as string;
  };

  it('criterio 1: al registrarse la falla crítica no sale ningún WhatsApp y el aviso queda «Pendiente de revisión» en la bandeja', async () => {
    const id = await informar();

    expect(enviados).toEqual([]);
    expect(whatsapp.getHistorialEnvios(id)).toEqual([]);
    const pendientes = (await con('secretaria').lista('Pendiente de revisión')).body;
    expect(pendientes.find((a: { alertaId: string }) => a.alertaId === id)).toMatchObject({
      estado: 'Pendiente de revisión', aprobadoPor: null, aprobadoEn: null, envios: [], equipo: expect.stringContaining('M1'),
    });
  });

  it('criterio 2 y 4: al aprobar se mandan el WhatsApp a la ECA y al Firmante y el correo a la ECA; pasa a «Enviado» y queda quién aprobó y cuándo', async () => {
    const id = await informar();

    const res = await con('secretaria').aprobar(id, { telefonoEca: '+5491100000001', telefonoFirmante: '+5491100000002', emailEca: 'eca@test.com' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ estado: 'Enviado', aprobadoPor: 'secretaria' });
    expect(Number.isNaN(Date.parse(res.body.aprobadoEn))).toBe(false);
    expect(res.body.envios.map((e: { canal: string }) => e.canal)).toEqual(['whatsapp_eca', 'whatsapp_firmante', 'email_eca']);
    expect(correo.enviados.at(-1)).toMatchObject({ a: 'eca@test.com', asunto: expect.stringContaining('Falla crítica'), texto: expect.stringContaining(id) });
    expect(enviados.map((m) => m.to)).toEqual(['+5491100000001', '+5491100000002']);
    expect(enviados[0].text).toContain(id);
    const historial = whatsapp.getHistorialEnvios(id);
    expect(historial).toHaveLength(2);
    expect(historial.every((h) => h.aprobadoPor === 'secretaria' && !!h.aprobadoEn)).toBe(true);
    expect((await con('secretaria').lista('Pendiente de revisión')).body.some((a: { alertaId: string }) => a.alertaId === id)).toBe(false);
  });

  it('sin correo configurado el envío queda registrado como «no_configurado» (no se da por enviado) pero no frena el aviso', async () => {
    const id = await informar();
    (correo as { habilitado: boolean }).habilitado = false;
    try {
      const res = await con('administrador').aprobar(id);

      expect(res.body.envios.find((e: { canal: string }) => e.canal === 'email_eca')).toMatchObject({ ok: false, estado: 'no_configurado' });
      expect(res.body.estado).toBe('Enviado');
      expect(res.body.aprobadoPor).toBe('administrador');
    } finally {
      (correo as { habilitado: boolean }).habilitado = true;
    }
  });

  it('un aviso aprobado no se aprueba de nuevo (409)', async () => {
    const id = await informar();
    await con('secretaria').aprobar(id);

    expect((await con('secretaria').aprobar(id)).status).toBe(409);
    expect(enviados).toHaveLength(2);
  });

  it('si el WhatsApp del Firmante falla el aviso queda «Falló el envío», conserva quién aprobó y al reintentar sólo se manda lo que no salió', async () => {
    const id = await informar();
    whatsapp.setTransport({
      postMessage: async (_u, p) => {
        const msg = p as { to: string; text: string };
        if (msg.to === '+5491100000002') throw new Error('Proveedor caído');
        enviados.push(msg);
        return { status: 200 };
      },
    });

    const falla = await con('secretaria').aprobar(id, { telefonoEca: '+5491100000001', telefonoFirmante: '+5491100000002' });
    expect(falla.body).toMatchObject({ estado: 'Falló el envío', aprobadoPor: 'secretaria' });
    expect(falla.body.envios.find((e: { canal: string }) => e.canal === 'whatsapp_eca').ok).toBe(true);
    expect(falla.body.envios.find((e: { canal: string }) => e.canal === 'whatsapp_firmante').ok).toBe(false);
    expect(enviados.map((m) => m.to)).toEqual(['+5491100000001']);

    whatsapp.setTransport({ postMessage: async (_u, p) => { enviados.push(p as { to: string; text: string }); return { status: 200 }; } });
    const ok = await con('administrador').aprobar(id, { telefonoEca: '+5491100000001', telefonoFirmante: '+5491100000002' });

    expect(ok.body.estado).toBe('Enviado');
    expect(ok.body.aprobadoPor).toBe('secretaria'); // la primera aprobación se conserva
    expect(enviados.map((m) => m.to)).toEqual(['+5491100000001', '+5491100000002']); // la ECA no recibe el aviso dos veces
  });

  it('criterio 3: el disparo de un aviso no aprobado responde 409 con el motivo y no manda nada', async () => {
    const id = await informar();

    const res = await http().post('/api/whatsapp/trigger-alerta-critica').send({ alertaId: id });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/pendiente de revisión/);
    expect(enviados).toEqual([]);
  });

  it('criterio 3: aunque la alerta de la máquina no tenga aviso todavía, el disparo no sale sin aprobación (409) y deja el aviso pendiente', async () => {
    const res = await http().post('/api/whatsapp/trigger-alerta-critica').send({ alertaId: 'ALT-MAICON-001' });

    expect(res.status).toBe(409);
    expect(enviados).toEqual([]);
    const pendiente = (await con('secretaria').lista('Pendiente de revisión')).body.find((a: { alertaId: string }) => a.alertaId === 'ALT-MAICON-001');
    expect(pendiente).toBeDefined();
  });

  it.each(['gonza', 'rt1', 'eca1'])('el rol %s no ve la bandeja ni aprueba (403); sin sesión 401; un aviso que no existe 404', async (rol) => {
    const id = await informar();

    expect((await con(rol).lista()).status).toBe(403);
    expect((await con(rol).aprobar(id)).status).toBe(403);
    expect((await http().get('/api/avisos')).status).toBe(401);
    expect((await http().post(`/api/avisos/${id}/aprobar`)).status).toBe(401);
    expect((await con('secretaria').aprobar('AV-NO-EXISTE')).status).toBe(404);
    expect(enviados).toEqual([]);
  });
});
