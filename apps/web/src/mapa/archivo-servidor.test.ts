import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AvisoDelMapa, type EstadoMapaBase } from './AvisoDelMapa';
import { STORAGE_MAPA, URL_MAPA } from './config';
import { archivoDelServidor, descargarMapa, hayVersionNueva, tamanoRemoto, type Dependencias } from './descarga';

// HU-16 RF-06 — si el servidor no tiene el archivo del mapa (y contesta con su página), la app lo dice en vez de dibujar un mapa vacío.
const enc = new TextEncoder();
const PAGINA = '<!doctype html><html><head><title>mant_asc</title></head><body><div id="root"></div></body></html>';

const dependencias = (fetchFn: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>, almacen: Record<string, string> = {}): Dependencias => ({
  fetchFn: fetchFn as typeof fetch,
  abrirCache: async () => {
    throw new Error('no se debe tocar la caché');
  },
  almacen: { getItem: (k) => almacen[k] ?? null, setItem: (k, v) => void (almacen[k] = v), removeItem: (k) => void delete almacen[k] },
});
const respuesta = (cuerpo: string | Uint8Array | null, init: ResponseInit & { tipo?: string } = {}) =>
  new Response(cuerpo as BodyInit | null, { status: 200, ...init, headers: { ...(init.tipo ? { 'content-type': init.tipo } : {}), ...(init.headers as Record<string, string>) } });
const archivoReal = (n = 400) => new Uint8Array([...enc.encode('PMTiles'), 3, ...new Uint8Array(n)]);

describe('archivoDelServidor (criterio 3)', () => {
  it('con el archivo en el servidor pide solo sus primeros bytes, sin caché, y lo da por válido', async () => {
    const fetchFn = vi.fn(async () => respuesta(enc.encode('PMTiles'), { status: 206, tipo: 'application/octet-stream' }));

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('valido');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_MAPA);
    expect(init.headers).toEqual({ Range: 'bytes=0-6' });
    expect(init.cache).toBe('no-store');
  });

  it('si el servidor ignora el pedido de rango y manda todo el archivo, lo reconoce sin leerlo entero', async () => {
    let leidos = 0;
    let cancelado = false;
    const cuerpo = new ReadableStream<Uint8Array>({
      pull(c) {
        leidos += 1;
        c.enqueue(leidos === 1 ? archivoReal(1000) : new Uint8Array(1000));
        if (leidos > 50) c.close();
      },
      cancel() {
        cancelado = true;
      },
    });
    const fetchFn = async () => new Response(cuerpo, { status: 200, headers: { 'content-type': 'application/octet-stream' } });

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('valido');
    expect(leidos).toBeLessThan(5);
    expect(cancelado).toBe(true);
  });

  it('el comienzo llega partido en pedazos y igual lo reconoce', async () => {
    const cuerpo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('PMT'));
        c.enqueue(enc.encode('iles'));
        c.close();
      },
    });
    const fetchFn = async () => new Response(cuerpo, { status: 206, headers: { 'content-type': 'application/octet-stream' } });

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('valido');
  });

  it('si el archivo falta, el servidor devuelve su página con un 200 (text/html): está ausente', async () => {
    const fetchFn = async () => respuesta(PAGINA, { tipo: 'text/html; charset=utf-8' });

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('ausente');
  });

  it('una página con un 206 de rango (como la que contestó el sitio real) también está ausente', async () => {
    const fetchFn = async () => respuesta('<!doctyp', { status: 206, tipo: 'text/html' });

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('ausente');
  });

  it('si el servidor no dice qué tipo es pero lo que manda no empieza con «PMTiles», está ausente', async () => {
    const fetchFn = async () => respuesta(PAGINA);

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('ausente');
  });

  it.each([['PMTilez', 'otra letra'], ['PMT', 'cortado']])('«%s» (%s) no es un PMTiles', async (inicio) => {
    const fetchFn = async () => respuesta(enc.encode(inicio), { tipo: 'application/octet-stream' });

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('ausente');
  });

  it('aunque el cuerpo diga «PMTiles», si el servidor dice que es una página (text/html), está ausente', async () => {
    const fetchFn = async () => respuesta('PMTiles', { tipo: 'text/html' });

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('ausente');
  });

  it.each([[404], [403], [500]])('un %i del servidor está ausente aunque su cuerpo empiece con «PMTiles»', async (status) => {
    const fetchFn = async () => new Response('PMTiles3', { status, headers: { 'content-type': 'application/octet-stream' } });

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('ausente');
  });

  it('una respuesta sin flujo (solo con arrayBuffer) también se lee, y se recorta a lo pedido', async () => {
    const sinFlujo = (texto: string) => ({ ok: true, status: 206, headers: new Headers(), body: null, arrayBuffer: async () => enc.encode(texto).buffer }) as unknown as Response;

    expect(await archivoDelServidor(dependencias(async () => sinFlujo('PMTilesresto del archivo')))).toBe('valido');
    expect(await archivoDelServidor(dependencias(async () => sinFlujo('<!doctype html>')))).toBe('ausente');
  });

  it.each([[404], [403], [500], [502]])('un %i del servidor está ausente', async (status) => {
    const fetchFn = async () => new Response('no', { status });

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('ausente');
  });

  it('sin red (el pedido falla) no se sabe: «sin-red», para que siga el camino de sin conexión', async () => {
    const fetchFn = async () => {
      throw new TypeError('Failed to fetch');
    };

    expect(await archivoDelServidor(dependencias(fetchFn))).toBe('sin-red');
  });
});

