import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { RELOJ, Reloj } from '../auth/auth.types';
import { esElRt, sugerirRt } from './reasignacion.logic';
import { RegistroReasignacion, SugerenciaReasignacion } from './reasignacion.types';
import {
  calcularEdificio,
  colorDelTramo,
  fechaEnZona,
  formatearFecha,
  formatearMes,
  ordenarPorUrgencia,
  parsearFecha,
} from './semaforo.logic';
import { SemaforoRepository } from './semaforo.repository';
import { ColorSemaforo, FechaCalendario, SemaforoEdificio, SemaforoResponse } from './semaforo.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_USUARIO = 100;

function datosInvalidos(...errores: string[]): BadRequestException {
  return new BadRequestException({ message: 'Datos inválidos', errores });
}

@Injectable()
export class SemaforoService {
  constructor(
    private readonly repositorio: SemaforoRepository,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /** `fecha` (AAAA-MM-DD) es opcional: sin ella se usa el día de hoy en hora de Buenos Aires. */
  async obtener(fecha?: unknown): Promise<SemaforoResponse> {
    const dia = this.resolverFecha(fecha);
    const edificios = await this.calcular(dia);

    const totales: Record<ColorSemaforo, number> = { verde: 0, amarillo: 0, rojo: 0 };
    for (const e of edificios) totales[e.color] += 1;

    return {
      fecha: formatearFecha(dia),
      mes: formatearMes(dia),
      tramoDelDia: colorDelTramo(dia.dia),
      totales,
      edificios,
    };
  }

  /**
   * A qué RT de Calle reasignar un edificio en rojo: el que tiene menos edificios pendientes del mes (sin contar al
   * actual). Sólo sugiere: no cambia nada. La reasignación se aplica con `reasignar`, cuando la Secretaría confirma.
   */
  async sugerirReasignacion(consorcioId: string, fecha?: unknown): Promise<SugerenciaReasignacion> {
    const dia = this.resolverFecha(fecha);
    const { edificio, edificios } = await this.edificioEnRojo(consorcioId, dia);
    const disponibles = await this.repositorio.listarRtDisponibles();
    const { sugerido, candidatos } = sugerirRt(disponibles, edificios, edificio.rtCalle);
    return {
      consorcioId,
      nombre: edificio.nombre,
      fecha: formatearFecha(dia),
      color: edificio.color,
      rtActual: edificio.rtCalle,
      sugerido,
      candidatos,
    };
  }

  /**
   * Aplica la reasignación que la Secretaría confirmó y la registra con su usuario, la fecha, el RT anterior y el
   * nuevo. Se rechaza si el edificio no está en rojo, si el RT que la Secretaría vio ya no es el actual, si el RT
   * nuevo es el mismo o no es un RT de Calle activo.
   */
  async reasignar(consorcioId: string, cuerpo: unknown, usuario: string): Promise<RegistroReasignacion> {
    const pedido = this.validarPedido(cuerpo);
    const dia = this.resolverFecha(pedido.fecha);
    const { edificio } = await this.edificioEnRojo(consorcioId, dia);

    if (!edificio.rtCalle) {
      throw new ConflictException('El edificio no tiene RT de Calle asignado: asignale la terna antes de reasignarlo.');
    }
    if (edificio.rtCalle.nombre !== pedido.rtAnterior) {
      throw new ConflictException(
        `El RT del edificio cambió: ahora es "${edificio.rtCalle.nombre}". Se actualizó el panel con el RT vigente.`,
      );
    }
    if (esElRt(edificio.rtCalle, pedido.rtNuevo)) {
      throw datosInvalidos('rtNuevo ya es el RT de Calle de este edificio');
    }
    const disponibles = await this.repositorio.listarRtDisponibles();
    if (!disponibles.some((d) => d.usuario === pedido.rtNuevo)) {
      throw datosInvalidos('rtNuevo no es un RT de Calle activo');
    }

    const resultado = await this.repositorio.reasignarRt({
      consorcioId,
      rtAnterior: pedido.rtAnterior,
      rtNuevo: pedido.rtNuevo,
      usuario,
    });
    if (!resultado.ok) {
      throw new ConflictException(
        resultado.motivo === 'rt_cambio'
          ? 'El RT del edificio cambió mientras confirmabas. Se actualizó el panel con el RT vigente.'
          : 'El edificio no tiene RT de Calle asignado: asignale la terna antes de reasignarlo.',
      );
    }
    return resultado.registro;
  }

  /** El registro de reasignaciones del edificio, la más reciente primero. */
  async historial(consorcioId: string): Promise<RegistroReasignacion[]> {
    this.exigirIdValido(consorcioId);
    const hoy = fechaEnZona(this.reloj.ahora());
    const edificios = await this.repositorio.leerEdificios(hoy);
    if (!edificios.some((e) => e.id === consorcioId)) throw new NotFoundException('Consorcio no encontrado');
    return this.repositorio.listarReasignaciones(consorcioId);
  }

  private async calcular(dia: FechaCalendario): Promise<SemaforoEdificio[]> {
    const base = await this.repositorio.leerEdificios(dia);
    return ordenarPorUrgencia(base.map((b) => calcularEdificio(b, dia)));
  }

  /** El edificio calculado al día de `dia`, que tiene que existir (para la ECA de la petición) y estar en rojo. */
  private async edificioEnRojo(consorcioId: string, dia: FechaCalendario) {
    this.exigirIdValido(consorcioId);
    const edificios = await this.calcular(dia);
    const edificio = edificios.find((e) => e.id === consorcioId);
    if (!edificio) throw new NotFoundException('Consorcio no encontrado');
    if (edificio.color !== 'rojo') {
      throw new ConflictException(
        `Sólo se puede reasignar un edificio en rojo: este está en ${edificio.color} al ${formatearFecha(dia)}.`,
      );
    }
    return { edificio, edificios };
  }

  private exigirIdValido(consorcioId: string): void {
    if (!UUID.test(consorcioId)) throw new NotFoundException('Consorcio no encontrado');
  }

  private validarPedido(cuerpo: unknown): { rtAnterior: string; rtNuevo: string; fecha?: unknown } {
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
      throw datosInvalidos('El cuerpo tiene que ser un objeto JSON');
    }
    const c = cuerpo as Record<string, unknown>;
    const errores: string[] = [];
    const texto = (valor: unknown, campo: string): string => {
      if (typeof valor !== 'string' || valor.trim() === '') {
        errores.push(`${campo} es obligatorio`);
        return '';
      }
      if (valor.length > MAX_USUARIO) errores.push(`${campo} no puede superar ${MAX_USUARIO} caracteres`);
      return valor;
    };
    const rtAnterior = texto(c.rtAnterior, 'rtAnterior');
    const rtNuevo = texto(c.rtNuevo, 'rtNuevo');
    if (errores.length > 0) throw datosInvalidos(...errores);
    return { rtAnterior, rtNuevo, fecha: c.fecha };
  }

  private resolverFecha(fecha: unknown): FechaCalendario {
    if (fecha === undefined) return fechaEnZona(this.reloj.ahora());
    const parseada = typeof fecha === 'string' ? parsearFecha(fecha) : null;
    if (!parseada) {
      throw datosInvalidos('fecha tiene que ser AAAA-MM-DD y un día que exista en el calendario (por ejemplo 2026-11-12)');
    }
    return parseada;
  }
}
