import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { runWithRlsContext } from '../database/rls-context';
import { RegistroEnvioWhatsApp } from './whatsapp.types';

/**
 * HU-11 RF-12: dónde vive el historial de envíos de WhatsApp, para que un reinicio de la API no lo borre. Cada registro es un intento
 * de envío con su estado; los avisos de estado del proveedor (RF-09) lo actualizan.
 */
export abstract class HistorialWhatsAppRepository {
  /** Todos los registros, del más viejo al más nuevo. */
  abstract leer(): Promise<RegistroEnvioWhatsApp[]>;
  /** Alta o reemplazo del registro (por su id). */
  abstract guardar(r: RegistroEnvioWhatsApp): Promise<void>;
}

/** En memoria, para las pruebas aisladas. */
export class InMemoryHistorialWhatsAppRepository extends HistorialWhatsAppRepository {
  readonly registros = new Map<string, RegistroEnvioWhatsApp>();
  /** Si tiene valor, cada escritura falla con este error (para probar qué pasa si la base no responde). */
  errorAlGuardar: Error | null = null;

  async leer(): Promise<RegistroEnvioWhatsApp[]> {
    return structuredClone([...this.registros.values()]);
  }

  async guardar(r: RegistroEnvioWhatsApp): Promise<void> {
    if (this.errorAlGuardar) throw this.errorAlGuardar;
    this.registros.set(r.id, structuredClone(r));
  }
}

/**
 * En PostgreSQL. El historial lo escribe el sistema (al enviar y al recibir los avisos del proveedor, que llegan sin sesión), así que
 * se accede con el alcance de un Administrador; la tabla sólo tiene política para la Secretaría y el Administrador, como el endpoint
 * que la muestra (HU-11 RF-13).
 */
@Injectable()
export class PgHistorialWhatsAppRepository extends HistorialWhatsAppRepository {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  private comoSistema<T>(trabajo: () => Promise<T>): Promise<T> {
    return runWithRlsContext({ eca: null, rol: 'administrador', usuario: 'sistema', esExplicito: true }, trabajo);
  }

  async leer(): Promise<RegistroEnvioWhatsApp[]> {
    const filas = await this.comoSistema(() =>
      this.db.query<{ registro: RegistroEnvioWhatsApp }>('SELECT registro FROM whatsapp_envios ORDER BY creado_en, id'),
    );
    return filas.map((f) => f.registro);
  }

  async guardar(r: RegistroEnvioWhatsApp): Promise<void> {
    await this.comoSistema(() =>
      this.db.query(
        `INSERT INTO whatsapp_envios (id, id_mensaje, alerta_id, estado_entrega, registro, creado_en)
         VALUES ($1, NULLIF($2, ''), $3, $4, $5::jsonb, $6)
         ON CONFLICT (id) DO UPDATE SET id_mensaje = EXCLUDED.id_mensaje, estado_entrega = EXCLUDED.estado_entrega,
           registro = EXCLUDED.registro, actualizado_en = now()`,
        [r.id, r.idMensaje ?? '', r.alertaId ?? null, r.estadoEntrega, JSON.stringify(r), r.timestamp],
      ),
    );
  }
}
