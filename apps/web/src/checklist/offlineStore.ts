import {
  type EstadoEquipoUso,
  type SolapaId,
  type TipoMaquinaChecklist,
} from './checklist.config';
import {
  type FotosPorEquipo,
  type ObservacionesChecklist,
  type RespuestasChecklist,
} from './checklist.logic';
import { type FallaPisoRegistro } from './fallasPiso';

export const OFFLINE_DB_NAME = 'mant_asc_inspeccion_db';
export const OFFLINE_DB_VERSION = 1;
export const STORE_VISITAS = 'visitas_en_curso';
export const STORE_COLA_FALLAS = 'cola_fallas_criticas';
export const VISITA_ACTUAL_KEY = 'visita-actual';

export interface VisitaEnCursoSnapshot {
  id: string;
  equipoId: string;
  solapaActiva: SolapaId;
  tipoOverride: Record<string, TipoMaquinaChecklist>;
  estadoPorEquipo: Record<string, EstadoEquipoUso>;
  respuestasPorEquipo: Record<string, RespuestasChecklist>;
  obsPorEquipo: Record<string, ObservacionesChecklist>;
  fotosPorEquipo: Record<string, FotosPorEquipo>;
  fallasPisoPorEquipo: Record<string, FallaPisoRegistro[]>;
  actualizadaEn: string;
}

export interface InformeCriticoEncolado {
  clientReportId: string;
  payload: unknown;
  creadoEn: string;
  intentos: number;
  ultimoError?: string;
}

function getIndexedDb(customFactory?: IDBFactory): IDBFactory {
  const idb = customFactory ?? globalThis.indexedDB;
  if (!idb) {
    throw new Error('IndexedDB no está disponible en este entorno.');
  }
  return idb;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Error de operación IndexedDB'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Error en transacción IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacción IndexedDB abortada'));
  });
}

export async function abrirInspeccionDb(customFactory?: IDBFactory): Promise<IDBDatabase> {
  const idb = getIndexedDb(customFactory);
  return new Promise((resolve, reject) => {
    const req = idb.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_VISITAS)) {
        db.createObjectStore(STORE_VISITAS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_COLA_FALLAS)) {
        db.createObjectStore(STORE_COLA_FALLAS, { keyPath: 'clientReportId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
  });
}

export async function guardarVisitaEnCurso(
  snapshot: Omit<VisitaEnCursoSnapshot, 'id' | 'actualizadaEn'>,
  customFactory?: IDBFactory,
): Promise<VisitaEnCursoSnapshot> {
  const registro: VisitaEnCursoSnapshot = {
    ...snapshot,
    id: VISITA_ACTUAL_KEY,
    actualizadaEn: new Date().toISOString(),
  };
  const db = await abrirInspeccionDb(customFactory);
  try {
    const tx = db.transaction(STORE_VISITAS, 'readwrite');
    tx.objectStore(STORE_VISITAS).put(registro);
    await txDone(tx);
    return registro;
  } finally {
    db.close();
  }
}

export async function cargarVisitaEnCurso(
  customFactory?: IDBFactory,
): Promise<VisitaEnCursoSnapshot | null> {
  if (!customFactory && !globalThis.indexedDB) return null;
  const db = await abrirInspeccionDb(customFactory);
  try {
    const tx = db.transaction(STORE_VISITAS, 'readonly');
    const found = await requestToPromise<VisitaEnCursoSnapshot | undefined>(
      tx.objectStore(STORE_VISITAS).get(VISITA_ACTUAL_KEY),
    );
    return found ?? null;
  } finally {
    db.close();
  }
}

export async function limpiarVisitaEnCurso(customFactory?: IDBFactory): Promise<void> {
  if (!customFactory && !globalThis.indexedDB) return;
  const db = await abrirInspeccionDb(customFactory);
  try {
    const tx = db.transaction(STORE_VISITAS, 'readwrite');
    tx.objectStore(STORE_VISITAS).delete(VISITA_ACTUAL_KEY);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export function tieneProgresoVisita(snapshot: VisitaEnCursoSnapshot | null): boolean {
  if (!snapshot) return false;
  const tieneResp = Object.values(snapshot.respuestasPorEquipo).some((r) =>
    Object.values(r).some((s) => Object.keys(s ?? {}).length > 0),
  );
  const tieneObs = Object.values(snapshot.obsPorEquipo).some((o) =>
    Object.values(o).some((txt) => Boolean(txt?.trim())),
  );
  const tieneFotos = Object.values(snapshot.fotosPorEquipo).some(
    (f) => Object.keys(f ?? {}).length > 0,
  );
  const tieneFallasPiso = Object.values(snapshot.fallasPisoPorEquipo).some(
    (arr) => (arr?.length ?? 0) > 0,
  );
  return tieneResp || tieneObs || tieneFotos || tieneFallasPiso;
}

export async function encolarInformeCritico(
  item: InformeCriticoEncolado,
  customFactory?: IDBFactory,
): Promise<void> {
  const db = await abrirInspeccionDb(customFactory);
  try {
    const tx = db.transaction(STORE_COLA_FALLAS, 'readwrite');
    tx.objectStore(STORE_COLA_FALLAS).put(item);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function listarColaInformesCriticos(
  customFactory?: IDBFactory,
): Promise<InformeCriticoEncolado[]> {
  if (!customFactory && !globalThis.indexedDB) return [];
  const db = await abrirInspeccionDb(customFactory);
  try {
    const tx = db.transaction(STORE_COLA_FALLAS, 'readonly');
    const store = tx.objectStore(STORE_COLA_FALLAS);
    if (typeof store.getAll === 'function') {
      const rows = await requestToPromise<InformeCriticoEncolado[]>(store.getAll());
      return Array.isArray(rows) ? rows : [];
    }
    return [];
  } finally {
    db.close();
  }
}

export async function eliminarInformeDeCola(
  clientReportId: string,
  customFactory?: IDBFactory,
): Promise<void> {
  if (!customFactory && !globalThis.indexedDB) return;
  const db = await abrirInspeccionDb(customFactory);
  try {
    const tx = db.transaction(STORE_COLA_FALLAS, 'readwrite');
    tx.objectStore(STORE_COLA_FALLAS).delete(clientReportId);
    await txDone(tx);
  } finally {
    db.close();
  }
}
