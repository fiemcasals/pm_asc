import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { InicioInspeccion, InicioNuevo, RevisionInicio } from './inicios.types';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export abstract class IniciosRepository {
  /** `null` si el edificio no existe o no es visible para quien consulta; `{ ubicacion: null }` si existe pero no tiene punto cargado. */
  abstract edificio(consorcioId: string): Promise<{ ubicacion: { latitud: number; longitud: number } | null } | null>;
  abstract guardar(nuevo: InicioNuevo, usuario: string): Promise<InicioInspeccion>;
  abstract listar(revision?: RevisionInicio): Promise<InicioInspeccion[]>;
  /** Marca la visita como revisada; `null` si no existe o no estaba pendiente. */
  abstract revisar(id: string, usuario: string): Promise<InicioInspeccion | null>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryIniciosRepository extends IniciosRepository {
  readonly edificios = new Map<string, { latitud: number; longitud: number } | null>();
  readonly inicios: InicioInspeccion[] = [];

  async edificio(consorcioId: string) {
    return this.edificios.has(consorcioId) ? { ubicacion: this.edificios.get(consorcioId) ?? null } : null;
  }

  async guardar(n: InicioNuevo, usuario: string): Promise<InicioInspeccion> {
    const i: InicioInspeccion = {
      id: randomUUID(), consorcioId: n.consorcioId, usuario, gps: { ...n.gps }, distanciaM: n.distanciaM, horaDispositivo: n.horaDispositivo,
      horaServidor: new Date().toISOString(), sinBuenaSenal: n.sinBuenaSenal, fotoFrenteUrl: n.fotoFrenteUrl, justificacion: n.justificacion,
      revision: n.sinBuenaSenal ? 'pendiente' : 'no_requiere', revisadaPor: null, revisadaEn: null,
    };
    this.inicios.push(i);
    return structuredClone(i);
  }

  async listar(revision?: RevisionInicio) {
    return structuredClone(this.inicios.filter((i) => !revision || i.revision === revision));
  }

  async revisar(id: string, usuario: string) {
    const i = this.inicios.find((x) => x.id === id);
    if (!i || i.revision !== 'pendiente') return null;
    i.revision = 'revisada';
    i.revisadaPor = usuario;
    i.revisadaEn = new Date().toISOString();
    return structuredClone(i);
  }
}

interface Fila {
  id: string;
  consorcio_id: string;
  usuario: string;
  gps_latitud: number;
  gps_longitud: number;
  gps_precision: number;
  distancia_m: number | null;
  hora_dispositivo: Date | string;
  hora_servidor: Date | string;
  sin_buena_senal: boolean;
  foto_frente_url: string | null;
  justificacion: string | null;
  revision: RevisionInicio;
  revisada_por: string | null;
  revisada_en: Date | string | null;
}

const COLUMNAS = 'id::text AS id, consorcio_id::text AS consorcio_id, usuario, gps_latitud, gps_longitud, gps_precision, distancia_m, hora_dispositivo, hora_servidor, sin_buena_senal, foto_frente_url, justificacion, revision, revisada_por, revisada_en';

const aInicio = (f: Fila): InicioInspeccion => ({
  id: f.id,
  consorcioId: f.consorcio_id,
  usuario: f.usuario,
  gps: { latitud: Number(f.gps_latitud), longitud: Number(f.gps_longitud), precision: Number(f.gps_precision) },
  distanciaM: f.distancia_m === null ? null : Number(f.distancia_m),
  horaDispositivo: new Date(f.hora_dispositivo).toISOString(),
  horaServidor: new Date(f.hora_servidor).toISOString(),
  sinBuenaSenal: f.sin_buena_senal,
  fotoFrenteUrl: f.foto_frente_url,
  justificacion: f.justificacion,
  revision: f.revision,
  revisadaPor: f.revisada_por,
  revisadaEn: f.revisada_en ? new Date(f.revisada_en).toISOString() : null,
});

@Injectable()
export class PgIniciosRepository extends IniciosRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async edificio(consorcioId: string) {
    if (!ES_UUID.test(consorcioId)) return null;
    const filas = await this.db.query<{ lat: number | null; lng: number | null }>(
      'SELECT ST_Y(ubicacion::geometry) AS lat, ST_X(ubicacion::geometry) AS lng FROM consorcios WHERE id = $1',
      [consorcioId],
    );
    if (filas.length === 0) return null;
    const { lat, lng } = filas[0];
    return { ubicacion: lat === null || lng === null ? null : { latitud: Number(lat), longitud: Number(lng) } };
  }

  async guardar(n: InicioNuevo, usuario: string): Promise<InicioInspeccion> {
    const filas = await this.db.query<Fila>(
      `INSERT INTO inicios_inspeccion (consorcio_id, usuario, gps_latitud, gps_longitud, gps_precision, distancia_m, hora_dispositivo, sin_buena_senal, foto_frente_url, justificacion, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${COLUMNAS}`,
      [n.consorcioId, usuario, n.gps.latitud, n.gps.longitud, n.gps.precision, n.distanciaM, n.horaDispositivo, n.sinBuenaSenal, n.fotoFrenteUrl, n.justificacion, n.sinBuenaSenal ? 'pendiente' : 'no_requiere'],
    );
    return aInicio(filas[0]);
  }

  async listar(revision?: RevisionInicio) {
    const filas = revision
      ? await this.db.query<Fila>(`SELECT ${COLUMNAS} FROM inicios_inspeccion WHERE revision = $1 ORDER BY hora_servidor, id`, [revision])
      : await this.db.query<Fila>(`SELECT ${COLUMNAS} FROM inicios_inspeccion ORDER BY hora_servidor, id`);
    return filas.map(aInicio);
  }

  async revisar(id: string, usuario: string) {
    if (!ES_UUID.test(id)) return null;
    const filas = await this.db.query<Fila>(
      `UPDATE inicios_inspeccion SET revision = 'revisada', revisada_por = $2, revisada_en = now() WHERE id = $1 AND revision = 'pendiente' RETURNING ${COLUMNAS}`,
      [id, usuario],
    );
    return filas[0] ? aInicio(filas[0]) : null;
  }
}
