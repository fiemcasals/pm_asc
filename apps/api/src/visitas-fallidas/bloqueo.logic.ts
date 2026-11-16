import { fechaEnZona } from '../semaforo/semaforo.logic';
import { DesbloqueoEdificio, VisitaFallidaRegistro } from './visitas-fallidas.types';

/**
 * Las advertencias vigentes de un edificio: las visitas fallidas posteriores a su última visita exitosa. Una visita exitosa es una
 * inspección registrada en el edificio (HU-07 RF-05); sólo ella reinicia el contador a cero. `historial` va en orden de registro.
 */
export function cicloDeAdvertencias(historial: VisitaFallidaRegistro[], ultimaInspeccionIso: string | null): VisitaFallidaRegistro[] {
  if (!ultimaInspeccionIso) return historial;
  const corte = Date.parse(ultimaInspeccionIso);
  return historial.filter((v) => Date.parse(v.fechaHora) > corte);
}

/**
 * Un edificio está bloqueado con 3 advertencias vigentes, salvo que la Secretaría lo haya desbloqueado después de la última: el
 * desbloqueo cubre hasta la visita indicada, y una visita fallida posterior lo bloquea de nuevo.
 */
export function estaBloqueado(ciclo: VisitaFallidaRegistro[], desbloqueos: DesbloqueoEdificio[]): boolean {
  if (ciclo.length < 3) return false;
  const ultima = ciclo[ciclo.length - 1];
  return !desbloqueos.some((d) => d.hastaVisitaId === ultima.id);
}

/** Cuántos días de calendario (hora de Buenos Aires) hay de `desde` a `hasta`: 0 el mismo día, 1 al día siguiente. */
export function diasCalendarioEntre(desdeMs: number, hastaMs: number): number {
  const a = fechaEnZona(desdeMs);
  const b = fechaEnZona(hastaMs);
  return Math.round((Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia)) / 86_400_000);
}
