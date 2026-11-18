import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// HU-15 RF-02 — Portal ECA con sesión: el cliente trabaja con la sesión del usuario y cada rol ve lo suyo.
vi.mock('../auth/sesion', () => ({ fetchConSesion: vi.fn() }));

import { fetchConSesion } from '../auth/sesion';
import { AccionesAlertaCritica, AlertasCriticas } from './AlertasCriticas';
import { PortalEca } from './PortalEca';
import {
  alcanceEca,
  descargarRemitoTecnico,
  fetchAlertasEca,
  fetchCoberturaEca,
  fetchMaquinasEca,
  mensajeDeError,
  type MaquinaEca,
  puedeAcusarRemito,
} from './eca';

const sesion = vi.mocked(fetchConSesion);
const respuesta = (status: number, cuerpo: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response;

const maquinaConAlerta: MaquinaEca = {
  id: 'MAQ-URG-1',
  codigoAGC: 'M1',
  nombre: 'M1: Ascensor Principal',
  edificio: { id: 'EDIF-3', direccion: 'Av. Santa Fe 3200, CABA', administracion: 'Palermo Admin', consorcio: 'Consorcio Santa Fe 3200' },
  eca: 'MAICON Mantenimiento',
  rtCalle: 'dev-ma-2',
  mes: '2026-11',
  estado: 'Recorrida',
  estadoOperativo: 'Reparación Urgente',
  alertaCritica: { id: 'ALT-URG-1', tipo: 'REPARACION_URGENTE', titulo: 'REPARACIÓN URGENTE', motivo: 'Freno con deslizamiento crítico', fechaDeteccion: '2026-11-06T09:15:00Z' },
  visita: null,
};

beforeEach(() => {
  sesion.mockReset();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('el portal ECA no tiene que usar fetch sin sesión'))));
});

describe('alcanceEca: qué ECA mira el portal según quién ingresó (criterios 2 y 3)', () => {
  it('un usuario ECA ve la suya', () => {
    expect(alcanceEca({ rol: 'eca', eca: 'Elevadores San Martín' })).toEqual({ modo: 'propia', eca: 'Elevadores San Martín' });
    expect(alcanceEca({ rol: 'eca', eca: '  MAICON Mantenimiento ' })).toEqual({ modo: 'propia', eca: 'MAICON Mantenimiento' });
  });

  it.each([[null], [undefined], [''], ['   ']])('un usuario ECA sin ECA asignada (%j) no puede ver nada', (eca) => {
    expect(alcanceEca({ rol: 'eca', eca })).toEqual({ modo: 'sin-eca' });
  });

  it.each([['secretaria'], ['administrador']])('%s elige la ECA a mirar, aunque su usuario traiga una', (rol) => {
    expect(alcanceEca({ rol, eca: null })).toEqual({ modo: 'elegir' });
    expect(alcanceEca({ rol, eca: 'MAICON Mantenimiento' })).toEqual({ modo: 'elegir' });
  });
});

describe('mensajeDeError: se explica por qué no se pudo', () => {
  it('401 es sesión vencida; 403 sin ECA o sin permiso; 403 del remito, que es sólo de la ECA', () => {
    expect(mensajeDeError(401, 'x')).toMatch(/sesión venció/);
    expect(mensajeDeError(403, 'x')).toMatch(/no tiene acceso.*ECA asignada/);
    expect(mensajeDeError(403, 'x', true)).toBe('Sólo la ECA puede descargar el remito y registrar el acuse legal.');
  });
  it('404 y el resto conservan el código y lo que se intentaba', () => {
    expect(mensajeDeError(404, 'no se pudo descargar')).toMatch(/404.*no se pudo descargar/);
    expect(mensajeDeError(500, 'no se pudo obtener cobertura')).toBe('Error 500: no se pudo obtener cobertura');
  });
});

