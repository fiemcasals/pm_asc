import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// HU-08 RF-04 — Portal del Firmante con sesión: el cliente trabaja con la sesión y cada rol hace lo suyo.
vi.mock('../auth/sesion', () => ({ fetchConSesion: vi.fn() }));

import { fetchConSesion } from '../auth/sesion';
import {
  autorizarFirmaMaquina,
  fetchMaquinasFirmante,
  type MaquinaAsignada,
  mensajeDeErrorFirmante,
  puedeFirmarComo,
  rechazarInformeMaquina,
} from './firmante';
import { ModalAuditoria } from './ModalAuditoria';
import { PortalFirmante, TarjetaMaquina } from './PortalFirmante';

const sesion = vi.mocked(fetchConSesion);
const respuesta = (status: number, cuerpo: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response;

const maquina: MaquinaAsignada = {
  id: 'MAQ-1', codigoAGC: 'M1', nombre: 'M1: Ascensor Principal',
  edificio: { id: 'E1', direccion: 'Av. Corrientes 1234, CABA', administracion: 'Admin Central', consorcio: 'Consorcio 1234' },
  eca: 'Conservación SRL', rtCalle: 'dev-ma-2', firmanteId: 'USR-1', firmanteUsername: 'gonza', mes: '2026-11', estado: 'Recorrida',
  visita: {
    id: 'VIS-1', fecha: '2026-11-04T10:00:00Z', inspector: 'dev-ma-2', estado: 'Recorrida',
    fotosObligatorias: { cables: 'https://fotos.local/cables.jpg', frente: 'https://fotos.local/frente.jpg' },
    firmaEncargado: 'data:image/svg+xml;base64,abc', nombreEncargado: 'Carlos', autorizada: false,
  },
};

beforeEach(() => {
  sesion.mockReset();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('el portal del Firmante no tiene que usar fetch sin sesión'))));
});

describe('puedeFirmarComo: sólo el Firmante autoriza (criterio 3)', () => {
  it.each([['firmante', true], ['secretaria', false], ['administrador', false], ['rt_calle', false], ['eca', false]])('%s → %s', (rol, esperado) => {
    expect(puedeFirmarComo({ rol })).toBe(esperado);
  });
});

describe('mensajeDeErrorFirmante: se explica por qué no se pudo', () => {
  it('401 es sesión vencida; 403 sin permiso; 403 de autorizar o rechazar, que es sólo del Firmante', () => {
    expect(mensajeDeErrorFirmante(401, 'x')).toMatch(/sesión venció/);
    expect(mensajeDeErrorFirmante(403, 'x')).toBe('Tu usuario no tiene acceso al panel del Firmante.');
    expect(mensajeDeErrorFirmante(403, 'x', true)).toBe('Sólo el Firmante autoriza o rechaza la firma AGC.');
  });
  it('el resto conserva el código y lo que se intentaba', () => {
    expect(mensajeDeErrorFirmante(500, 'no se pudo cargar las máquinas')).toBe('Error 500: no se pudo cargar las máquinas');
  });
});

