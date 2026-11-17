import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EquipoInforme, FirmaInforme, InformeVisita, IntentoModificacion, SinFirmaInforme, VerificacionInforme } from './informes.types';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NuevoIntento = Omit<IntentoModificacion, 'id' | 'fecha'>;
export type NuevaVerificacion = Omit<VerificacionInforme, 'id' | 'verificadoEn'>;

export abstract class InformesRepository {
  /** ¿Existe el edificio y lo ve quien consulta? (el RT sólo ve los que tiene asignados). */
  abstract existeEdificio(consorcioId: string): Promise<boolean>;
  /**
   * Guarda el informe ya sellado (con su id, su hora del servidor y su hash). Devuelve `null` si ya había uno con el mismo identificador del
   * celular (`clientReportId`): la unicidad la garantiza la base, así que dos envíos simultáneos no pueden crear dos informes.
   */
  abstract guardar(informe: InformeVisita): Promise<InformeVisita | null>;
  abstract buscarPorClientId(clientReportId: string): Promise<InformeVisita | null>;
  abstract listar(sinFirma?: boolean): Promise<InformeVisita[]>;
  abstract obtener(id: string): Promise<InformeVisita | null>;
  abstract registrarIntento(n: NuevoIntento): Promise<IntentoModificacion>;
  abstract listarIntentos(informeId: string): Promise<IntentoModificacion[]>;
  abstract registrarVerificacion(n: NuevaVerificacion): Promise<VerificacionInforme>;
  abstract listarVerificaciones(informeId: string): Promise<VerificacionInforme[]>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryInformesRepository extends InformesRepository {
  readonly edificios = new Set<string>();
  readonly informes: InformeVisita[] = [];
  readonly intentos: IntentoModificacion[] = [];
  readonly verificaciones: VerificacionInforme[] = [];

  async existeEdificio(consorcioId: string) {
    return this.edificios.has(consorcioId);
  }

  async guardar(i: InformeVisita) {
    if (i.clientReportId && this.informes.some((x) => x.clientReportId === i.clientReportId)) return null;
    this.informes.push(structuredClone(i));
    return structuredClone(i);
  }

  async buscarPorClientId(clientReportId: string) {
    const i = this.informes.find((x) => x.clientReportId === clientReportId);
    return i ? structuredClone(i) : null;
  }

  async listar(sinFirma?: boolean) {
    return structuredClone(this.informes.filter((i) => sinFirma === undefined || i.requiereRevision === sinFirma));
  }

  async obtener(id: string) {
    const i = this.informes.find((x) => x.id === id);
    return i ? structuredClone(i) : null;
  }

  async registrarIntento(n: NuevoIntento) {
    const r: IntentoModificacion = { ...n, id: randomUUID(), fecha: new Date().toISOString() };
    this.intentos.push(r);
    return structuredClone(r);
  }

  async listarIntentos(informeId: string) {
    return structuredClone(this.intentos.filter((x) => x.informeId === informeId));
  }

  async registrarVerificacion(n: NuevaVerificacion) {
    const r: VerificacionInforme = { ...n, id: randomUUID(), verificadoEn: new Date().toISOString() };
    this.verificaciones.push(r);
    return structuredClone(r);
  }

  async listarVerificaciones(informeId: string) {
    return structuredClone(this.verificaciones.filter((x) => x.informeId === informeId));
  }
}

interface Fila {
  id: string;
  consorcio_id: string;
  usuario: string;
  contenido: { equipos: EquipoInforme[] };
  firma: FirmaInforme | null;
  sin_firma: SinFirmaInforme | null;
  requiere_revision: boolean;
  hora_dispositivo: Date | string;
  hora_servidor: Date | string;
  hash_sha256: string | null;
  version_hash: string | null;
  client_report_id: string | null;
}
const COLUMNAS = 'id::text AS id, consorcio_id::text AS consorcio_id, usuario, contenido, firma, sin_firma, requiere_revision, hora_dispositivo, hora_servidor, hash_sha256, version_hash, client_report_id';
const aInforme = (f: Fila): InformeVisita => ({
  id: f.id, consorcioId: f.consorcio_id, usuario: f.usuario, equipos: f.contenido.equipos, firma: f.firma, sinFirma: f.sin_firma,
  requiereRevision: f.requiere_revision, horaDispositivo: new Date(f.hora_dispositivo).toISOString(), horaServidor: new Date(f.hora_servidor).toISOString(),
  hashSha256: f.hash_sha256, versionHash: f.version_hash, clientReportId: f.client_report_id,
});

interface FilaIntento {
  id: string;
  informe_id: string;
  usuario: string;
  rol: string;
  metodo: string;
  fecha: Date | string;
}
interface FilaVerificacion {
  id: string;
  informe_id: string;
  usuario: string;
  rol: string;
  hash_guardado: string | null;
  hash_calculado: string;
  coincide: boolean;
  verificado_en: Date | string;
}

@Injectable()
export class PgInformesRepository extends InformesRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async existeEdificio(consorcioId: string) {
    if (!ES_UUID.test(consorcioId)) return false;
    return (await this.db.query('SELECT 1 FROM consorcios WHERE id = $1', [consorcioId])).length > 0;
  }

