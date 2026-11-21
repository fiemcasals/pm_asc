import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConsorciosRepository } from '../consorcios/consorcios.repository';
import { runWithRlsContext } from '../database/rls-context';
import { FirmanteService } from './firmante.service';

/**
 * HU-02 RF-06: lleva la terna de la base a la vista de firma.
 *
 * Las máquinas del Portal Firmante (y las pantallas que cuelgan de ellas: Portal ECA, Monitoreo, avisos, paradas) viven en
 * `FirmanteService`. Cada vez que cambia algo que afecta a quién las ve —guardar o quitar la terna, reasignar un RT desde el
 * Semáforo, editar o borrar el edificio— quien lo cambia llama a `sincronizarEdificio`, y las máquinas del edificio pasan a
 * mostrar el RT de Calle, el Firmante y la ECA vigentes. Al arrancar la API se sincronizan todos los edificios con terna.
 *
 * Sincronizar no puede romper lo que el usuario ya hizo: la terna ya se guardó. Si falla, se deja registrado y listo.
 */
@Injectable()
export class AsignacionesFirmanteService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AsignacionesFirmanteService.name);

  constructor(
    private readonly consorcios: ConsorciosRepository,
    private readonly firmante: FirmanteService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      // Al arrancar no hay una persona detrás: se lee como el sistema, con el alcance de un Administrador (la base lo exige por RLS).
      await runWithRlsContext({ eca: null, rol: 'administrador', usuario: 'sistema', esExplicito: true }, () => this.sincronizarTodos());
    } catch (err) {
      this.logger.warn(`No se pudieron cargar las máquinas de los edificios con terna: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Todos los edificios con terna asignada. */
  async sincronizarTodos(): Promise<void> {
    const roles = await this.consorcios.listarRoles();
    for (const r of roles) {
      if (r.rtCalle && r.firmante && r.eca) await this.sincronizarEdificio(r.consorcioId);
    }
  }

  /** Deja las máquinas del edificio a tono con su terna vigente (o sin responsables si ya no la tiene o el edificio no existe). */
  async sincronizarEdificio(consorcioId: string): Promise<void> {
    try {
      const ficha = await this.consorcios.obtener(consorcioId);
      const roles = ficha ? await this.consorcios.obtenerRoles(consorcioId) : null;
      if (!ficha || !roles || !roles.rtCalle || !roles.firmante || !roles.eca) {
        this.firmante.aplicarTernaDeEdificio(consorcioId, null);
        return;
      }
      this.firmante.aplicarTernaDeEdificio(consorcioId, {
        nombre: ficha.nombre,
        direccion: ficha.direccion,
        administracion: ficha.administracion.nombre,
        maquinas: ficha.maquinas.map((m) => ({ id: m.id, referenciaAgc: m.referenciaAgc, descripcion: m.descripcion, tipo: m.tipo })),
        terna: {
          rtCalle: { nombre: roles.rtCalle.nombre },
          firmante: { nombre: roles.firmante.nombre, email: roles.firmante.email },
          eca: { nombre: roles.eca.nombre },
        },
      });
    } catch (err) {
      this.logger.warn(`No se pudo actualizar la vista de firma del edificio ${consorcioId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
