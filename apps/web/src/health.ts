export interface HealthResponse {
  status: 'ok' | 'error';
  api: 'ok';
  db: { status: 'ok' | 'error'; postgis: string | null; error?: string };
}

export type HealthState =
  | { kind: 'ok'; postgis: string }
  | { kind: 'db-error'; message: string }
  | { kind: 'api-error'; message: string };

/** Consulta /api/health y lo traduce a un estado para mostrar en pantalla. */
export async function fetchHealth(fetchFn: typeof fetch = fetch): Promise<HealthState> {
  let res: Response;
  try {
    res = await fetchFn('/api/health');
  } catch {
    return { kind: 'api-error', message: 'No se pudo contactar a la API' };
  }

  let body: HealthResponse;
  try {
    body = (await res.json()) as HealthResponse;
  } catch {
    return { kind: 'api-error', message: `La API respondió ${res.status} sin un cuerpo válido` };
  }

  if (res.ok && body.db?.status === 'ok' && body.db.postgis) {
    return { kind: 'ok', postgis: body.db.postgis };
  }
  return { kind: 'db-error', message: body.db?.error ?? 'Base de datos no disponible' };
}
