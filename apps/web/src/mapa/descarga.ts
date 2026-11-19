import { CACHE_MAPA, CLAVE_CACHE, CLAVE_CACHE_NUEVO, STORAGE_MAPA, URL_MAPA } from './config';

/** Qué versión del mapa quedó guardada en el celular. */
export interface InfoMapa {
  /** ETag o fecha de modificación que informó el servidor; sirve para saber si hay una versión más nueva. */
  version: string;
  bytes: number;
  /** ISO de cuándo se bajó. */
  fecha: string;
}

export interface Progreso {
  recibidos: number;
  /** null si el servidor no informó el tamaño. */
  total: number | null;
}

/** Lo que necesita este módulo del navegador, para poder probarlo sin navegador. */
export interface Dependencias {
  fetchFn: typeof fetch;
  abrirCache: () => Promise<Cache>;
  almacen: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

export class ErrorMapa extends Error {}

const MAGIA_PMTILES = 'PMTiles';

export function dependenciasDelNavegador(): Dependencias {
  let almacen: Dependencias['almacen'] = null;
  try {
    almacen = window.localStorage;
  } catch {
    almacen = null; // modo privado o datos bloqueados: el mapa se baja igual, pero no se recuerda la versión
  }
  return {
    fetchFn: (...args) => fetch(...args),
    abrirCache: () => caches.open(CACHE_MAPA),
    almacen,
  };
}

/** Lo que se anotó de la última descarga, o null si nunca se bajó o la nota está dañada. */
export function leerInfo(dep: Dependencias): InfoMapa | null {
  try {
    const crudo = dep.almacen?.getItem(STORAGE_MAPA);
    if (!crudo) return null;
    const i = JSON.parse(crudo) as Partial<InfoMapa>;
    if (typeof i.version !== 'string' || typeof i.bytes !== 'number' || typeof i.fecha !== 'string') return null;
    return { version: i.version, bytes: i.bytes, fecha: i.fecha };
  } catch {
    return null;
  }
}

/** El mapa guardado en el celular, solo si la nota y el archivo existen los dos (el navegador puede haber borrado la caché). */
export async function mapaDescargado(dep: Dependencias): Promise<InfoMapa | null> {
  const info = leerInfo(dep);
  if (!info) return null;
  try {
    const cache = await dep.abrirCache();
    return (await cache.match(CLAVE_CACHE)) ? info : null;
  } catch {
    return null;
  }
}

/** El archivo del mapa guardado, para que MapLibre lo lea sin red; null si no está. */
export async function leerMapaGuardado(dep: Dependencias): Promise<Blob | null> {
  try {
    const cache = await dep.abrirCache();
    const respuesta = await cache.match(CLAVE_CACHE);
    return respuesta ? await respuesta.blob() : null;
  } catch {
    return null;
  }
}

function versionDe(res: Response): string | null {
  return res.headers.get('etag') ?? res.headers.get('last-modified');
}

/**
 * Baja el mapa una sola vez y lo guarda en el celular. La versión anterior se conserva hasta que la nueva termina de bajar
 * y se comprueba que es un archivo PMTiles: si se corta la conexión a la mitad, el mapa que ya había sigue sirviendo.
 */
export async function descargarMapa(
  dep: Dependencias,
  opciones: { onProgreso?: (p: Progreso) => void; signal?: AbortSignal } = {},
): Promise<InfoMapa> {
  const res = await dep.fetchFn(URL_MAPA, { cache: 'no-store', signal: opciones.signal });
  if (!res.ok) throw new ErrorMapa(`El servidor no entregó el mapa (HTTP ${res.status}).`);

  const largo = Number(res.headers.get('content-length'));
  const total = Number.isFinite(largo) && largo > 0 ? largo : null;
  const partes: Uint8Array[] = [];
  let recibidos = 0;
  if (res.body) {
    const lector = res.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      partes.push(value);
      recibidos += value.byteLength;
      opciones.onProgreso?.({ recibidos, total });
    }
  } else {
    const blob = await res.blob();
    partes.push(new Uint8Array(await blob.arrayBuffer()));
    recibidos = blob.size;
    opciones.onProgreso?.({ recibidos, total: recibidos });
  }

  const blob = new Blob(partes as BlobPart[], { type: 'application/octet-stream' });
  // Si el archivo no existe, el servidor de la app puede responder con el index.html (200): no es un mapa.
  const cabecera = new TextDecoder().decode(await blob.slice(0, MAGIA_PMTILES.length).arrayBuffer());
  if (cabecera !== MAGIA_PMTILES) {
    throw new ErrorMapa('El archivo del mapa no es válido: falta generarlo con «npm run mapa:generar».');
  }

  try {
    const cache = await dep.abrirCache();
    await cache.put(CLAVE_CACHE_NUEVO, new Response(blob));
    const nuevo = await cache.match(CLAVE_CACHE_NUEVO);
    if (!nuevo) throw new ErrorMapa('No se pudo guardar el mapa en este celular.');
    await cache.put(CLAVE_CACHE, nuevo); // recién acá se reemplaza la versión anterior
    await cache.delete(CLAVE_CACHE_NUEVO);
  } catch (e) {
    if (e instanceof ErrorMapa) throw e;
    const nombre = e instanceof Error ? e.name : '';
    throw new ErrorMapa(
      nombre === 'QuotaExceededError'
        ? 'No hay espacio en este celular para guardar el mapa.'
        : 'No se pudo guardar el mapa en este celular.',
    );
  }

  const info: InfoMapa = { version: versionDe(res) ?? String(blob.size), bytes: blob.size, fecha: new Date().toISOString() };
  try {
    dep.almacen?.setItem(STORAGE_MAPA, JSON.stringify(info));
  } catch {
    // sin almacenamiento local no se recuerda la versión, pero el mapa quedó guardado
  }
  return info;
}

/** ¿El servidor tiene una versión del mapa distinta de la guardada? Sin conexión o ante cualquier error: no. */
export async function hayVersionNueva(dep: Dependencias): Promise<boolean> {
  const info = leerInfo(dep);
  if (!info) return false;
  try {
    const res = await dep.fetchFn(URL_MAPA, { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) return false;
    const remota = versionDe(res);
    if (remota) return remota !== info.version;
    const largo = Number(res.headers.get('content-length'));
    return Number.isFinite(largo) && largo > 0 && largo !== info.bytes;
  } catch {
    return false;
  }
}

/** Tamaño del archivo en el servidor, para decirlo antes de bajarlo; null si no se pudo saber. */
export async function tamanoRemoto(dep: Dependencias): Promise<number | null> {
  try {
    const res = await dep.fetchFn(URL_MAPA, { method: 'HEAD', cache: 'no-store' });
    const largo = Number(res.headers.get('content-length'));
    return res.ok && Number.isFinite(largo) && largo > 0 ? largo : null;
  } catch {
    return null;
  }
}

export async function borrarMapa(dep: Dependencias): Promise<void> {
  try {
    const cache = await dep.abrirCache();
    await cache.delete(CLAVE_CACHE);
    await cache.delete(CLAVE_CACHE_NUEVO);
  } finally {
    try {
      dep.almacen?.removeItem(STORAGE_MAPA);
    } catch {
      // nada que hacer
    }
  }
}

/** «10,7 MB» */
export function formatearTamano(bytes: number): string {
  return `${(bytes / 1048576).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}
