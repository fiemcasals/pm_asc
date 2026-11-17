import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EquipoInforme, FirmaInforme, InformeNuevo, InformeVisita, SinFirmaInforme } from './informes.types';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export abstract class InformesRepository {
  /** ¿Existe el edificio y lo ve quien consulta? (el RT sólo ve los que tiene asignados). */
  abstract existeEdificio(consorcioId: string): Promise<boolean>;
  abstract guardar(nuevo: InformeNuevo, usuario: string): Promise<InformeVisita>;
  abstract listar(sinFirma?: boolean): Promise<InformeVisita[]>;
  abstract obtener(id: string): Promise<InformeVisita | null>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryInformesRepository extends InformesRepository {
  readonly edificios = new Set<string>();
  readonly informes: InformeVisita[] = [];

  async existeEdificio(consorcioId: string) {
    return this.edificios.has(consorcioId);
  }

  async guardar(n: InformeNuevo, usuario: string): Promise<InformeVisita> {
    const i: InformeVisita = { ...structuredClone(n), id: randomUUID(), usuario, horaServidor: new Date().toISOString() };
    this.informes.push(i);
    return structuredClone(i);
  }

  async listar(sinFirma?: boolean) {
    return structuredClone(this.informes.filter((i) => sinFirma === undefined || i.requiereRevision === sinFirma));
  }

  async obtener(id: string) {
    const i = this.informes.find((x) => x.id === id);
    return i ? structuredClone(i) : null;
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
}
const COLUMNAS = 'id::text AS id, consorcio_id::text AS consorcio_id, usuario, contenido, firma, sin_firma, requiere_revision, hora_dispositivo, hora_servidor';
const aInforme = (f: Fila): InformeVisita => ({
  id: f.id, consorcioId: f.consorcio_id, usuario: f.usuario, equipos: f.contenido.equipos, firma: f.firma, sinFirma: f.sin_firma,
  requiereRevision: f.requiere_revision, horaDispositivo: new Date(f.hora_dispositivo).toISOString(), horaServidor: new Date(f.hora_servidor).toISOString(),
});

@Injectable()
export class PgInformesRepository extends InformesRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async existeEdificio(consorcioId: string) {
    if (!ES_UUID.test(consorcioId)) return false;
    return (await this.db.query('SELECT 1 FROM consorcios WHERE id = $1', [consorcioId])).length > 0;
  }

  async guardar(n: InformeNuevo, usuario: string): Promise<InformeVisita> {
    const filas = await this.db.query<Fila>(
      `INSERT INTO informes_visita (consorcio_id, usuario, contenido, firma, sin_firma, requiere_revision, hora_dispositivo)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7) RETURNING ${COLUMNAS}`,
      [n.consorcioId, usuario, JSON.stringify({ equipos: n.equipos }), n.firma ? JSON.stringify(n.firma) : null, n.sinFirma ? JSON.stringify(n.sinFirma) : null, n.requiereRevision, n.horaDispositivo],
    );
    return aInforme(filas[0]);
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
}
