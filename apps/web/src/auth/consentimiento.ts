import { fetchConSesion } from './sesion';

export interface TextoConsentimiento {
  version: string;
  titulo: string;
  parrafos: string[];
}

/** El texto vigente del aviso de uso de ubicación. Lo define la API, junto con su versión. */
export async function fetchTextoConsentimiento(): Promise<TextoConsentimiento | null> {
  try {
    const res = await fetch('/api/consentimientos/ubicacion');
    if (!res.ok) return null;
    return (await res.json()) as TextoConsentimiento;
  } catch {
    return null;
  }
}

/** Registra la aceptación de esa versión del aviso. Devuelve null si se registró, o el motivo del error. */
export async function aceptarConsentimiento(version: string): Promise<string | null> {
  try {
    const res = await fetchConSesion('/api/consentimientos/ubicacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : `Error ${res.status}`;
  } catch (err) {
    if (err instanceof Error && err.name === 'SesionRevocadaError') throw err;
    return 'No hay conexión con el servidor. Para aceptar el aviso hace falta señal.';
  }
}
