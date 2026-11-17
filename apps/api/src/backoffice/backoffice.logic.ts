import { MaquinaAsignada } from '../firmante/firmante.types';
import { FilaMonitoreo, FiltrosMonitoreo, PaginaMonitoreo, RemitoEca } from './backoffice.types';

/** Para comparar textos sin mayúsculas ni tildes: «Corrientes» encuentra «CORRIÉNTES». */
export const normalizar = (t: string): string => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** La fila del tablero de un equipo, con el remito a la ECA de su visita si ya se mandó. */
export function aFila(m: MaquinaAsignada, remitoDe: (visitaId: string) => RemitoEca | null): FilaMonitoreo {
  const v = m.visita;
  const id = v ? v.id : `sin-visita:${m.id}`;
  return {
    id,
    maquinaId: m.id,
    codigoAGC: m.codigoAGC,
    equipo: m.nombre,
    direccion: m.edificio.direccion,
    consorcio: m.edificio.consorcio,
    eca: m.eca,
    inspector: v?.inspector ?? m.rtCalle,
    estadoVisita: m.estado,
    fecha: v?.fecha ?? null,
    estadoOperativo: m.estadoOperativo ?? 'Normal',
    firmante: m.firmanteUsername,
    autorizada: v?.autorizada ?? false,
    rechazada: v?.rechazada ?? false,
    alertaCritica: !!m.alertaCritica,
    remito: v ? remitoDe(v.id) : null,
  };
}

/** Los filtros combinan con «y»; los de texto buscan una parte del dato sin importar mayúsculas ni tildes; el estado es exacto. */
export function filtrar(filas: readonly FilaMonitoreo[], f: FiltrosMonitoreo): FilaMonitoreo[] {
  const dir = f.direccion ? normalizar(f.direccion) : '';
  const eca = f.eca ? normalizar(f.eca) : '';
  const insp = f.inspector ? normalizar(f.inspector) : '';
  return filas.filter(
    (r) =>
      (!dir || normalizar(`${r.direccion} ${r.consorcio}`).includes(dir)) &&
      (!eca || normalizar(r.eca).includes(eca)) &&
      (!insp || normalizar(r.inspector).includes(insp)) &&
      (!f.estado || r.estadoVisita === f.estado),
  );
}

/** Lo más reciente primero; las que no tienen visita al final; a igualdad, por dirección y por equipo. */
export function ordenar(filas: readonly FilaMonitoreo[]): FilaMonitoreo[] {
  return [...filas].sort((a, b) => {
    const fa = a.fecha ? Date.parse(a.fecha) : -Infinity;
    const fb = b.fecha ? Date.parse(b.fecha) : -Infinity;
    if (fa !== fb) return fb - fa;
    return a.direccion.localeCompare(b.direccion, 'es') || a.codigoAGC.localeCompare(b.codigoAGC, 'es') || a.id.localeCompare(b.id);
  });
}

export function paginar(filas: readonly FilaMonitoreo[], pagina: number, porPagina: number): PaginaMonitoreo {
  const total = filas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = (pagina - 1) * porPagina;
  return { total, pagina, porPagina, totalPaginas, items: filas.slice(desde, desde + porPagina) };
}
