import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PanelMapaSinConexion } from '../mapa/PanelMapaSinConexion';
import { filterCommandItems, type Vista } from './command';
import { IconMapa } from './Icons';
import { IndicadorEstado, textoDelIndicador } from './IndicadorEstado';
import { NAV_ITEMS, NAV_RT, comandosDeNavegacion, itemsDeNavegacion } from './navegacion';

// HU-12 RF-04 — se retira la telemetría de «Estado del sistema»; la pestaña pasa a ser «Mapa sin conexión».
const TEXTOS_DE_LA_TELEMETRIA = /estado del sistema|telemetr|salud|postgis|service worker|backend|nestjs/i;
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('la pestaña «Mapa sin conexión» (criterio 2)', () => {
  const pestana = NAV_ITEMS.find((i) => i.id === 'mapa-sin-conexion');

  it('se llama «Mapa sin conexión» en el menú lateral y en la barra del celular, con su propio identificador', () => {
    expect(pestana).toMatchObject({ label: 'Mapa sin conexión', shortLabel: 'Sin conexión', testId: 'tab-mapa-sin-conexion' });
  });

  it('ninguna pestaña conserva el nombre, el identificador ni el ícono de «Estado del sistema»', () => {
    for (const item of [NAV_RT, ...NAV_ITEMS]) {
      expect(`${item.id} ${item.label} ${item.shortLabel} ${item.testId}`).not.toMatch(/sistema/i);
    }
  });

  it('los identificadores y los testIds no se repiten', () => {
    const todas = [NAV_RT, ...NAV_ITEMS];
    expect(new Set(ids(todas)).size).toBe(todas.length);
    expect(new Set(todas.map((i) => i.testId)).size).toBe(todas.length);
  });

  it('el ícono se dibuja, es el del mapa y ninguna otra pestaña lo comparte', () => {
    expect(renderToString(React.createElement(pestana!.icon, { size: 20 }))).toContain('<svg');
    expect(pestana!.icon).toBe(IconMapa);
    expect([NAV_RT, ...NAV_ITEMS].filter((i) => i.id !== 'mapa-sin-conexion').map((i) => i.icon)).not.toContain(IconMapa);
  });
});

describe('quién ve cada pestaña', () => {
  it.each(['secretaria', 'firmante'])('%s ve los portales, el chat y el mapa sin conexión, sin usuarios', (rol) => {
    expect(ids(itemsDeNavegacion(rol))).toEqual(['firmante', 'inspeccion', 'eca', 'secretaria', 'chat', 'mapa-sin-conexion']);
  });

  it('la ECA ve los portales y el mapa sin conexión, pero no el chat interno ni usuarios', () => {
    expect(ids(itemsDeNavegacion('eca'))).toEqual(['firmante', 'inspeccion', 'eca', 'secretaria', 'mapa-sin-conexion']);
  });

  it('el Administrador ve además Usuarios y permisos', () => {
    expect(ids(itemsDeNavegacion('administrador'))).toEqual(['firmante', 'inspeccion', 'eca', 'secretaria', 'chat', 'mapa-sin-conexion', 'usuarios']);
  });

  it('el RT de Calle ve su mapa, la inspección técnica y el chat, nada más', () => {
    expect(ids(itemsDeNavegacion('rt_calle'))).toEqual(['rt', 'inspeccion', 'chat']);
  });
});

