import { describe, expect, it, vi } from 'vitest';
import {
  type AvisoFalla,
  type RegistroEnvioWhatsApp,
  TEXTO_WHATSAPP_NO_CONFIGURADO,
  TEXTO_WHATSAPP_SIN_ESTADO,
  aprobarAviso,
  cargarAvisos,
  cargarEstadoWhatsApp,
  cargarHistorialWhatsApp,
  cartelWhatsApp,
  descargarPdfLegalAviso,
  estadoRealDeEnvio,
  etiquetaCanal,
  ordenarBandeja,
  puedeAprobar,
  reintentarEmailAviso,
} from './avisos';

const aviso = (estado: AvisoFalla['estado'], creadoEn: string, id = creadoEn): AvisoFalla => ({
  id, alertaId: id, consorcio: 'C', direccion: 'Calle 1', equipo: 'M1', eca: 'ECA', detalle: 'd', enlaceInforme: '/x', estado, creadoEn,
  aprobadoPor: null, aprobadoEn: null, enlaceVenceEn: null, enlace: null, envios: [],
});
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;

describe('puedeAprobar (HU-11 RF-05)', () => {
  it('«Aprobar y enviar» está disponible si espera revisión o si el envío falló; no si ya se envió', () => {
    expect(puedeAprobar(aviso('Pendiente de revisión', '1'))).toBe(true);
    expect(puedeAprobar(aviso('Falló el envío', '1'))).toBe(true);
    expect(puedeAprobar(aviso('Enviado', '1'))).toBe(false);
  });
});

describe('ordenarBandeja', () => {
  it('primero los pendientes, después los que fallaron y al final los enviados; dentro de cada grupo, los más viejos primero', () => {
    const orden = ordenarBandeja([
      aviso('Enviado', '2026-11-01'),
      aviso('Pendiente de revisión', '2026-11-03', 'p2'),
      aviso('Falló el envío', '2026-11-02'),
      aviso('Pendiente de revisión', '2026-11-02', 'p1'),
    ]);

    expect(orden.map((a) => a.id)).toEqual(['p1', 'p2', '2026-11-02', '2026-11-01']);
  });
  it('no modifica la lista recibida', () => {
    const lista = [aviso('Enviado', '2'), aviso('Pendiente de revisión', '1')];
    ordenarBandeja(lista);
    expect(lista[0].estado).toBe('Enviado');
  });
});

describe('cargarAvisos y aprobarAviso', () => {
  it('cargarAvisos devuelve la lista o null si falla', async () => {
    const lista = [aviso('Pendiente de revisión', '1')];
    expect(await cargarAvisos(vi.fn().mockResolvedValue(respuesta(200, lista)))).toEqual(lista);
    expect(await cargarAvisos(vi.fn().mockResolvedValue(respuesta(403, {})))).toBeNull();
    expect(await cargarAvisos(vi.fn().mockRejectedValue(new Error('x')))).toBeNull();
  });
  it('aprobarAviso hace POST al aviso y devuelve el aviso actualizado', async () => {
    const enviar = vi.fn().mockResolvedValue(respuesta(201, { ...aviso('Enviado', '1'), aprobadoPor: 'sec' }));

    const r = await aprobarAviso('AV-1', enviar);

    expect(r).toMatchObject({ ok: true, aviso: { estado: 'Enviado', aprobadoPor: 'sec' } });
    expect(enviar).toHaveBeenCalledWith('/api/avisos/AV-1/aprobar', expect.objectContaining({ method: 'POST' }));
  });
  it('si la API rechaza devuelve el motivo; un corte de red también', async () => {
    expect(await aprobarAviso('AV-1', vi.fn().mockResolvedValue(respuesta(409, { message: 'Este aviso ya fue aprobado y enviado.' })))).toEqual({ ok: false, error: 'Este aviso ya fue aprobado y enviado.' });
    expect(await aprobarAviso('AV-1', vi.fn().mockRejectedValue(new Error('Sin conexión')))).toEqual({ ok: false, error: 'Sin conexión' });
  });
});

describe('etiquetaCanal', () => {
  it('nombra cada canal', () => {
    expect(etiquetaCanal('whatsapp_eca')).toBe('WhatsApp a la ECA');
    expect(etiquetaCanal('whatsapp_firmante')).toBe('WhatsApp al Firmante');
    expect(etiquetaCanal('email_eca')).toBe('Correo a la ECA');
  });
});

