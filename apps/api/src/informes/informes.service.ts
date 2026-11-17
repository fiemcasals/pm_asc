import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { aResumen, contenidoSellado, hashInforme, validarInforme } from './informes.logic';
import { InformesRepository } from './informes.repository';
import { AuditoriaInforme, InformeVisita, IntentoModificacion, ResumenInforme, ResultadoCierre, VERSION_HASH, VerificacionInforme } from './informes.types';

export const MENSAJE_INFORME_CERRADO = 'El informe está cerrado: no se puede modificar ni borrar. El intento quedó registrado.';

/** Informes consolidados de la visita, con la firma del encargado o «Sin firma», sellados con un hash al cerrarse (HU-18 RF-01 y RNF-01). */
@Injectable()
export class InformesService {
  constructor(private readonly repo: InformesRepository) {}

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
    if (guardado) return { informe: guardado, creado: true };
    // Otro envío con el mismo identificador ganó la carrera: se devuelve ése.
    const ganador = clientReportId ? await this.repo.buscarPorClientId(clientReportId) : null;
    if (!ganador) throw new ConflictException('No se pudo cerrar el informe: probá de nuevo.');
    return this.respuestaDeReenvio(ganador, usuario);
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
