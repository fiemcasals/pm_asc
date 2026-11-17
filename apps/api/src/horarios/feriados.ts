/**
 * Feriados nacionales de 2026 (fecha ISO, hora de Buenos Aires). PROVISORIO: es la lista del calendario oficial tal como la conocemos
 * hoy y el cliente tiene que confirmarla; se puede reemplazar sin tocar código con la variable FERIADOS (fechas ISO separadas por
 * comas). Los feriados cuentan como cerrado (HU-01 RF-04).
 */
export const FERIADOS_PROVISORIOS: readonly string[] = [
  '2026-01-01', // Año Nuevo
  '2026-02-16', '2026-02-17', // Carnaval
  '2026-03-23', // Feriado puente
  '2026-03-24', // Día de la Memoria
  '2026-04-02', // Malvinas y Jueves Santo
  '2026-04-03', // Viernes Santo
  '2026-05-01', // Día del Trabajador
  '2026-05-25', // Revolución de Mayo
  '2026-06-15', // Güemes (trasladado)
  '2026-06-20', // Belgrano
  '2026-07-09', // Independencia
  '2026-07-10', // Feriado puente
  '2026-08-17', // San Martín
  '2026-10-12', // Diversidad Cultural
  '2026-11-23', // Soberanía Nacional (trasladado)
  '2026-12-07', // Feriado puente
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25', // Navidad
];

const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fechas de la variable FERIADOS; null si no está definida. Una fecha mal escrita es un error de configuración. */
export function feriadosDeEntorno(valor: string | undefined): string[] | null {
  const lista = (valor ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (lista.length === 0) return null;
  const mal = lista.find((f) => !ISO_FECHA.test(f) || Number.isNaN(Date.parse(`${f}T00:00:00Z`)));
  if (mal) throw new Error(`FERIADOS tiene que ser una lista de fechas AAAA-MM-DD separadas por comas (no sirve «${mal}»).`);
  return [...new Set(lista)];
}