  async guardar(i: InformeVisita): Promise<InformeVisita | null> {
    const filas = await this.db.query<Fila>(
      `INSERT INTO informes_visita (id, consorcio_id, usuario, contenido, firma, sin_firma, requiere_revision, hora_dispositivo, hora_servidor, hash_sha256, version_hash, client_report_id)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (client_report_id) DO NOTHING RETURNING ${COLUMNAS}`,
      [i.id, i.consorcioId, i.usuario, JSON.stringify({ equipos: i.equipos }), i.firma ? JSON.stringify(i.firma) : null, i.sinFirma ? JSON.stringify(i.sinFirma) : null, i.requiereRevision, i.horaDispositivo, i.horaServidor, i.hashSha256, i.versionHash, i.clientReportId],
    );
    return filas[0] ? aInforme(filas[0]) : null;
  }

  async buscarPorClientId(clientReportId: string) {
    const filas = await this.db.query<Fila>(`SELECT ${COLUMNAS} FROM informes_visita WHERE client_report_id = $1`, [clientReportId]);
    return filas[0] ? aInforme(filas[0]) : null;
  }

  async listar(sinFirma?: boolean) {
    const filas =
      sinFirma === undefined
        ? await this.db.query<Fila>(`SELECT ${COLUMNAS} FROM informes_visita ORDER BY hora_servidor DESC, id`)
        : await this.db.query<Fila>(`SELECT ${COLUMNAS} FROM informes_visita WHERE requiere_revision = $1 ORDER BY hora_servidor DESC, id`, [sinFirma]);
    return filas.map(aInforme);
  }

  async obtener(id: string) {
    if (!ES_UUID.test(id)) return null;
    const filas = await this.db.query<Fila>(`SELECT ${COLUMNAS} FROM informes_visita WHERE id = $1`, [id]);
    return filas[0] ? aInforme(filas[0]) : null;
  }

  /**
   * Sin `RETURNING`: el que intenta modificar puede ser un RT o un Firmante, que no leen esta tabla (sólo la Secretaría y el Administrador),
   * y `RETURNING` exige poder leer la fila. El id y la fecha se generan acá.
   */
  async registrarIntento(n: NuevoIntento) {
    const r: IntentoModificacion = { ...n, id: randomUUID(), fecha: new Date().toISOString() };
    await this.db.query('INSERT INTO intentos_modificacion_informe (id, informe_id, usuario, rol, metodo, fecha) VALUES ($1, $2, $3, $4, $5, $6)', [r.id, r.informeId, r.usuario, r.rol, r.metodo, r.fecha]);
    return r;
  }

  async listarIntentos(informeId: string) {
    if (!ES_UUID.test(informeId)) return [];
    const filas = await this.db.query<FilaIntento>(
      'SELECT id::text AS id, informe_id::text AS informe_id, usuario, rol, metodo, fecha FROM intentos_modificacion_informe WHERE informe_id = $1 ORDER BY fecha, id',
      [informeId],
    );
    return filas.map((f) => ({ id: f.id, informeId: f.informe_id, usuario: f.usuario, rol: f.rol, metodo: f.metodo, fecha: new Date(f.fecha).toISOString() }));
  }

  async registrarVerificacion(n: NuevaVerificacion) {
    const f = (
      await this.db.query<FilaVerificacion>(
        `INSERT INTO verificaciones_informe (informe_id, usuario, rol, hash_guardado, hash_calculado, coincide) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id::text AS id, informe_id::text AS informe_id, usuario, rol, hash_guardado, hash_calculado, coincide, verificado_en`,
        [n.informeId, n.usuario, n.rol, n.hashGuardado, n.hashCalculado, n.coincide],
      )
    )[0];
    return aVerificacion(f);
  }

  async listarVerificaciones(informeId: string) {
    if (!ES_UUID.test(informeId)) return [];
    const filas = await this.db.query<FilaVerificacion>(
      `SELECT id::text AS id, informe_id::text AS informe_id, usuario, rol, hash_guardado, hash_calculado, coincide, verificado_en
         FROM verificaciones_informe WHERE informe_id = $1 ORDER BY verificado_en, id`,
      [informeId],
    );
    return filas.map(aVerificacion);
  }
}

const aVerificacion = (f: FilaVerificacion): VerificacionInforme => ({
  id: f.id, informeId: f.informe_id, usuario: f.usuario, rol: f.rol, hashGuardado: f.hash_guardado, hashCalculado: f.hash_calculado, coincide: f.coincide, verificadoEn: new Date(f.verificado_en).toISOString(),
});
