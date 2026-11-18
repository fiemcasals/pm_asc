import { STORE_VISITAS } from './offlineStore';

/** IndexedDB simulado en memoria para las pruebas (sólo lo que usa offlineStore). Se comparte entre las pruebas de la cola offline. */
export function crearIdbEnMemoria(): IDBFactory {
  const stores = new Map<string, Map<string, unknown>>();
  const keyPaths = new Map<string, string>();

  const makeReq = <T,>(run: () => T): IDBRequest<T> => {
    const req: Record<string, unknown> = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      try {
        req.result = run();
        if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
      } catch (err) {
        req.error = err;
        if (typeof req.onerror === 'function') (req.onerror as () => void)();
      }
    });
    return req as unknown as IDBRequest<T>;
  };

  return {
    open(_name: string) {
      const req: Record<string, unknown> = {
        result: undefined,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };
      const db = {
        objectStoreNames: { contains: (s: string) => stores.has(s) },
        createObjectStore: (s: string, opts: { keyPath: string }) => {
          stores.set(s, new Map());
          keyPaths.set(s, opts.keyPath);
          return {};
        },
        close: () => {},
        transaction: (storeName: string) => {
          const tx: Record<string, unknown> = { oncomplete: null, onerror: null, onabort: null };
          queueMicrotask(() => {
            if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
          });
          tx.objectStore = () => {
            const map = stores.get(storeName)!;
            const kp = keyPaths.get(storeName)!;
            return {
              put: (val: Record<string, unknown>) => makeReq(() => {
                map.set(String(val[kp]), val);
                return val[kp];
              }),
              get: (k: string) => makeReq(() => map.get(k)),
              getAll: () => makeReq(() => [...map.values()]),
              delete: (k: string) => makeReq(() => {
                map.delete(k);
                return undefined;
              }),
            };
          };
          return tx;
        },
      };
      queueMicrotask(() => {
        req.result = db;
        if (!stores.has(STORE_VISITAS) && typeof req.onupgradeneeded === 'function') {
          (req.onupgradeneeded as () => void)();
        }
        if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
      });
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}