describe('el resto de la descarga no se deja engañar por la página (criterio 3)', () => {
  it('tamanoRemoto: una página no es un tamaño de mapa; un archivo real sí', async () => {
    const pagina = dependencias(async () => respuesta(null, { tipo: 'text/html', headers: { 'content-length': '924' } }));
    const real = dependencias(async () => respuesta(null, { tipo: 'application/octet-stream', headers: { 'content-length': '11190165' } }));

    expect(await tamanoRemoto(pagina)).toBeNull();
    expect(await tamanoRemoto(real)).toBe(11190165);
  });

  it('hayVersionNueva: una página con otro etag no avisa de una versión nueva; un archivo con otro etag sí', async () => {
    const guardado = { [STORAGE_MAPA]: JSON.stringify({ version: '"vieja"', bytes: 11190165, fecha: '2026-11-25T10:00:00Z' }) };
    const pagina = dependencias(async () => respuesta(null, { tipo: 'text/html', headers: { etag: '"otra"', 'content-length': '924' } }), { ...guardado });
    const archivo = dependencias(async () => respuesta(null, { tipo: 'application/octet-stream', headers: { etag: '"nueva"', 'content-length': '11190165' } }), { ...guardado });

    expect(await hayVersionNueva(pagina)).toBe(false);
    expect(await hayVersionNueva(archivo)).toBe(true);
  });

  it('descargarMapa: bajar la página como si fuera el mapa falla con un mensaje para quien usa la app', async () => {
    const fetchFn = async () => respuesta(PAGINA, { tipo: 'text/html', headers: { 'content-length': String(PAGINA.length) } });

    await expect(descargarMapa(dependencias(fetchFn))).rejects.toThrow('El mapa no está disponible en el servidor: falta cargar el archivo del mapa. Avisale al administrador.');
  });
});

describe('AvisoDelMapa: el cartel sobre el mapa (criterio 3)', () => {
  const html = (estado: EstadoMapaBase) => renderToString(React.createElement(AvisoDelMapa, { estado, onReintentar: () => undefined }));

  it('sin el archivo en el servidor dice «El mapa no está disponible», explica qué falta y ofrece reintentar', () => {
    const h = html('sin-archivo');

    expect(h).toContain('data-testid="mapa-sin-archivo"');
    expect(h).toContain('El mapa no está disponible.');
    expect(h).toContain('Falta cargar el archivo del mapa en el servidor: avisale al administrador.');
    expect(h).toContain('Reintentar');
    expect(h).toContain('role="alert"');
  });

  it('el cartel es para quien usa la app: no habla de comandos ni de npm', () => {
    expect(html('sin-archivo')).not.toMatch(/npm|mapa:generar|pmtiles/i);
  });

  it('con el mapa listo no se pone ningún cartel', () => {
    expect(html('listo')).toBe('');
  });

  it.each([
    ['cargando', 'Cargando el mapa…', null],
    ['sin-descargar', 'Mapa sin descargar: conectate a una red para bajarlo.', 'mapa-sin-descargar'],
    ['sin-webgl', 'Este dispositivo no puede dibujar el mapa.', 'mapa-sin-webgl'],
    ['error', 'No se pudo dibujar el mapa.', 'mapa-error'],
  ] as const)('%s sigue diciendo lo de antes', (estado, texto, testid) => {
    const h = html(estado);

    expect(h).toContain(texto);
    if (testid) expect(h).toContain(`data-testid="${testid}"`);
  });

  // Se llama al componente como función para llegar al botón y apretarlo sin necesitar un navegador.
  const botonDe = (nodo: unknown): { props: { onClick?: () => void } } | null => {
    if (!nodo || typeof nodo !== 'object') return null;
    const el = nodo as { type?: unknown; props?: { children?: unknown; onClick?: () => void } };
    if (el.type === 'button') return el as { props: { onClick?: () => void } };
    const hijos = ([] as unknown[]).concat(el.props?.children ?? []);
    for (const h of hijos) {
      const b = botonDe(h);
      if (b) return b;
    }
    return null;
  };

  it.each(['sin-archivo', 'error'] as const)('el botón «Reintentar» de «%s» vuelve a intentar al apretarlo', (estado) => {
    const alReintentar = vi.fn();
    const arbol = AvisoDelMapa({ estado, onReintentar: alReintentar });

    botonDe(arbol)!.props.onClick!();

    expect(alReintentar).toHaveBeenCalledTimes(1);
  });

  it('solo «sin-archivo» y «error» ofrecen reintentar', () => {
    const conBoton = (['cargando', 'listo', 'sin-descargar', 'sin-webgl', 'sin-archivo', 'error'] as const).filter((e) => html(e).includes('<button'));

    expect(conBoton).toEqual(['sin-archivo', 'error']);
  });
});