describe('el cliente del Firmante trabaja con la sesión (criterio 5)', () => {
  it('las máquinas se piden con fetchConSesion, sin mandar ningún usuario por header, y nunca con fetch sin sesión', async () => {
    sesion.mockResolvedValue(respuesta(200, [maquina]));

    const res = await fetchMaquinasFirmante();

    expect(res).toMatchObject({ ok: true, data: [expect.objectContaining({ id: 'MAQ-1' })] });
    expect(sesion).toHaveBeenCalledTimes(1);
    const [url, init] = sesion.mock.calls[0];
    expect(url).toBe('/api/firmante/maquinas');
    expect(init?.headers).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('el mes viaja escapado en la URL', async () => {
    sesion.mockResolvedValue(respuesta(200, []));

    await fetchMaquinasFirmante(undefined, '2026-11');

    expect(sesion.mock.calls[0][0]).toBe('/api/firmante/maquinas?mes=2026-11');
  });

  it('autorizar se manda con la sesión, sólo con el id de la máquina (sin usuario)', async () => {
    sesion.mockResolvedValue(respuesta(200, { ok: true, autorizacion: { autorizada: true } }));

    await autorizarFirmaMaquina('MAQ-1');

    const [url, init] = sesion.mock.calls[0];
    expect(url).toBe('/api/firmante/autorizar');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ maquinaId: 'MAQ-1' });
    expect(JSON.stringify(init?.headers)).not.toMatch(/x-user/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rechazar se manda con la sesión, con el motivo, y queda a nombre de quien rechaza (no se manda usuario)', async () => {
    sesion.mockResolvedValue(respuesta(200, { ok: true }));

    const res = await rechazarInformeMaquina('MAQ-1', 'Falta la foto de cables');

    expect(res).toEqual({ ok: true });
    const [url, init] = sesion.mock.calls[0];
    expect(url).toBe('/api/firmante/rechazar');
    expect(JSON.parse(init?.body as string)).toEqual({ maquinaId: 'MAQ-1', motivo: 'Falta la foto de cables' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['máquinas', () => fetchMaquinasFirmante(), 403, 'Tu usuario no tiene acceso al panel del Firmante.'],
    ['máquinas', () => fetchMaquinasFirmante(), 401, 'La sesión venció: ingresá de nuevo.'],
    ['autorizar', () => autorizarFirmaMaquina('MAQ-1'), 403, 'Sólo el Firmante autoriza o rechaza la firma AGC.'],
    ['autorizar', () => autorizarFirmaMaquina('MAQ-1'), 401, 'La sesión venció: ingresá de nuevo.'],
    ['rechazar', () => rechazarInformeMaquina('MAQ-1', 'x'), 403, 'Sólo el Firmante autoriza o rechaza la firma AGC.'],
    ['rechazar', () => rechazarInformeMaquina('MAQ-1', 'x'), 401, 'La sesión venció: ingresá de nuevo.'],
  ])('%s con %i explica el motivo', async (_n, pedir, status, mensaje) => {
    sesion.mockResolvedValue(respuesta(status));

    expect((await pedir()).error).toBe(mensaje);
  });

  it('rechazar conserva el motivo que da la API (por ejemplo, el informe ya fue autorizado)', async () => {
    sesion.mockResolvedValue(respuesta(409, { message: 'No se puede rechazar: el informe ya fue autorizado.' }));

    expect(await rechazarInformeMaquina('MAQ-1', 'x')).toEqual({ ok: false, error: 'No se puede rechazar: el informe ya fue autorizado.' });
  });
});

describe('qué ve cada rol en el panel (criterios 3 y 5)', () => {
  const portal = (rol: string, usuario = 'gonza') => renderToString(React.createElement(PortalFirmante, { rol, usuario }));

  it('un Firmante ve su usuario y no la nota de sólo lectura', () => {
    const h = portal('firmante', 'gonza');

    expect(h).toContain('data-testid="firmante-usuario"');
    expect(h).toContain('gonza');
    expect(h).not.toContain('nota-solo-firmante');
    expect(h).not.toContain('firmante-todos');
  });

  it.each([['secretaria'], ['administrador']])('%s ve «todos los Firmantes» y la nota de que la firma AGC la autoriza el Firmante', (rol) => {
    const h = portal(rol, 'demo.secretaria');

    expect(h).toContain('data-testid="firmante-todos"');
    expect(h).toContain('data-testid="nota-solo-firmante"');
    expect(h).not.toContain('firmante-usuario');
  });

  it('sin indicar el rol se comporta como el Firmante (lo que había)', () => {
    expect(renderToString(React.createElement(PortalFirmante, { usuario: 'gonza' }))).toContain('data-testid="firmante-usuario"');
  });
});

describe('la tarjeta de cada máquina', () => {
  const tarjeta = (puedeFirmar: boolean, m: MaquinaAsignada = maquina) =>
    renderToString(React.createElement(TarjetaMaquina, { m, puedeFirmar, onSeleccionar: () => undefined }));

  it('el Firmante ve «Auditar» y «Autorizar Firma AGC»', () => {
    const h = tarjeta(true);

    expect(h).toContain('data-testid="btn-auditar-MAQ-1"');
    expect(h).toContain('data-testid="btn-autorizar-MAQ-1"');
    expect(h).toContain('Autorizar Firma AGC');
  });

  it('la Secretaría y el Administrador ven la máquina y pueden auditar el informe, pero no autorizar', () => {
    const h = tarjeta(false);

    expect(h).toContain('data-testid="btn-auditar-MAQ-1"');
    expect(h).not.toContain('btn-autorizar-MAQ-1');
    expect(h).toContain('M1: Ascensor Principal');
  });

  it('sin permiso tampoco se muestra el motivo de bloqueo de una autorización que no les corresponde', () => {
    const incompleta = { ...maquina, visita: { ...maquina.visita!, firmaEncargado: '' } };

    expect(tarjeta(true, incompleta)).toContain('bloqueo-hint');
    expect(tarjeta(false, incompleta)).not.toContain('bloqueo-hint');
  });
});

describe('el informe a auditar', () => {
  const modal = (puedeFirmar?: boolean) =>
    renderToString(React.createElement(ModalAuditoria, { maquina, onClose: () => undefined, onAutorizar: async () => undefined, puedeFirmar }));

  it('el Firmante (o sin indicar nada) ve el botón de autorizar', () => {
    expect(modal(true)).toContain('data-testid="btn-confirmar-autorizar"');
    expect(modal()).toContain('data-testid="btn-confirmar-autorizar"');
  });

  it('sin permiso no hay botón de autorizar y se explica que es sólo lectura', () => {
    const h = modal(false);

    expect(h).not.toContain('btn-confirmar-autorizar');
    expect(h).toContain('data-testid="modal-solo-firmante"');
    expect(h).toContain('la firma AGC la autoriza el Firmante');
  });

  it('el informe se sigue viendo completo', () => {
    expect(modal(false)).toContain('Carlos');
  });
});
