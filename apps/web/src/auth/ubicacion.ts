/**
 * ÚNICO punto de la app que lee la ubicación del celular (Ley 25.326: el RT usa su celular personal).
 *
 * - Se toma UNA vez, con getCurrentPosition, y sólo en los dos momentos que informa el aviso:
 *   al iniciar una inspección o al registrar una visita fallida.
 * - No hay seguimiento: nunca se usa watchPosition ni se pide la ubicación en segundo plano.
 *   Un test (ubicacion.test.ts) recorre todo src/ y falla si alguien agrega otro acceso.
 */
export type MotivoUbicacion = 'inicio-inspeccion' | 'visita-fallida';

export interface Ubicacion {
  motivo: MotivoUbicacion;
  latitud: number;
  longitud: number;
  /** Radio de error en metros, según el GPS del celular. */
  precision: number;
  /** Hora del dispositivo en que se tomó (ISO). */
  tomadaEn: string;
}

export type ResultadoUbicacion =
  | { kind: 'ok'; ubicacion: Ubicacion }
  | { kind: 'error'; message: string };

const MENSAJES: Record<number, string> = {
  1: 'No diste permiso para usar la ubicación. Habilitalo en el navegador para validar tu presencia.',
  2: 'El celular no pudo obtener la ubicación.',
  3: 'El GPS tardó demasiado en responder.',
};

export function tomarUbicacion(
  motivo: MotivoUbicacion,
  geo: Geolocation | undefined = globalThis.navigator?.geolocation,
): Promise<ResultadoUbicacion> {
  if (!geo) return Promise.resolve({ kind: 'error', message: 'Este navegador no permite leer la ubicación.' });
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          kind: 'ok',
          ubicacion: {
            motivo,
            latitud: pos.coords.latitude,
            longitud: pos.coords.longitude,
            precision: pos.coords.accuracy,
            tomadaEn: new Date(pos.timestamp).toISOString(),
          },
        }),
      (err) => resolve({ kind: 'error', message: MENSAJES[err.code] ?? 'No se pudo obtener la ubicación.' }),
      // Una lectura fresca y precisa: no sirve una posición vieja guardada por el celular.
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}