describe('PDF Legal MAICON S.R.L. y reintento de email (HU-06 RF-02)', () => {
  it('reintentarEmailAviso hace POST a /reintentar-email y devuelve el aviso actualizado', async () => {
    const enviar = vi.fn().mockResolvedValue(respuesta(201, { ...aviso('Enviado', '1'), aprobadoPor: 'sec' }));
    const r = await reintentarEmailAviso('AV-1', enviar);
    expect(r).toMatchObject({ ok: true, aviso: { estado: 'Enviado' } });
    expect(enviar).toHaveBeenCalledWith('/api/avisos/AV-1/reintentar-email', expect.objectContaining({ method: 'POST' }));
  });

  it('descargarPdfLegalAviso pide GET /pdf-legal y devuelve blob y nombre .pdf', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const enviar = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => blob } as Response);
    const r = await descargarPdfLegalAviso('AV-1', enviar);
    expect(r).toMatchObject({ ok: true, filename: 'deslinde-maicon-AV-1.pdf' });
    expect(enviar).toHaveBeenCalledWith('/api/avisos/AV-1/pdf-legal');
  });
});

describe('cartel de WhatsApp de la bandeja (HU-11 RF-10)', () => {
  it('con Meta activo dice «WhatsApp activo: Meta»', () => {
    expect(cartelWhatsApp({ configurado: true, proveedor: 'meta' })).toEqual({ tipo: 'activo', texto: 'WhatsApp activo: Meta' });
  });

  it('con Twilio activo dice «WhatsApp activo: Twilio»', () => {
    expect(cartelWhatsApp({ configurado: true, proveedor: 'twilio' })).toEqual({ tipo: 'activo', texto: 'WhatsApp activo: Twilio' });
  });

  it('sin proveedor avisa que los avisos aprobados no salen por WhatsApp', () => {
    const esperado = { tipo: 'no_configurado', texto: 'WhatsApp no configurado: los avisos aprobados no salen por WhatsApp' };
    expect(TEXTO_WHATSAPP_NO_CONFIGURADO).toBe(esperado.texto);
    expect(cartelWhatsApp({ configurado: false, proveedor: null })).toEqual(esperado);
    expect(cartelWhatsApp({ configurado: true, proveedor: null })).toEqual(esperado);
  });

  it('si no se pudo consultar el estado, el cartel lo dice y no afirma ni que está activo ni que no lo está', () => {
    const cartel = cartelWhatsApp(null);
    expect(cartel.tipo).toBe('sin_estado');
    expect(cartel.texto).toBe(TEXTO_WHATSAPP_SIN_ESTADO);
    expect(cartel.texto).toContain('No se pudo consultar el estado de WhatsApp');
    expect(cartel.texto).not.toMatch(/activo:/);
    expect(cartel.texto).not.toMatch(/no configurado/);
  });

  it('no muestra credenciales ni números de teléfono aunque la respuesta traiga datos de más', async () => {
    const enviar = vi.fn().mockResolvedValue(
      respuesta(200, { configurado: true, proveedor: 'meta', accessToken: 'EAAG-secreto', telefono: '+5491166667777' }),
    );
    const estado = await cargarEstadoWhatsApp(enviar);
    const texto = JSON.stringify([estado, cartelWhatsApp(estado)]);

    expect(estado).toEqual({ configurado: true, proveedor: 'meta' });
    expect(texto).not.toContain('EAAG-secreto');
    expect(texto).not.toContain('5491166667777');
  });
});

describe('cargarEstadoWhatsApp', () => {
  it('pide GET /api/whatsapp/estado y devuelve el estado', async () => {
    const enviar = vi.fn().mockResolvedValue(respuesta(200, { configurado: false, proveedor: null }));

    expect(await cargarEstadoWhatsApp(enviar)).toEqual({ configurado: false, proveedor: null });
    expect(enviar).toHaveBeenCalledWith('/api/whatsapp/estado');
  });

  it('devuelve null si no responde, si responde con error o si la respuesta no es la esperada', async () => {
    expect(await cargarEstadoWhatsApp(vi.fn().mockRejectedValue(new Error('sin red')))).toBeNull();
    expect(await cargarEstadoWhatsApp(vi.fn().mockResolvedValue(respuesta(503, {})))).toBeNull();
    expect(await cargarEstadoWhatsApp(vi.fn().mockResolvedValue(respuesta(200, { algo: 1 })))).toBeNull();
    expect(await cargarEstadoWhatsApp(vi.fn().mockResolvedValue(respuesta(200, null)))).toBeNull();
  });
});

