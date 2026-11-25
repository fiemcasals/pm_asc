import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// HU-11 RF-15 — WhatsApp con sesión: el botón del portal de la ECA lo ven y lo usan la Secretaría y el Administrador, con su sesión.
vi.mock('../auth/sesion', () => ({ fetchConSesion: vi.fn() }));

import { fetchConSesion } from '../auth/sesion';
import { AccionesAlertaCritica, AlertasCriticas } from './AlertasCriticas';
import {
  enviarAlertaWhatsApp,
  type MaquinaEca,
  mensajeDeErrorWhatsApp,
  puedeDespacharWhatsApp,
  triggerAlertaWhatsAppInmediata,
} from './eca';

const sesion = vi.mocked(fetchConSesion);
const respuesta = (status: number, cuerpo: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response;
const sinRed = () => Promise.reject(new TypeError('Failed to fetch'));

const AVISO = {
  telefonoDestino: '+5491166667777',
  nombreEca: 'MAICON Mantenimiento',
  consorcio: 'Av. Santa Fe 3200',
  equipo: 'M1 - Principal',
  estado: 'Fuera de Servicio',
  detalle: 'Freno con deslizamiento',
  remitoUrl: 'https://app.maicon.example/api/eca/remito/ALT-1',
};
const maquina: MaquinaEca = {
  id: 'MAQ-URG-1',
  codigoAGC: 'M1',
  nombre: 'M1: Ascensor Principal',
  edificio: { id: 'EDIF-3', direccion: 'Av. Santa Fe 3200, CABA', administracion: 'Palermo Admin', consorcio: 'Consorcio Santa Fe 3200' },
  eca: 'MAICON Mantenimiento',
  rtCalle: 'dev-ma-2',
  mes: '2026-11',
  estado: 'Recorrida',
  estadoOperativo: 'Reparación Urgente',
  alertaCritica: { id: 'ALT-URG-1', tipo: 'REPARACION_URGENTE', titulo: 'REPARACIÓN URGENTE', motivo: 'Freno con deslizamiento crítico', fechaDeteccion: '2026-11-06T09:00:00Z' },
  visita: null,
} as MaquinaEca;

beforeEach(() => {
  sesion.mockReset();
  vi.unstubAllGlobals();
});

describe('puedeDespacharWhatsApp: quién ve y usa el botón (criterio 4)', () => {
  it.each([['secretaria', true], ['administrador', true], ['eca', false], ['rt_calle', false], ['firmante', false]])('%s → %s', (rol, esperado) => {
    expect(puedeDespacharWhatsApp({ rol })).toBe(esperado);
  });
});

describe('mensajeDeErrorWhatsApp', () => {
  it('401 es sesión vencida y 403 dice quién despacha', () => {
    expect(mensajeDeErrorWhatsApp(401)).toBe('La sesión venció: ingresá de nuevo.');
    expect(mensajeDeErrorWhatsApp(403)).toBe('Sólo la Secretaría y el Administrador despachan alertas por WhatsApp.');
  });
});

describe('el cliente de WhatsApp trabaja con la sesión (criterio 4)', () => {
  it('enviarAlertaWhatsApp manda el aviso con la sesión (fetchConSesion), nunca con fetch sin sesión', async () => {
    const fetchSinSesion = vi.fn(() => Promise.reject(new Error('no se debe usar fetch sin sesión')));
    vi.stubGlobal('fetch', fetchSinSesion);
    sesion.mockResolvedValue(respuesta(201, { ok: true, idMensaje: 'wamid.1', estadoEntrega: 'aceptado', timestampEnvio: '2026-11-25T10:00:00Z' }));

    const r = await enviarAlertaWhatsApp(AVISO);

    expect(r.ok).toBe(true);
    expect(fetchSinSesion).not.toHaveBeenCalled();
    expect(sesion).toHaveBeenCalledTimes(1);
    const [url, init] = sesion.mock.calls[0];
    expect(url).toBe('/api/whatsapp/enviar-alerta');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual(AVISO);
  });

  it.each([[401, 'La sesión venció: ingresá de nuevo.'], [403, 'Sólo la Secretaría y el Administrador despachan alertas por WhatsApp.']])(
    'enviarAlertaWhatsApp con un %i explica por qué (y no muestra el texto del servidor)',
    async (status, mensaje) => {
      sesion.mockResolvedValue(respuesta(status, { message: 'Tu rol no tiene acceso a este recurso.' }));

      expect(await enviarAlertaWhatsApp(AVISO)).toEqual({ ok: false, error: mensaje });
    },
  );

  it('enviarAlertaWhatsApp sigue informando lo que dice el servidor cuando no hay proveedor (503)', async () => {
    sesion.mockResolvedValue(respuesta(503, { ok: false, estadoEntrega: 'no_configurado', error: 'WhatsApp no está configurado' }));

    const r = await enviarAlertaWhatsApp(AVISO);

    expect(r.ok).toBe(false);
    expect(r.error).toBe('WhatsApp no está configurado');
  });

  it('enviarAlertaWhatsApp sin red devuelve el error en vez de lanzarlo', async () => {
    sesion.mockImplementation(sinRed);

    const r = await enviarAlertaWhatsApp(AVISO);

    expect(r.ok).toBe(false);
    expect(r.error).toBe('Failed to fetch');
  });

  it('triggerAlertaWhatsAppInmediata también va con la sesión y explica el 401 y el 403', async () => {
    const fetchSinSesion = vi.fn(() => Promise.reject(new Error('no se debe usar fetch sin sesión')));
    vi.stubGlobal('fetch', fetchSinSesion);
    sesion.mockResolvedValueOnce(respuesta(401)).mockResolvedValueOnce(respuesta(403));

    expect(await triggerAlertaWhatsAppInmediata('ALT-1', 'MAQ-1')).toEqual({ ok: false, error: 'La sesión venció: ingresá de nuevo.' });
    expect(await triggerAlertaWhatsAppInmediata('ALT-1', 'MAQ-1')).toEqual({ ok: false, error: 'Sólo la Secretaría y el Administrador despachan alertas por WhatsApp.' });

    expect(fetchSinSesion).not.toHaveBeenCalled();
    const [url, init] = sesion.mock.calls[0];
    expect(url).toBe('/api/whatsapp/trigger-alerta-critica');
    expect(JSON.parse(String(init?.body))).toEqual({ alertaId: 'ALT-1', maquinaId: 'MAQ-1' });
  });

  it('triggerAlertaWhatsAppInmediata con éxito devuelve el resultado', async () => {
    sesion.mockResolvedValue(respuesta(201, { ok: true, envioRealizado: true, idMensaje: 'wamid.2', telefonoDestino: '+5491100000001' }));

    const r = await triggerAlertaWhatsAppInmediata('ALT-1');

    expect(r.ok).toBe(true);
  });
});

describe('el botón de WhatsApp de las alertas (criterio 4)', () => {
  const barra = (extra: Record<string, unknown> = {}) =>
    renderToString(
      React.createElement(AccionesAlertaCritica, {
        maquina, alertaId: 'ALT-URG-1', descargandoId: null, enviandoWaId: null, remitoClassName: 'btn-remito-naranja',
        onDescargarRemito: () => undefined, onEnviarWhatsApp: () => undefined, ...extra,
      }),
    );
  // Las dos tarjetas de la lista: una Fuera de Servicio (roja) y una Reparación Urgente (naranja), cada una con su barra de acciones.
  const fueraDeServicio = {
    ...maquina,
    id: 'MAQ-FS-1',
    estadoOperativo: 'Fuera de Servicio',
    alertaCritica: { ...maquina.alertaCritica!, id: 'ALT-FS-1', tipo: 'FUERA_DE_SERVICIO', titulo: 'FUERA DE SERVICIO', motivo: 'Cabina trabada entre pisos' },
  } as MaquinaEca;
  const lista = (puedeDespacharWhatsApp?: boolean) =>
    renderToString(React.createElement(AlertasCriticas, { maquinas: [fueraDeServicio, maquina], puedeDespacharWhatsApp }));

  it('con permiso (o sin indicar nada) la barra ofrece el botón', () => {
    expect(barra()).toContain('data-testid="btn-whatsapp-MAQ-URG-1"');
    expect(barra({ puedeDespacharWhatsApp: true })).toContain('Despachar Alerta WhatsApp');
  });

  it('sin permiso la barra no ofrece el botón', () => {
    const h = barra({ puedeDespacharWhatsApp: false });

    expect(h).not.toContain('btn-whatsapp-MAQ-URG-1');
    expect(h).not.toContain('Despachar Alerta WhatsApp');
    expect(h).toContain('btn-descargar-remito-MAQ-URG-1'); // lo demás de la barra no cambia
  });

  it('en la lista de alertas, la Secretaría y el Administrador lo ven en las dos tarjetas (Fuera de Servicio y Reparación Urgente)', () => {
    for (const h of [lista(true), lista()]) {
      expect(h).toContain('btn-whatsapp-MAQ-FS-1');
      expect(h).toContain('btn-whatsapp-MAQ-URG-1');
    }
  });

  it('en la lista de alertas, una ECA no ve el botón en ninguna de las dos tarjetas, pero sí las alertas', () => {
    const deLaEca = lista(false);

    expect(deLaEca).not.toContain('btn-whatsapp-');
    expect(deLaEca).toContain('Freno con deslizamiento crítico');
    expect(deLaEca).toContain('Cabina trabada entre pisos');
  });

  it('un envío que ya se hizo se sigue mostrando aunque el usuario no pueda volver a despachar', () => {
    const h = barra({ puedeDespacharWhatsApp: false, waEnviado: { idMensaje: 'wamid.9', timestamp: '2026-11-25T10:00:00Z' } });

    expect(h).toContain('data-testid="whatsapp-status-MAQ-URG-1"');
    expect(h).toContain('wamid.9');
    expect(h).not.toContain('btn-whatsapp-MAQ-URG-1');
  });
});
