import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { aResumen, contenidoSellado, hashInforme, validarInforme } from './informes.logic';
import { InformesRepository } from './informes.repository';
import { AuditoriaInforme, CLAVE_FOTO_OBLIGATORIA, InformeVisita, IntentoModificacion, ResumenInforme, ResultadoCierre, VERSION_HASH, VerificacionInforme } from './informes.types';
import { FirmanteService } from '../firmante/firmante.service';
import { AsignacionesFirmanteService } from '../firmante/asignaciones-firmante.service';
import { VisitaInspeccion } from '../firmante/firmante.types';

export const MENSAJE_INFORME_CERRADO = 'El informe está cerrado: no se puede modificar ni borrar. El intento quedó registrado.';

/** Informes consolidados de la visita, con la firma del encargado o «Sin firma», sellados con un hash al cerrarse (HU-18 RF-01 y RNF-01). */
@Injectable()
export class InformesService {
  constructor(
    private readonly repo: InformesRepository,
    @Optional() private readonly firmante?: FirmanteService,
    @Optional() private readonly asignaciones?: AsignacionesFirmanteService,
  ) {}

  /**
   * Cierra el informe de un edificio que el RT tiene asignado y lo **sella**: se calcula el SHA-256 de todo el contenido (equipos con sus
   * fotos, firma o «Sin firma», usuario, id y las dos horas) y se guarda junto con la hora del dispositivo y la del servidor.
   */
  async crear(cuerpo: unknown, usuario: string): Promise<InformeVisita> {
    return (await this.crearIdempotente(cuerpo, usuario)).informe;
  }

  /**
   * Cierra el informe **sin duplicarlo** (HU-18 RNF-02): si el celular reenvía un informe con el mismo `clientReportId` —porque se cortó la
   * conexión antes de recibir la respuesta, o porque lo reintenta la cola— se devuelve el original (`creado: false`) en lugar de crear otro.
   * Un identificador que ya pertenece a otro usuario da 409. La unicidad la garantiza la base, así que dos envíos simultáneos tampoco duplican.
   */
  async crearIdempotente(cuerpo: unknown, usuario: string): Promise<ResultadoCierre> {
    const { clientReportId, ...nuevo } = validarInforme(cuerpo);
    if (clientReportId) {
      const previo = await this.repo.buscarPorClientId(clientReportId);
      if (previo) return this.respuestaDeReenvio(previo, usuario);
    }
    if (!(await this.repo.existeEdificio(nuevo.consorcioId))) throw new NotFoundException('Edificio no encontrado');
    const base = { ...nuevo, id: randomUUID(), usuario, horaServidor: new Date().toISOString() };
    const guardado = await this.repo.guardar({ ...base, clientReportId, hashSha256: hashInforme(base), versionHash: VERSION_HASH });
    if (guardado) {
      await this.sincronizarConPortalFirmante(guardado);
      return { informe: guardado, creado: true };
    }
    // Otro envío con el mismo identificador ganó la carrera: se devuelve ése.
    const ganador = clientReportId ? await this.repo.buscarPorClientId(clientReportId) : null;
    if (!ganador) throw new ConflictException('No se pudo cerrar el informe: probá de nuevo.');
    return this.respuestaDeReenvio(ganador, usuario);
  }

