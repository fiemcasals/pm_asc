import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Mailer } from '../src/auth/mailer';
import { InMemoryUsuariosRepository } from '../src/auth/usuarios.repository';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { createTestApp, InMemoryConsorciosRepository, MailerDePrueba } from './create-test-app';
import { textoDelPdf } from './pdf-extraer-texto';
import { crearSesiones, NombreSesion } from './sesiones-e2e';

const BASE_ENV = {
  AUTH_JWT_SECRET: 'secreto-e2e-pdf-legal-maicon-123456',
};

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

jest.setTimeout(30_000);

describe('HU-06 RF-02 · Generación de PDF Legal MAICON S.R.L. y envío por email a la ECA', () => {
  let app: INestApplication;
  let consorciosRepo: InMemoryConsorciosRepository;
  let mailer: MailerDePrueba;
  let whatsapp: WhatsAppConnectorService;
  let sesiones: Record<NombreSesion, string>;
  let waEnviados: number;

  beforeAll(async () => {
    consorciosRepo = new InMemoryConsorciosRepository();
    const usuarios = new InMemoryUsuariosRepository();
    const res = await createTestApp(BASE_ENV, undefined, consorciosRepo, undefined, { usuarios });
    app = res.app;
    mailer = app.get(Mailer) as unknown as MailerDePrueba;
    whatsapp = app.get(WhatsAppConnectorService);
    sesiones = await crearSesiones(app, usuarios);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    mailer.enviados.length = 0;
    mailer.errorAlEnviar = null;
    mailer.habilitado = true;
    waEnviados = 0;
    whatsapp.setTransport({
      postMessage: async () => {
        waEnviados += 1;
        return { status: 200 };
      },
    });
  });

  const registrarFallaCritica = async () => {
    const res = await request(app.getHttpServer())
      .post('/api/fallas-criticas/informes')
      .send({
        maquinaId: 'MAQ-CORRIENTES-M1',
        inspector: 'rt.e2e',
        fallasCriticas: ['BOTON_PARE_FALLA', 'CABLES_TRACCION_DESGASTADOS'],
        observaciones: 'Se detectaron hilos cortados en cables de traccion y boton de PARE sin accion.',
        fotografias: [PNG_1X1, 'https://storage.maicon.com.ar/evidencia/cables-m1.jpg'],
      })
      .expect(201);
    return res.body.informe.id as string;
  };

  it('Criterio 1: genera un PDF con membrete de MAICON S.R.L., datos del edificio y máquina, detalle de fallas y fotos adjuntas', async () => {
    const informeId = await registrarFallaCritica();

    const res = await request(app.getHttpServer())
      .get(`/api/avisos/${informeId}/pdf-legal`)
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('.pdf');
    expect(res.headers['x-pdf-sha256']).toMatch(/^[0-9a-f]{64}$/);

    const pdfBuf = res.body as Buffer;
    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const texto = textoDelPdf(pdfBuf);
    expect(texto).toContain('MAICON S.R.L.');
    expect(texto).toContain('NOTIFICACION FORMAL DE FALLA CRITICA Y DESLINDE DE RESPONSABILIDAD');
    expect(texto).toContain('Av. Corrientes');
    expect(texto).toContain('M1');
    expect(texto).toContain('Se detectaron hilos cortados');
    expect(texto).toContain('Foto adjunta #1 (imagen embebida)');
    expect(texto).toContain('https://storage.maicon.com.ar/evidencia/cables-m1.jpg');
  });

  it('Criterio 2: registrar una Falla Crítica no envía ningún email; solo ocurre al aprobar la Secretaría', async () => {
    const informeId = await registrarFallaCritica();

    expect(mailer.enviados).toHaveLength(0);
    expect(waEnviados).toBe(0);

    // Intentar reintentar email antes de aprobación se rechaza con 409
    await request(app.getHttpServer())
      .post(`/api/avisos/${informeId}/reintentar-email`)
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .send({})
      .expect(409);

    expect(mailer.enviados).toHaveLength(0);
  });

  it('Criterio 3: al aprobar, el PDF llega adjunto por email a la ECA del edificio y queda registrada la constancia con fecha y hora', async () => {
    // Cargar terna con email real de la ECA para Av. Corrientes 1234
    const consorcio = await consorciosRepo.crear({
      nombre: 'Consorcio Corrientes 1234',
      direccion: 'Av. Corrientes 1234',
      administracion: { nombre: null, telefono: null, email: null },
      encargado: { nombre: null, telefono: null },
      pisos: ['PB', '1'],
      ubicacion: null,
      maquinas: [{ referenciaAgc: 'M1', descripcion: 'Principal', tipo: 'traccion', salaCompartidaId: null }],
    });
    await consorciosRepo.asignarRoles(consorcio.id, {
      rtCalle: { nombre: 'rt.e2e', telefono: '+5491100001111', email: 'rt@maicon.com.ar' },
      firmante: { nombre: 'firmante.e2e', telefono: '+5491100002222', email: 'firmante@maicon.com.ar' },
      eca: { nombre: 'Conservación Porteña S.R.L.', telefono: '+5491100003333', email: 'legales@eca-corrientes.com.ar' },
    });

    const informeId = await registrarFallaCritica();
    expect(mailer.enviados).toHaveLength(0);

    const res = await request(app.getHttpServer())
      .post(`/api/avisos/${informeId}/aprobar`)
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .send({})
      .expect(201);

    expect(res.body.estado).toBe('Enviado');
    expect(res.body.constanciaEmailLegal).toMatchObject({
      estado: 'Enviado',
      destino: 'legales@eca-corrientes.com.ar',
      intentos: 1,
    });
    expect(Number.isNaN(Date.parse(res.body.constanciaEmailLegal.fecha))).toBe(false);
    expect(res.body.constanciaEmailLegal.archivoPdf).toMatch(/\.pdf$/);
    expect(res.body.constanciaEmailLegal.pdfSha256).toMatch(/^[0-9a-f]{64}$/);

    // Verificar que el correo llegó con el PDF real adjunto
    expect(mailer.enviados).toHaveLength(1);
    const correo = mailer.enviados[0];
    expect(correo.a).toBe('legales@eca-corrientes.com.ar');
    expect(correo.asunto).toContain('MAICON S.R.L.');
    expect(correo.adjuntos).toHaveLength(1);
    expect(correo.adjuntos![0].contentType).toBe('application/pdf');
    expect(correo.adjuntos![0].content.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('Criterio 4: si el envío del email falla, queda registrado como "Envío fallido" con el motivo y se puede reintentar sin duplicar WhatsApp', async () => {
    const informeId = await registrarFallaCritica();
    mailer.errorAlEnviar = new Error('SMTP 550 Mailbox unavailable');

    const fallo = await request(app.getHttpServer())
      .post(`/api/avisos/${informeId}/aprobar`)
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .send({ emailEca: 'rebotado@eca.com.ar' })
      .expect(201);

    expect(fallo.body.estado).toBe('Falló el envío');
    expect(fallo.body.constanciaEmailLegal).toMatchObject({
      estado: 'Envío fallido',
      destino: 'rebotado@eca.com.ar',
      motivo: 'SMTP 550 Mailbox unavailable',
      intentos: 1,
    });
    expect(fallo.body.envios.find((e: { canal: string }) => e.canal === 'email_eca')).toMatchObject({
      ok: false,
      estado: 'Envío fallido',
      motivo: 'SMTP 550 Mailbox unavailable',
    });
    expect(waEnviados).toBe(2);

    // Recuperar SMTP y reintentar el envío de correo
    mailer.errorAlEnviar = null;
    const reintento = await request(app.getHttpServer())
      .post(`/api/avisos/${informeId}/reintentar-email`)
      .set('Authorization', `Bearer ${sesiones.secretaria}`)
      .send({ emailEca: 'rebotado@eca.com.ar' })
      .expect(201);

    expect(reintento.body.estado).toBe('Enviado');
    expect(reintento.body.constanciaEmailLegal).toMatchObject({
      estado: 'Enviado',
      destino: 'rebotado@eca.com.ar',
      intentos: 2,
    });
    expect(mailer.enviados).toHaveLength(1);
    expect(mailer.enviados[0].adjuntos![0].content.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(waEnviados).toBe(2); // Los WhatsApp NO se reenviaron
  });
});
