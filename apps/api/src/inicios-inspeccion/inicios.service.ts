import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { evaluarPresencia } from './inicios.logic';
import { IniciosRepository } from './inicios.repository';
import { InicioInspeccion, PRECISION_MAX_POR_DEFECTO_M, RADIO_PRESENCIA_M, RevisionInicio } from './inicios.types';

const MAX_JUSTIFICACION = 500;
const MIN_JUSTIFICACION = 10;
/** La lectura de GPS tiene que ser reciente: hasta 5 minutos antes de apretar «Iniciar» (y no del futuro). */
const ANTIGUEDAD_MAX_GPS_MS = 5 * 60 * 1000;
const ADELANTO_MAX_GPS_MS = 60 * 1000;
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** El inicio de una inspección en el edificio, con la validación de presencia a 30 m (HU-16 RF-02). */
@Injectable()
export class IniciosService {
  private readonly precisionMaxM: number;

  constructor(
    private readonly repo: IniciosRepository,
    @Optional() @Inject(APP_CONFIG) config?: AppConfig,
  ) {
    this.precisionMaxM = config?.gpsPrecisionMaxM ?? PRECISION_MAX_POR_DEFECTO_M;
  }

  /**
   * Registra el inicio. La distancia la mide la API (no se confía en la del celular): con buena señal y a 30 m o menos se registra; con buena
   * señal y más lejos → 409 con la distancia; sin buena señal (precisión mayor que la máxima, o el edificio sin punto cargado) hace falta la
   * foto del frente y una justificación escrita, y la visita queda «pendiente» de revisión de la Secretaría. Se guardan coordenadas,
   * precisión, hora del dispositivo y hora del servidor (la fija la API); nada se edita.
   */
  async iniciar(cuerpo: unknown, usuario: string): Promise<InicioInspeccion> {
    const b = (cuerpo ?? {}) as Record<string, any>;
    const errores: string[] = [];
    const consorcioId = typeof b.consorcioId === 'string' ? b.consorcioId.trim() : '';
    if (!consorcioId) errores.push('consorcioId es obligatorio');
    const g = b.gps ?? {};
    if (!esNumero(g.latitud) || g.latitud < -90 || g.latitud > 90) errores.push('gps.latitud tiene que ser un número entre -90 y 90');
    if (!esNumero(g.longitud) || g.longitud < -180 || g.longitud > 180) errores.push('gps.longitud tiene que ser un número entre -180 y 180');
    if (!esNumero(g.precision) || g.precision < 0) errores.push('gps.precision (el radio de error en metros) tiene que ser un número mayor o igual que 0');
    const hora = typeof b.horaDispositivo === 'string' ? Date.parse(b.horaDispositivo) : NaN;
    if (Number.isNaN(hora)) errores.push('horaDispositivo tiene que ser una fecha y hora válida (ISO 8601)');
    if (errores.length === 0 && g.timestamp !== undefined) {
      const t = typeof g.timestamp === 'string' ? Date.parse(g.timestamp) : NaN;
      if (Number.isNaN(t)) errores.push('gps.timestamp tiene que ser una fecha y hora válida (ISO 8601)');
      else if (hora - t > ANTIGUEDAD_MAX_GPS_MS) errores.push('La ubicación es vieja (más de 5 minutos): volvé a verificar que estás en el edificio.');
      else if (t - hora > ADELANTO_MAX_GPS_MS) errores.push('gps.timestamp no puede ser posterior a la hora del dispositivo.');
    }
    if (errores.length > 0) throw new BadRequestException({ message: 'Datos inválidos', errores });

    const edificio = await this.repo.edificio(consorcioId);
    if (!edificio) throw new NotFoundException('Edificio no encontrado');
    const gps = { latitud: g.latitud as number, longitud: g.longitud as number, precision: g.precision as number };
    const p = evaluarPresencia(gps, edificio.ubicacion, RADIO_PRESENCIA_M, this.precisionMaxM);

    if (p.resultado === 'lejos') {
      throw new ConflictException(`Estás a ${Math.round(p.distanciaM)} m del edificio: tenés que estar a ${RADIO_PRESENCIA_M} m o menos para iniciar la inspección.`);
    }
    let fotoFrenteUrl: string | null = null;
    let justificacion: string | null = null;
    if (p.resultado === 'sin_buena_senal') {
      const foto = typeof b.fotoFrenteUrl === 'string' ? b.fotoFrenteUrl.trim() : '';
      const just = typeof b.justificacion === 'string' ? b.justificacion.trim() : '';
      const faltan: string[] = [];
      if (!foto) faltan.push('la foto del frente del edificio');
      if (just.length < MIN_JUSTIFICACION) faltan.push(`una justificación escrita (al menos ${MIN_JUSTIFICACION} caracteres)`);
      if (just.length > MAX_JUSTIFICACION) faltan.push(`una justificación de hasta ${MAX_JUSTIFICACION} caracteres`);
      if (faltan.length > 0) {
        throw new BadRequestException({ message: 'Sin buena señal GPS: no se puede verificar que estés en el edificio', errores: [`Sin buena señal GPS: hace falta ${faltan.join(' y ')}.`] });
      }
      fotoFrenteUrl = foto;
      justificacion = just;
    }
    return this.repo.guardar(
      { consorcioId, gps, distanciaM: p.distanciaM, horaDispositivo: new Date(hora).toISOString(), sinBuenaSenal: p.resultado === 'sin_buena_senal', fotoFrenteUrl, justificacion },
      usuario,
    );
  }

  /** Los inicios registrados; `?revision=pendiente` trae los que la Secretaría tiene que revisar. */
  listar(revision?: string): Promise<InicioInspeccion[]> {
    if (revision !== undefined && !['no_requiere', 'pendiente', 'revisada'].includes(revision)) {
      throw new BadRequestException('revision tiene que ser no_requiere, pendiente o revisada');
    }
    return this.repo.listar(revision as RevisionInicio | undefined);
  }

  async revisar(id: string, usuario: string): Promise<InicioInspeccion> {
    const r = await this.repo.revisar(id, usuario);
    if (!r) throw new NotFoundException('No hay una visita pendiente de revisión con ese id');
    return r;
  }
}
