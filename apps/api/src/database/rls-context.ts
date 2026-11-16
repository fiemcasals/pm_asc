import { AsyncLocalStorage } from 'node:async_hooks';

export type RolRls = 'eca' | 'rt_calle' | 'firmante' | 'secretaria' | 'administrador';

export interface RlsContextData {
  eca: string | null;
  rol?: RolRls | null;
  usuario?: string | null;
  esExplicito: boolean;
}

const storage = new AsyncLocalStorage<RlsContextData>();

export function getRlsContext(): RlsContextData | undefined {
  return storage.getStore();
}

/** Ejecuta `work` propagando contexto de ECA y opcionalmente rol/usuario RLS. */
export function runWithRlsContext<T>(ctx: RlsContextData, work: () => T): T {
  return storage.run(
    {
      eca: ctx.eca?.trim() || null,
      rol: ctx.rol ?? null,
      usuario: ctx.usuario?.trim() || null,
      esExplicito: ctx.esExplicito,
    },
    work,
  );
}

/** Ejecuta `work` con el contexto de ECA indicado propagado a todas las consultas del pool. */
export function runWithEcaContext<T>(
  eca: string | null,
  work: () => T,
  esExplicito = true,
): T {
  return runWithRlsContext({ eca, rol: null, usuario: null, esExplicito }, work);
}
