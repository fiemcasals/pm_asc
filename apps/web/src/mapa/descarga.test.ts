import { describe, expect, it } from 'vitest';
import { CLAVE_CACHE, CLAVE_CACHE_NUEVO, STORAGE_MAPA } from './config';
import {
  borrarMapa,
  descargarMapa,
  ErrorMapa,
  formatearTamano,
  hayVersionNueva,
  leerInfo,
  leerMapaGuardado,
  mapaDescargado,
  type Dependencias,
} from './descarga';

/** Un Cache de mentira, en memoria. */
class CacheFalso {
  almacen = new Map<string, Blob>();
  failPut: Error | null = null;
  async put(clave: RequestInfo | URL, respuesta: Response): Promise<void> {
    if (this.failPut) throw this.failPut;
    this.almacen.set(String(clave), await respuesta.blob());
  }
  async match(clave: RequestInfo | URL): Promise<Response | undefined> {
    const b = this.almacen.get(String(clave));
    return b ? new Response(b) : undefined;
  }
  async delete(clave: RequestInfo | URL): Promise<boolean> {
    return this.almacen.delete(String(clave));
  }
}

class AlmacenFalso {
  datos = new Map<string, string>();
  getItem(k: string) { return this.datos.get(k) ?? null; }
  setItem(k: string, v: string) { this.datos.set(k, v); }
  removeItem(k: string) { this.datos.delete(k); }
}

const enc = new TextEncoder();
const pmtiles = (marca: string, relleno = 20) => new Uint8Array([...enc.encode('PMTiles'), 3, ...enc.encode(marca.padEnd(relleno, '.'))]);

interface Servidor { cuerpo: Uint8Array; etag: string | null; estado?: number; cortarEn?: number; partes?: number; conLargo?: boolean }

function armar(servidor: () => Servidor) {
  const cache = new CacheFalso();
  const almacen = new AlmacenFalso();
  const pedidos: string[] = [];
  const dep: Dependencias = {
    almacen,
    abrirCache: async () => cache as unknown as Cache,
    fetchFn: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      pedidos.push(init?.method ?? 'GET');
      const s = servidor();
      const headers = new Headers();
      if (s.etag) headers.set('etag', s.etag);
      if (s.conLargo !== false) headers.set('content-length', String(s.cuerpo.length));
      if (s.estado && s.estado !== 200) return new Response('no', { status: s.estado });
      if (init?.method === 'HEAD') return new Response(null, { status: 200, headers });
      const partes = s.partes ?? 3;
      const tam = Math.ceil(s.cuerpo.length / partes);
      let i = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(c) {
          if (s.cortarEn !== undefined && i >= s.cortarEn) { c.error(new TypeError('se cortó la conexión')); return; }
          if (i >= s.cuerpo.length) { c.close(); return; }
          c.enqueue(s.cuerpo.slice(i, i + tam));
          i += tam;
        },
      });
      return new Response(stream, { status: 200, headers });
    }) as typeof fetch,
  };
  return { dep, cache, almacen, pedidos };
}

describe('descargarMapa', () => {
  it('baja el mapa en partes, avisa el avance y lo deja guardado con su versión', async () => {
    const mapa = pmtiles('v1', 60);
    const { dep, cache, almacen } = armar(() => ({ cuerpo: mapa, etag: '"v1"' }));
    const avances: number[] = [];
    const info = await descargarMapa(dep, { onProgreso: (p) => avances.push(Math.round(((p.recibidos / (p.total ?? 1)) * 100))) });

    expect(avances.length).toBe(3);
    expect(avances[avances.length - 1]).toBe(100);
    expect([...avances].sort((a, b) => a - b)).toEqual(avances); // el avance solo sube
    expect(info).toMatchObject({ version: '"v1"', bytes: mapa.length });
    expect(JSON.parse(almacen.datos.get(STORAGE_MAPA) ?? '{}')).toMatchObject({ version: '"v1"', bytes: mapa.length });
    expect(cache.almacen.has(CLAVE_CACHE)).toBe(true);
    expect(cache.almacen.has(CLAVE_CACHE_NUEVO)).toBe(false);
    expect(await mapaDescargado(dep)).toMatchObject({ bytes: mapa.length });
    const guardado = await leerMapaGuardado(dep);
    expect(new Uint8Array(await (guardado as Blob).arrayBuffer())).toEqual(mapa);
  });

  it('rechaza lo que no es un PMTiles, como el index.html que el servidor da cuando el archivo no existe', async () => {
    const html = enc.encode('<!doctype html><html><body>app</body></html>');
    const { dep, cache, almacen } = armar(() => ({ cuerpo: html, etag: null }));
    await expect(descargarMapa(dep)).rejects.toThrow(/falta cargar el archivo del mapa/);
    expect(cache.almacen.size).toBe(0);
    expect(almacen.datos.size).toBe(0);
  });

  it('si el servidor no entrega el mapa, lo dice con el código', async () => {
    const { dep } = armar(() => ({ cuerpo: new Uint8Array(), etag: null, estado: 404 }));
    await expect(descargarMapa(dep)).rejects.toThrow(/HTTP 404/);
  });

  it('si se corta la conexión a mitad de la descarga, el mapa que ya había sigue sirviendo', async () => {
    const v1 = pmtiles('versionUno', 60);
    let servidor: Servidor = { cuerpo: v1, etag: '"v1"' };
    const { dep, cache } = armar(() => servidor);
    await descargarMapa(dep);

    servidor = { cuerpo: pmtiles('versionDos', 90), etag: '"v2"', cortarEn: 30 };
    await expect(descargarMapa(dep)).rejects.toThrow();

    expect(leerInfo(dep)).toMatchObject({ version: '"v1"', bytes: v1.length });
    expect(new Uint8Array(await ((await leerMapaGuardado(dep)) as Blob).arrayBuffer())).toEqual(v1);
    expect(cache.almacen.has(CLAVE_CACHE_NUEVO)).toBe(false);
  });

  it('una versión nueva reemplaza a la anterior recién cuando terminó de bajar y no deja restos', async () => {
    let servidor: Servidor = { cuerpo: pmtiles('versionUno', 60), etag: '"v1"' };
    const { dep, cache } = armar(() => servidor);
    await descargarMapa(dep);
    const v2 = pmtiles('versionDos', 90);
    servidor = { cuerpo: v2, etag: '"v2"' };
    await descargarMapa(dep);

    expect(leerInfo(dep)).toMatchObject({ version: '"v2"', bytes: v2.length });
    expect(new Uint8Array(await ((await leerMapaGuardado(dep)) as Blob).arrayBuffer())).toEqual(v2);
    expect(cache.almacen.has(CLAVE_CACHE_NUEVO)).toBe(false);
  });

  it('sin etag ni fecha usa el tamaño como versión, y sin content-length igual baja el mapa', async () => {
    const mapa = pmtiles('v1', 60);
    const { dep } = armar(() => ({ cuerpo: mapa, etag: null, conLargo: false }));
    const avances: Array<number | null> = [];
    const info = await descargarMapa(dep, { onProgreso: (p) => avances.push(p.total) });
    expect(info.version).toBe(String(mapa.length));
    expect(avances.every((t) => t === null)).toBe(true);
  });

  it('si no hay lugar en el celular, lo dice', async () => {
    const { dep, cache } = armar(() => ({ cuerpo: pmtiles('v1', 60), etag: '"v1"' }));
    const cuota = new Error('cuota');
    cuota.name = 'QuotaExceededError';
    cache.failPut = cuota;
    await expect(descargarMapa(dep)).rejects.toThrow(/No hay espacio/);
    expect(leerInfo(dep)).toBeNull();
  });
});

