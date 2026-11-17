import { Mailer } from '../src/auth/mailer';
import { AvisosService } from '../src/avisos/avisos.service';
import { FallasCriticasService } from '../src/fallas-criticas/fallas-criticas.service';
import { FirmanteService } from '../src/firmante/firmante.service';
import { WhatsAppConnectorService } from '../src/whatsapp/whatsapp-connector.service';
import { WhatsAppFormatterService } from '../src/whatsapp/whatsapp-formatter.service';

// HU-11 RF-06 (servicio, con el reloj congelado): el token del enlace y su vencimiento exacto a los 7 días.
const DIA = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-11-17T12:00:00.000Z').getTime();

describe('Token y vencimiento del enlace del aviso (HU-11 RF-06)', () => {
  let avisos: AvisosService;
  let fallas: FallasCriticasService;
  let mensajes: string[];

  const aprobar = async (): Promise<{ id: string; token: string }> => {
    const informe = fallas.registrarInforme({ maquinaId: 'MAQ-CORRIENTES-M1', inspector: 'rt1', fallasCriticas: ['BOTON_PARE_FALLA'] }).informe;
    mensajes = [];
    await avisos.aprobar(informe.id, { usuario: 'sec1' });
    return { id: informe.id, token: /\/api\/informe-aviso\/([A-Za-z0-9_-]+)/.exec(mensajes[0])![1] };
  };

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
    jest.setSystemTime(T0);
    const firmante = new FirmanteService();
    fallas = new FallasCriticasService(firmante);
    const conector = new WhatsAppConnectorService(new WhatsAppFormatterService());
    mensajes = [];
    conector.setTransport({ postMessage: async (_u, p) => { mensajes.push((p as { text: string }).text); return { status: 200 }; } });
    const mailer = { habilitado: false, enviar: async () => undefined } as unknown as Mailer;
    avisos = new AvisosService(fallas, conector, mailer);
    avisos.onModuleInit();
  });
  afterEach(() => {
    avisos.onModuleDestroy();
    jest.useRealTimers();
  });

  it('el token tiene 256 bits en base64url (43 caracteres) y dos avisos nunca comparten token', async () => {
    const a = await aprobar();
    const b = await aprobar();

    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a.token, 'base64url')).toHaveLength(32);
    expect(a.token).not.toBe(b.token);
  });

  it('a los 7 días justos todavía sirve; un milisegundo después venció', async () => {
    const { token } = await aprobar();

    jest.setSystemTime(T0 + 7 * DIA);
    expect(avisos.informePorToken(token).resultado).toBe('ok');

    jest.setSystemTime(T0 + 7 * DIA + 1);
    expect(avisos.informePorToken(token)).toEqual({ resultado: 'vencido' });
  });

  it('antes de los 7 días sirve y a los 6 días y 23 horas también', async () => {
    const { token } = await aprobar();

    jest.setSystemTime(T0 + 6 * DIA + 23 * 3600 * 1000);

    expect(avisos.informePorToken(token).resultado).toBe('ok');
  });

  it('el vencimiento sale del momento del envío, no de la creación del aviso', async () => {
    const informe = fallas.registrarInforme({ maquinaId: 'MAQ-CORRIENTES-M1', inspector: 'rt1', fallasCriticas: ['BOTON_PARE_FALLA'] }).informe;
    jest.setSystemTime(T0 + 3 * DIA); // el aviso espera 3 días la revisión
    await avisos.aprobar(informe.id, { usuario: 'sec1' });
    const token = /\/api\/informe-aviso\/([A-Za-z0-9_-]+)/.exec(mensajes[0])![1];

    jest.setSystemTime(T0 + 3 * DIA + 6 * DIA);

    expect(avisos.informePorToken(token).resultado).toBe('ok');
    expect(avisos.obtener(informe.id).enlaceVenceEn).toBe(new Date(T0 + 3 * DIA + 7 * DIA).toISOString());
  });

  it.each([
    ['vacío', ''],
    ['de otro largo', 'abc'],
    ['con caracteres no válidos', '!'.repeat(43)],
    ['con el largo justo pero inexistente', 'A'.repeat(43)],
    ['con un largo de más', 'A'.repeat(44)],
  ])('un token %s → inexistente', (_n, token) => {
    expect(avisos.informePorToken(token)).toEqual({ resultado: 'inexistente' });
  });

  it('un aviso sin aprobar no tiene token: nada que abrir', async () => {
    fallas.registrarInforme({ maquinaId: 'MAQ-CORRIENTES-M1', inspector: 'rt1', fallasCriticas: ['BOTON_PARE_FALLA'] });

    expect(avisos.listar()[0].enlaceVenceEn).toBeNull();
  });

  it('la vista del informe trae sólo los datos de ese aviso', async () => {
    const { token } = await aprobar();

    const r = avisos.informePorToken(token);

    expect(r).toMatchObject({ resultado: 'ok', vista: { equipo: expect.stringContaining('M1'), direccion: 'Av. Corrientes 1234, CABA', detalle: [expect.stringContaining('PARE')] } });
  });
});