  /**
   * HU-08 RF-07: cada equipo del informe cerrado pasa a ser la visita de su máquina en el Portal Firmante.
   */
  private async sincronizarConPortalFirmante(informe: InformeVisita): Promise<void> {
    if (!this.firmante) return;
    if (this.asignaciones) {
      const maquinasEdif = this.firmante.getMaquinas().filter((m) => m.consorcioId === informe.consorcioId);
      if (maquinasEdif.length === 0) {
        await this.asignaciones.sincronizarEdificio(informe.consorcioId);
      }
    }

    const firmaEncargado = informe.firma ? informe.firma.imagen : null;
    const nombreEncargado = informe.firma
      ? `${informe.firma.nombre} ${informe.firma.apellido}${informe.firma.caracter ? ` (${informe.firma.caracter})` : ''}`.trim()
      : null;

    for (const eq of informe.equipos) {
      // Prioridad 1: máquinas del edificio del informe
      const maquina =
        this.firmante
          .getMaquinas()
          .find(
            (m) =>
              m.consorcioId === informe.consorcioId &&
              (m.id === eq.maquinaId ||
                m.id === `MAQ-${informe.consorcioId}-${eq.maquinaId}` ||
                (m.codigoAGC && m.codigoAGC.toLowerCase() === eq.referenciaAgc.toLowerCase()) ||
                m.id.endsWith(`-${eq.maquinaId}`)),
          ) ??
        this.firmante
          .getMaquinas()
          .find(
            (m) =>
              m.id === eq.maquinaId ||
              (m.codigoAGC && m.codigoAGC.toLowerCase() === eq.referenciaAgc.toLowerCase()),
          );
      if (!maquina) continue;
      // Criterio 4: no se pisa una firma ya autorizada
      if (maquina.visita?.autorizada) continue;

      const rawFrente =
        (eq.fotos?.[CLAVE_FOTO_OBLIGATORIA.frente] as unknown) ??
        (eq.fotos?.['obligatoria:frente'] as unknown);
      const rawCables =
        (eq.fotos?.[CLAVE_FOTO_OBLIGATORIA.cables] as unknown) ??
        (eq.fotos?.['obligatoria:cables'] as unknown);

      const fotoFrente =
        typeof rawFrente === 'string'
          ? rawFrente
          : typeof (rawFrente as { dataUrl?: unknown })?.dataUrl === 'string'
            ? ((rawFrente as { dataUrl: string }).dataUrl)
            : '';
      const fotoCables =
        typeof rawCables === 'string'
          ? rawCables
          : typeof (rawCables as { dataUrl?: unknown })?.dataUrl === 'string'
            ? ((rawCables as { dataUrl: string }).dataUrl)
            : null;

      const esFueraDeServicio = eq.estadoEquipo === 'fuera_de_servicio';

      const visita: VisitaInspeccion = {
        id: `VIS-${informe.id}-${eq.maquinaId}`,
        fecha: informe.horaDispositivo || informe.horaServidor,
        inspector: informe.usuario,
        estado: esFueraDeServicio
          ? maquina.estado === 'Advertencia'
            ? 'Advertencia'
            : 'Pendiente de Visita'
          : 'Recorrida',
        motivoAdvertencia: esFueraDeServicio
          ? maquina.visita?.motivoAdvertencia || 'Equipo fuera de servicio reportado en inspección'
          : undefined,
        fotosObligatorias: {
          frente: fotoFrente,
          cables: fotoCables,
        },
        firmaEncargado,
        nombreEncargado,
        autorizada: false,
        fechaAutorizacion: null,
        autorizadoPor: null,
        protocoloAGC: null,
        requiereRevision: informe.requiereRevision ?? false,
      };

      if (esFueraDeServicio) {
        maquina.estadoOperativo = 'Fuera de Servicio';
        await this.firmante.registrarVisita(
          maquina.id,
          visita,
          maquina.estado === 'Advertencia' ? 'Advertencia' : 'Pendiente de Visita',
        );
      } else {
        await this.firmante.registrarVisita(maquina.id, visita, 'Recorrida');
      }
    }
  }

  private respuestaDeReenvio(previo: InformeVisita, usuario: string): ResultadoCierre {
    if (previo.usuario !== usuario) throw new ConflictException('Ese identificador de informe ya está en uso.');
    return { informe: previo, creado: false };
  }

  /** `?sinFirma=true` trae los que la Secretaría y el Firmante tienen que ver; `false` los firmados; sin el parámetro, todos. */
  async listar(sinFirma?: string): Promise<ResumenInforme[]> {
    if (sinFirma !== undefined && sinFirma !== 'true' && sinFirma !== 'false') throw new BadRequestException('sinFirma tiene que ser true o false');
    return (await this.repo.listar(sinFirma === undefined ? undefined : sinFirma === 'true')).map(aResumen);
  }

  async obtener(id: string): Promise<InformeVisita> {
    const i = await this.repo.obtener(id);
    if (!i) throw new NotFoundException('Informe no encontrado');
    return i;
  }

  /**
   * Un informe cerrado no se modifica: cualquier intento de cambiarlo o borrarlo responde **409** y queda registrado (quién, con qué rol,
   * qué método y cuándo). Un informe que no existe da 404.
   */
  async rechazarModificacion(id: string, usuario: { usuario: string; rol: string }, metodo: string): Promise<never> {
    const i = await this.repo.obtener(id);
    if (!i) throw new NotFoundException('Informe no encontrado');
    await this.repo.registrarIntento({ informeId: i.id, usuario: usuario.usuario, rol: usuario.rol, metodo: metodo.toUpperCase() });
    throw new ConflictException(MENSAJE_INFORME_CERRADO);
  }

  /**
   * Verifica el sello: recalcula el hash del contenido guardado y lo compara con el que se calculó al cerrar. El resultado queda asentado en
   * la auditoría (quién verificó, cuándo, los dos hashes y si coinciden). Un informe anterior al sellado (sin hash) no coincide.
   */
  async verificar(id: string, usuario: { usuario: string; rol: string }): Promise<VerificacionInforme> {
    const i = await this.obtener(id);
    const hashCalculado = hashInforme(contenidoSellado(i));
    return this.repo.registrarVerificacion({
      informeId: i.id, usuario: usuario.usuario, rol: usuario.rol, hashGuardado: i.hashSha256, hashCalculado, coincide: i.hashSha256 !== null && i.hashSha256 === hashCalculado,
    });
  }

  /** Las verificaciones del sello y los intentos de modificar el informe, en orden. */
  async auditoria(id: string): Promise<AuditoriaInforme> {
    const i = await this.obtener(id);
    const [verificaciones, intentosModificacion] = await Promise.all([this.repo.listarVerificaciones(i.id), this.repo.listarIntentos(i.id)]);
    return { informeId: i.id, verificaciones, intentosModificacion: intentosModificacion as IntentoModificacion[] };
  }
}