describe('el cliente del portal ECA trabaja con la sesión (criterio 5)', () => {
  it.each([
    ['alertas', () => fetchAlertasEca('Elevadores San Martín', '2026-11'), '/api/eca/alertas?'],
    ['cobertura', () => fetchCoberturaEca('Elevadores San Martín', '2026-11'), '/api/eca/cobertura?'],
    ['máquinas', () => fetchMaquinasEca('Elevadores San Martín', '2026-11'), '/api/eca/maquinas?'],
  ])('%s se pide con fetchConSesion (nunca con fetch sin sesión)', async (_n, pedir, ruta) => {
    sesion.mockResolvedValue(respuesta(200, []));

    const res = await pedir();

    expect(res.ok).toBe(true);
    expect(sesion).toHaveBeenCalledTimes(1);
    expect(String(sesion.mock.calls[0][0])).toContain(ruta);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('el remito se pide con la sesión, en PDF, y sin mandar ningún «usuario» (lo toma el servidor de la sesión)', async () => {
    sesion.mockResolvedValue(respuesta(500));

    await descargarRemitoTecnico('ALT-1');

    const [url] = sesion.mock.calls[0];
    expect(String(url)).toBe('/api/eca/remito/ALT-1?formato=pdf');
    expect(String(url)).not.toContain('usuario');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('el id de la alerta se escapa en la URL', async () => {
    sesion.mockResolvedValue(respuesta(500));

    await descargarRemitoTecnico('ALT 1/../x');

    expect(String(sesion.mock.calls[0][0])).toBe('/api/eca/remito/ALT%201%2F..%2Fx?formato=pdf');
  });

  it('sin permiso (403) el remito explica que es sólo de la ECA; con la sesión vencida (401), que ingrese de nuevo', async () => {
    sesion.mockResolvedValueOnce(respuesta(403));
    expect(await descargarRemitoTecnico('ALT-1')).toEqual({ ok: false, error: 'Sólo la ECA puede descargar el remito y registrar el acuse legal.' });

    sesion.mockResolvedValueOnce(respuesta(401));
    expect((await descargarRemitoTecnico('ALT-1')).error).toMatch(/sesión venció/);
  });

  it.each([
    ['alertas', () => fetchAlertasEca()],
    ['cobertura', () => fetchCoberturaEca()],
    ['máquinas', () => fetchMaquinasEca()],
  ])('si el servidor responde 403 a %s, el portal dice que no tiene acceso o ECA asignada', async (_n, pedir) => {
    sesion.mockResolvedValue(respuesta(403));

    const res = await pedir();

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no tiene acceso.*ECA asignada/);
  });
});

describe('PortalEca según quién ingresó (criterios 2, 3 y 5)', () => {
  const html = (usuario: { rol: string; eca?: string | null }) => renderToString(React.createElement(PortalEca, { usuario }));

  it('un usuario ECA ve su ECA y no puede elegir otra', () => {
    const h = html({ rol: 'eca', eca: 'Elevadores San Martín' });

    expect(h).toContain('data-testid="eca-propia"');
    expect(h).toContain('Elevadores San Martín');
    expect(h).not.toContain('data-testid="select-eca"');
  });

  it.each([['secretaria'], ['administrador']])('%s ve el selector con todas las ECA', (rol) => {
    const h = html({ rol, eca: null });

    expect(h).toContain('data-testid="select-eca"');
    expect(h).not.toContain('data-testid="eca-propia"');
    for (const eca of ['Conservación Porteña S.R.L.', 'Elevadores San Martín', 'MAICON Mantenimiento']) expect(h).toContain(eca);
  });

  it('un usuario ECA sin ECA asignada ve el motivo y ningún dato', () => {
    const h = html({ rol: 'eca', eca: null });

    expect(h).toContain('data-testid="eca-sin-asignar"');
    expect(h).toContain('Tu usuario no tiene una ECA asignada: pedile al Administrador que la cargue.');
    expect(h).not.toContain('data-testid="select-eca"');
    expect(h).not.toContain('tabla-flota-eca');
  });
});

describe('puedeAcusarRemito: sólo una ECA descarga el remito y registra el acuse (criterio 3)', () => {
  it.each([['eca', true], ['secretaria', false], ['administrador', false], ['rt_calle', false], ['firmante', false]])('%s → %s', (rol, esperado) => {
    expect(puedeAcusarRemito({ rol })).toBe(esperado);
  });
});

describe('la barra de acciones de una alerta (criterio 3)', () => {
  const barra = (extra: Record<string, unknown> = {}) =>
    renderToString(
      React.createElement(AccionesAlertaCritica, {
        maquina: maquinaConAlerta, alertaId: 'ALT-URG-1', descargandoId: null, enviandoWaId: null, remitoClassName: 'btn-remito-naranja',
        onDescargarRemito: () => undefined, onEnviarWhatsApp: () => undefined, ...extra,
      }),
    );

  it('sin indicar nada ofrece el remito (es lo que ve una ECA)', () => {
    expect(barra()).toContain('data-testid="btn-descargar-remito-MAQ-URG-1"');
    expect(barra({ puedeDescargarRemito: true })).toContain('btn-descargar-remito-MAQ-URG-1');
  });

  it('con puedeDescargarRemito en false no lo ofrece y avisa que es de la ECA', () => {
    const h = barra({ puedeDescargarRemito: false });

    expect(h).not.toContain('btn-descargar-remito-MAQ-URG-1');
    expect(h).toContain('data-testid="nota-solo-eca-MAQ-URG-1"');
  });
});

describe('el remito es de la ECA (criterio 3)', () => {
  const html = (puedeAcusar?: boolean) => renderToString(React.createElement(AlertasCriticas, { maquinas: [maquinaConAlerta], puedeAcusar }));

  it('una ECA ve el botón para descargar el remito (y es lo que pasa si nada lo impide)', () => {
    expect(html(true)).toContain('data-testid="btn-descargar-remito-MAQ-URG-1"');
    expect(html()).toContain('data-testid="btn-descargar-remito-MAQ-URG-1"');
  });

  it('la Secretaría y el Administrador ven la alerta pero no el botón: se les explica que lo descarga la ECA', () => {
    const h = html(false);

    expect(h).not.toContain('btn-descargar-remito-MAQ-URG-1');
    expect(h).toContain('data-testid="nota-solo-eca-MAQ-URG-1"');
    expect(h).toContain('los descarga y registra la ECA');
    expect(h).toContain('Freno con deslizamiento crítico'); // la alerta sigue visible
  });
});
