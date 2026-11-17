/** Distancia en metros entre dos puntos (fórmula de haversine, radio medio de la Tierra). */
export function distanciaMetros(a: { latitud: number; longitud: number }, b: { latitud: number; longitud: number }): number {
  const R = 6_371_008.8;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Presencia =
  /** Buena señal y a 30 m o menos: puede iniciar. */
  | { resultado: 'puede_iniciar'; distanciaM: number }
  /** Buena señal pero a más de 30 m. */
  | { resultado: 'lejos'; distanciaM: number }
  /** La precisión del GPS no alcanza (o el edificio no tiene punto): hace falta foto del frente y justificación, y revisión. */
  | { resultado: 'sin_buena_senal'; distanciaM: number | null };

/**
 * ¿Está el RT en el edificio? Con precisión suficiente (el radio de error del GPS es de `precisionMaxM` o menos) y el punto del edificio
 * cargado se mide la distancia: hasta `radioM` puede iniciar, más lejos no. Sin esas dos cosas la distancia no se puede dar por buena y
 * se pasa a «Sin buena señal GPS». El borde cuenta: a 30,0 m exactos todavía puede iniciar.
 */
export function evaluarPresencia(
  gps: { latitud: number; longitud: number; precision: number },
  edificio: { latitud: number; longitud: number } | null,
  radioM: number,
  precisionMaxM: number,
): Presencia {
  const distanciaM = edificio ? Math.round(distanciaMetros(gps, edificio) * 10) / 10 : null;
  if (distanciaM === null || gps.precision > precisionMaxM) return { resultado: 'sin_buena_senal', distanciaM };
  return distanciaM <= radioM ? { resultado: 'puede_iniciar', distanciaM } : { resultado: 'lejos', distanciaM };
}