describe('el buscador global (criterio 2)', () => {
  const alNavegar = vi.fn<(v: Vista) => void>();
  const comandos = comandosDeNavegacion(alNavegar);

  it('ofrece un comando por portal, y el último lleva al mapa sin conexión', () => {
    expect(comandos.map((c) => c.title)).toEqual([
      'Portal Firmante (RT Legal)',
      'Inspección Técnica (Checklist)',
      'Portal ECA (Conservadoras)',
      'Secretaría (Edificios y Máquinas)',
      'Mapa sin conexión',
    ]);
  });

  it('cada comando tiene su identificador, que la paleta usa para elegirlo', () => {
    expect(ids(comandos)).toEqual(['nav-firmante', 'nav-inspeccion', 'nav-eca', 'nav-secretaria', 'nav-mapa-sin-conexion']);
    expect(comandos.every((c) => c.group === 'Navegación')).toBe(true);
  });

  it('cada comando lleva a la vista que dice', () => {
    const destinos = ['firmante', 'inspeccion', 'eca', 'secretaria', 'mapa-sin-conexion'];
    comandos.forEach((c) => c.action());
    expect(alNavegar.mock.calls.map(([v]) => v)).toEqual(destinos);
  });

  it.each(['sin conexion', 'offline', 'mapa', 'descargar'])('«%s» encuentra el mapa sin conexión', (busqueda) => {
    expect(filterCommandItems(comandos, busqueda).map((c) => c.id)).toContain('nav-mapa-sin-conexion');
  });

  it.each(['estado del sistema', 'postgis', 'salud', 'service worker'])('«%s» ya no encuentra nada', (busqueda) => {
    expect(filterCommandItems(comandos, busqueda)).toEqual([]);
  });

  it('ningún comando habla de telemetría', () => {
    for (const c of comandos) expect(`${c.title} ${c.subtitle} ${c.keywords}`).not.toMatch(TEXTOS_DE_LA_TELEMETRIA);
  });
});

describe('el indicador del pie del menú (criterio 3)', () => {
  it.each([
    [null, 'Conectando…'],
    [{ kind: 'ok', postgis: '3.4.3' }, 'API + PostGIS OK'],
    [{ kind: 'db-error', message: 'la base no responde' }, 'Revisar sistema'],
    [{ kind: 'api-error', message: 'No se pudo contactar a la API' }, 'Revisar sistema'],
  ] as const)('con %j dice «%s»', (health, texto) => {
    expect(textoDelIndicador(health as never)).toBe(texto);
    expect(renderToString(React.createElement(IndicadorEstado, { health: health as never }))).toContain(texto);
  });

  it('el color del punto sigue al estado', () => {
    const punto = (health: unknown) => renderToString(React.createElement(IndicadorEstado, { health: health as never }));
    expect(punto(null)).toContain('dot-pending');
    expect(punto({ kind: 'ok', postgis: '3.4.3' })).toContain('dot-ok');
    expect(punto({ kind: 'api-error', message: 'x' })).toContain('dot-error');
    expect(punto({ kind: 'db-error', message: 'x' })).toContain('dot-error');
  });

  it('ya no es un botón: no se puede apretar ni lleva a ninguna pantalla', () => {
    const html = renderToString(React.createElement(IndicadorEstado, { health: { kind: 'ok', postgis: '3.4.3' } }));
    expect(html).not.toContain('<button');
    expect(html).not.toContain('onclick');
    expect(html).toContain('role="status"');
    expect(html).toContain('data-testid="indicador-estado"');
  });

  it('con el menú colapsado queda solo el punto', () => {
    const html = renderToString(React.createElement(IndicadorEstado, { health: { kind: 'ok', postgis: '3.4.3' }, colapsado: true }));
    expect(html).toContain('neo-dot');
    expect(html).not.toContain('API + PostGIS OK');
  });
});

describe('el panel del mapa sin conexión sigue en su pestaña (criterio 2)', () => {
  it('muestra su título, su nota y el mapa para bajar y usar sin señal', () => {
    const html = renderToString(React.createElement(PanelMapaSinConexion));

    expect(html).toContain('data-testid="panel-mapa-sin-conexion"');
    expect(html).toContain('Mapa de CABA para usar sin señal');
    expect(html).toContain('Bajalo una vez con wifi');
  });

  it('ya no habla del «Estado del sistema»', () => {
    expect(renderToString(React.createElement(PanelMapaSinConexion))).not.toMatch(TEXTOS_DE_LA_TELEMETRIA);
  });
});
