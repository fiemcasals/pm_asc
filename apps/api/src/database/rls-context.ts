import { AsyncLocalStorage } from 'node:async_hooks';

export interface RlsContextData {
  eca: string | null;
  esExplicito: boolean;
}

const storage = new AsyncLocalStorage<RlsContextData>();

export const ECA_CONTEXTO_DEV_PRE_AUTH = 'ECA_SISTEMA_DEV';

export function getRlsContext(): RlsContextData | undefined {
  return storage.getStore();
}

/** Ejecuta `work` con el contexto de ECA indicado propagado a todas las consultas del pool. */
export function runWithEcaContext<T>(
  eca: string | null,
  work: () => T,
  esExplicito = true,
): T {
  return storage.run({ eca: eca?.trim() || null, esExplicito }, work);
}