describe('cargarHistorialWhatsApp', () => {
  it('devuelve los registros, o null si no se pudo cargar', async () => {
    const registros = [{ alertaId: 'A1', telefonoDestino: '+54911', estadoEntrega: 'entregado', timestamp: '2026-11-20T10:00:00Z' }];

    expect(await cargarHistorialWhatsApp(vi.fn().mockResolvedValue(respuesta(200, { total: 1, registros })))).toEqual(registros);
    expect(await cargarHistorialWhatsApp(vi.fn().mockResolvedValue(respuesta(500, {})))).toBeNull();
    expect(await cargarHistorialWhatsApp(vi.fn().mockRejectedValue(new Error('x')))).toBeNull();
    expect(await cargarHistorialWhatsApp(vi.fn().mockResolvedValue(respuesta(200, { total: 0 })))).toBeNull();
  });
});

describe('estadoRealDeEnvio: el estado que confirmó el proveedor (HU-11 RF-10)', () => {
  const envio = { canal: 'whatsapp_eca' as const, destino: '+5491166667777' };
  const registro = (r: Partial<RegistroEnvioWhatsApp>): RegistroEnvioWhatsApp => ({
    alertaId: 'ALT-1',
    telefonoDestino: '+5491166667777',
    estadoEntrega: 'aceptado',
    timestamp: '2026-11-20T10:00:00.000Z',
    ...r,
  });
  const estado = (r: Partial<RegistroEnvioWhatsApp>) => estadoRealDeEnvio(envio, 'ALT-1', [registro(r)]);

  it.each([
    ['enviado', 'enviado', 'Enviado'],
    ['entregado', 'entregado', 'Entregado'],
    ['leido', 'leido', 'Leído'],
  ] as const)('%s se muestra como «%s»', (estadoEntrega, tipo, texto) => {
    expect(estado({ estadoEntrega })).toEqual({ tipo, texto });
  });

  it('aceptado no se muestra como entregado: dice que falta la confirmación', () => {
    const r = estado({ estadoEntrega: 'aceptado' })!;
    expect(r.tipo).toBe('aceptado');
    expect(r.texto).toContain('sin confirmación de entrega');
    expect(r.texto).not.toMatch(/^Entregado/);
  });

  it('fallido muestra el motivo y el código que informó el proveedor', () => {
    expect(estado({ estadoEntrega: 'fallido', errorProveedor: { codigo: '131026', mensaje: 'Message undeliverable' }, motivo: 'otro texto' })).toEqual({
      tipo: 'fallo',
      texto: 'Falló: Message undeliverable (código 131026)',
    });
  });

  it('fallido sin detalle del proveedor usa el motivo del registro, y si tampoco hay, lo dice', () => {
    expect(estado({ estadoEntrega: 'fallido', motivo: 'Proveedor WhatsApp rechazó el envío (HTTP 400)' })!.texto).toBe('Falló: Proveedor WhatsApp rechazó el envío (HTTP 400)');
    expect(estado({ estadoEntrega: 'fallido' })!.texto).toBe('Falló: el proveedor no informó el motivo');
  });

  it('un envío que no llegó a salir lo dice con su motivo', () => {
    expect(estado({ estadoEntrega: 'no_configurado', motivo: 'falta la plantilla' })).toEqual({ tipo: 'no_salio', texto: 'No salió: falta la plantilla' });
    expect(estado({ estadoEntrega: 'sin_telefono' })!.texto).toBe('No salió: sin_telefono');
  });

  it('toma el registro de esa alerta y de ese teléfono, y de ellos el más reciente', () => {
    const registros = [
      registro({ estadoEntrega: 'fallido', timestamp: '2026-11-20T09:00:00.000Z' }),
      registro({ estadoEntrega: 'entregado', timestamp: '2026-11-20T11:00:00.000Z' }),
      registro({ estadoEntrega: 'leido', alertaId: 'ALT-OTRA', timestamp: '2026-11-20T12:00:00.000Z' }),
      registro({ estadoEntrega: 'leido', telefonoDestino: '+5491100000000', timestamp: '2026-11-20T12:00:00.000Z' }),
    ];
    expect(estadoRealDeEnvio(envio, 'ALT-1', registros)!.tipo).toBe('entregado');
  });

  it('devuelve null si no hay historial, si no tiene ese envío o si el canal es el correo', () => {
    expect(estadoRealDeEnvio(envio, 'ALT-1', null)).toBeNull();
    expect(estadoRealDeEnvio(envio, 'ALT-1', [])).toBeNull();
    expect(estadoRealDeEnvio(envio, 'ALT-SIN-REGISTRO', [registro({})])).toBeNull();
    expect(estadoRealDeEnvio({ canal: 'email_eca', destino: '+5491166667777' }, 'ALT-1', [registro({})])).toBeNull();
  });
});
