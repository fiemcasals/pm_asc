import { fechaEnZona } from '../semaforo/semaforo.logic';

/** El Firmante tiene 5 días hábiles para autorizar un informe (definición del cliente, HU-08 RF-03). */
export const PLAZO_DIAS_HABILES = 5;

/**
 * Cuántos días hábiles (lunes a viernes) pasaron desde `desde` hasta `hasta`, contando los días calendario de Buenos Aires:
 * el día del informe no cuenta, y sí cada lunes a viernes posterior hasta el de `hasta` inclusive. Los feriados no se
 * descuentan: el sistema no tiene un calendario de feriados.
 */
export function diasHabilesTranscurridos(desde: Date, hasta: Date): number {
  const d0 = fechaEnZona(desde.getTime());
  const d1 = fechaEnZona(hasta.getTime());
  const fin = Date.UTC(d1.anio, d1.mes - 1, d1.dia);
  let dia = Date.UTC(d0.anio, d0.mes - 1, d0.dia);
  let habiles = 0;
  while (dia < fin) {
    dia += 86_400_000;
    const semana = new Date(dia).getUTCDay(); // 0 domingo, 6 sábado
    if (semana !== 0 && semana !== 6) habiles += 1;
  }
  return habiles;
}