describe('mapaDescargado y leerInfo', () => {
  it('no cuenta como descargado si el navegador borró la caché aunque la nota siga', async () => {
    const { dep, cache } = armar(() => ({ cuerpo: pmtiles('v1', 60), etag: '"v1"' }));
    await descargarMapa(dep);
    cache.almacen.clear();
    expect(await mapaDescargado(dep)).toBeNull();
    expect(await leerMapaGuardado(dep)).toBeNull();
  });

  it('ignora una nota dañada', () => {
    const { dep, almacen } = armar(() => ({ cuerpo: new Uint8Array(), etag: null }));
    almacen.setItem(STORAGE_MAPA, '{no es json');
    expect(leerInfo(dep)).toBeNull();
    almacen.setItem(STORAGE_MAPA, JSON.stringify({ version: 1 }));
    expect(leerInfo(dep)).toBeNull();
  });

  it('borrarMapa deja todo como al principio', async () => {
    const { dep, cache, almacen } = armar(() => ({ cuerpo: pmtiles('v1', 60), etag: '"v1"' }));
    await descargarMapa(dep);
    await borrarMapa(dep);
    expect(cache.almacen.size).toBe(0);
    expect(almacen.datos.size).toBe(0);
  });
});

describe('hayVersionNueva', () => {
  it('avisa cuando el servidor tiene otra versión y no cuando es la misma', async () => {
    let servidor: Servidor = { cuerpo: pmtiles('v1', 60), etag: '"v1"' };
    const { dep, pedidos } = armar(() => servidor);
    await descargarMapa(dep);
    expect(await hayVersionNueva(dep)).toBe(false);
    servidor = { cuerpo: pmtiles('v2', 90), etag: '"v2"' };
    expect(await hayVersionNueva(dep)).toBe(true);
    expect(pedidos.filter((m) => m === 'HEAD').length).toBe(2); // pregunta con HEAD: no baja el archivo para saberlo
  });

  it('sin etag compara el tamaño', async () => {
    let servidor: Servidor = { cuerpo: pmtiles('v1', 60), etag: null };
    const { dep } = armar(() => servidor);
    await descargarMapa(dep);
    expect(await hayVersionNueva(dep)).toBe(false);
    servidor = { cuerpo: pmtiles('v2', 90), etag: null };
    expect(await hayVersionNueva(dep)).toBe(true);
  });

  it('sin mapa guardado, sin conexión o con el servidor caído, no avisa nada', async () => {
    const sinNada = armar(() => ({ cuerpo: new Uint8Array(), etag: '"v9"' }));
    expect(await hayVersionNueva(sinNada.dep)).toBe(false);

    const guardado = armar(() => ({ cuerpo: pmtiles('v1', 60), etag: '"v1"' }));
    await descargarMapa(guardado.dep);
    guardado.dep.fetchFn = (async () => { throw new TypeError('sin red'); }) as typeof fetch;
    expect(await hayVersionNueva(guardado.dep)).toBe(false);
    guardado.dep.fetchFn = (async () => new Response(null, { status: 503 })) as typeof fetch;
    expect(await hayVersionNueva(guardado.dep)).toBe(false);
  });
});

describe('formatearTamano', () => {
  it('muestra los megabytes con una coma decimal', () => {
    expect(formatearTamano(11_186_000)).toMatch(/^10,7 MB$/);
  });
});

describe('ErrorMapa', () => {
  it('es un Error común', () => {
    expect(new ErrorMapa('x')).toBeInstanceOf(Error);
  });
});
