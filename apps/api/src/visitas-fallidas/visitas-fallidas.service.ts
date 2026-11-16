import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { cicloDeAdvertencias, diasCalendarioEntre, estaBloqueado } from './bloqueo.logic';
import { randomUUID } from 'node:crypto';
import {
  InMemoryVisitasFallidasRepository,
  VisitasFallidasRepository,
} from './visitas-fallidas.repository';
import { fechaEnZona, formatearMes } from '../semaforo/semaforo.logic';
import {
  AnulacionRecargo,
  AnularRecargoDto,
  BloqueoConsorcioInfo,
  DesbloqueoEdificio,
  DesbloquearEdificioDto,
  EdificioRecorrido,
  DetalleConceptoLiquidacion,
  EmailNotificacionConsorcio,
  LiquidacionConsorcioResultado,
  LiquidacionMaquinaDto,
  LiquidacionMaquinaResultado,
  MotivoSinRecargo,
  ReporteVisitaFallidaDto,
  ResumenAdvertenciasConsorcio,
  VisitaFallidaRegistro,
} from './visitas-fallidas.types';

@Injectable()
export class VisitasFallidasService {
  private readonly logger = new Logger(VisitasFallidasService.name);
  private readonly repo: VisitasFallidasRepository;
  /** Días de calendario que tienen que pasar entre dos visitas fallidas del mismo edificio (0 = sin mínimo). */
  private readonly minDiasEntreVisitas: number;

  constructor(@Optional() repo?: VisitasFallidasRepository, @Optional() @Inject(APP_CONFIG) config?: AppConfig) {
    this.repo = repo ?? new InMemoryVisitasFallidasRepository();
    this.minDiasEntreVisitas = config?.visitasFallidasMinDias ?? 1;
  }

  /**
   * Criterio 1 (RF-01): Valida el reporte comprobando foto del frente y coordenadas GPS congeladas.
   * Criterio 2 (RF-01): Al confirmarse Advertencia 1 o 2, despacha email formal a la administración.
   * Criterio 1-3 (RF-03): Persiste en PostgreSQL de forma transaccional y propaga cualquier error de guardado.
   */
  async registrarVisitaFallida(
    dto: ReporteVisitaFallidaDto,
  ): Promise<VisitaFallidaRegistro> {
    if (!dto) {
      throw new BadRequestException('El cuerpo del reporte es obligatorio');
    }

    if (!dto.consorcioId || typeof dto.consorcioId !== 'string' || dto.consorcioId.trim() === '') {
      throw new BadRequestException('El identificador del consorcio (consorcioId) es obligatorio');
    }

    // Criterio 1: Validación obligatoria de fotografía del frente
    if (
      !dto.fotoFrenteUrl ||
      typeof dto.fotoFrenteUrl !== 'string' ||
      dto.fotoFrenteUrl.trim() === ''
    ) {
      throw new BadRequestException(
        'La fotografía del frente del edificio es obligatoria para certificar la presencia.',
      );
    }

    // Criterio 1: Validación obligatoria de coordenadas GPS congeladas
    if (
      !dto.gps ||
      typeof dto.gps !== 'object' ||
      typeof dto.gps.latitud !== 'number' ||
      !Number.isFinite(dto.gps.latitud) ||
      typeof dto.gps.longitud !== 'number' ||
      !Number.isFinite(dto.gps.longitud)
    ) {
      throw new BadRequestException(
        'Las coordenadas GPS congeladas son obligatorias para certificar la geolocalización de la visita fallida.',
      );
    }

    const consorcioInfo = await this.resolverConsorcioInfo(dto.consorcioId);
    const fechaHora = new Date().toISOString();
    const motivo = dto.motivo?.trim() || 'No se pudo realizar la inspección: encargado ausente';
    const inspector = dto.inspector?.trim() || 'Inspector Técnico de Guardia (RT Calle)';

    const guardado = await this.repo.registrar(dto.consorcioId, (previasCount, ultimaVisitaFallidaIso) => {
      // HU-07 RF-05: entre dos visitas fallidas del mismo edificio tiene que pasar al menos un día (de calendario, hora de Buenos
      // Aires). Se controla dentro del bloqueo del registro, así dos pedidos simultáneos no suman dos advertencias el mismo día.
      if (
        this.minDiasEntreVisitas > 0 &&
        ultimaVisitaFallidaIso &&
        diasCalendarioEntre(Date.parse(ultimaVisitaFallidaIso), Date.parse(fechaHora)) < this.minDiasEntreVisitas
      ) {
        throw new ConflictException(
          'Este edificio ya tiene una visita fallida de hoy: entre dos visitas fallidas tiene que pasar al menos 1 día. No se sumó ninguna advertencia.',
        );
      }
      // Las advertencias vigentes (previasCount) son las posteriores a la última inspección del edificio: sólo una visita exitosa las reinicia.
      const numeroAdvertencia: 1 | 2 | 3 =
        previasCount === 0 ? 1 : previasCount === 1 ? 2 : 3;

      // Al confirmarse Advertencia 1 o 2, generar y preparar correo formal
      let emailNotificacion: EmailNotificacionConsorcio | null = null;
      if (numeroAdvertencia === 1 || numeroAdvertencia === 2) {
        const emailDestino =
          dto.emailAdministracion?.trim() ||
          consorcioInfo.email ||
          `administracion@${dto.consorcioId}.com.ar`;

        emailNotificacion = this.generarYEnviarCorreoFormal({
          consorcioNombre: consorcioInfo.nombre,
          direccion: consorcioInfo.direccion,
          numeroAdvertencia,
          destinatario: emailDestino,
          motivo,
          fotoFrenteUrl: dto.fotoFrenteUrl,
          gps: dto.gps,
          fechaHora,
          inspector,
        });
      }

      return {
        id: `VF-${randomUUID()}`,
        consorcioId: dto.consorcioId,
        consorcioNombre: consorcioInfo.nombre,
        direccion: consorcioInfo.direccion,
        numeroAdvertencia,
        motivo,
        fotoFrenteUrl: dto.fotoFrenteUrl,
        gps: {
          latitud: dto.gps.latitud,
          longitud: dto.gps.longitud,
          precision: dto.gps.precision || 5.0,
          timestamp: dto.gps.timestamp || fechaHora,
        },
        inspector,
        fechaHora,
        emailNotificacion,
      };
    });

    this.logger.log(
      `Visita fallida registrada para consorcio ${consorcioInfo.nombre} — Advertencia ${guardado.numeroAdvertencia}${
        guardado.emailNotificacion ? ` (Email despachado a ${guardado.emailNotificacion.destinatario})` : ''
      }`,
    );

    return guardado;
  }

  async getHistorialConsorcio(consorcioId: string): Promise<ResumenAdvertenciasConsorcio> {
    // Sólo cuentan las advertencias vigentes: las posteriores a la última visita exitosa (inspección) del edificio.
    const historial = cicloDeAdvertencias(
      await this.repo.listarPorConsorcio(consorcioId),
      await this.repo.ultimaInspeccion(consorcioId),
    );
    const totalAdvertencias = historial.length;
    const ultima = historial.length > 0 ? historial[historial.length - 1].numeroAdvertencia : null;
    // Bloqueado: 3 advertencias vigentes y sin desbloqueo posterior. El recargo se genera con la 3.ª advertencia aunque se desbloquee.
    const bloqueado = estaBloqueado(historial, await this.repo.listarDesbloqueos(consorcioId));

    return {
      consorcioId,
      totalAdvertencias,
      ultimaAdvertencia: ultima,
      bloqueadoPorTerceraVisita: bloqueado,
      recargoAplicable: totalAdvertencias >= 3,
      avisoCobro: bloqueado ? 'Cobro de Tercer Visita Habilitado' : null,
      historial,
    };
  }

  /**
   * HU-07 / RF-02 Criterio 1:
   * Al acumularse la Advertencia 3, el edificio queda bloqueado en el tablero exhibiendo el aviso
   * "Cobro de Tercer Visita Habilitado".
   */
  async getBloqueoConsorcio(consorcioId: string): Promise<BloqueoConsorcioInfo> {
    const consorcioInfo = await this.resolverConsorcioInfo(consorcioId);
    const resumen = await this.getHistorialConsorcio(consorcioId);
    const bloqueado = resumen.bloqueadoPorTerceraVisita;

    return {
      consorcioId,
      consorcioNombre: consorcioInfo.nombre,
      bloqueado,
      avisoCobro: bloqueado ? 'Cobro de Tercer Visita Habilitado' : null,
      totalAdvertencias: resumen.totalAdvertencias,
      recargoAplicable: resumen.recargoAplicable,
      porcentajeRecargo: resumen.recargoAplicable ? 45 : 0,
      motivoBloqueo: bloqueado
        ? 'El edificio acumula 3 visitas fallidas consecutivas. Queda bloqueado en el tablero y habilitado para cobro con recargo del 45%.'
        : null,
    };
  }

  /**
   * HU-07 / RF-02 Criterio 2:
   * El módulo de facturación mensual suma automáticamente el recargo del 45% extra a la liquidación de esa máquina.
   */
  async liquidarMaquina(dto: LiquidacionMaquinaDto): Promise<LiquidacionMaquinaResultado> {
    if (!dto || !dto.consorcioId) {
      throw new BadRequestException('El consorcioId es obligatorio para liquidar la máquina');
    }

    const consorcioInfo = await this.resolverConsorcioInfo(dto.consorcioId);
    const resumen = await this.getHistorialConsorcio(dto.consorcioId);

    const maquinaId = dto.maquinaId || `maq-${dto.referenciaAgc || 'M1'}`;
    // HU-02 RF-04: el abono y los porcentajes salen de la máquina; sólo si no tiene abono cargado se usa el que mandó quien liquida o el valor por defecto.
    const pago = await this.repo.pagoDeMaquina(maquinaId);
    const porParametro = typeof dto.montoBase === 'number' && dto.montoBase > 0;
    const origenAbono: 'maquina' | 'parametro' | 'por_defecto' = pago?.abonoMensual != null ? 'maquina' : porParametro ? 'parametro' : 'por_defecto';
    const montoBase = pago?.abonoMensual != null ? pago.abonoMensual : porParametro ? (dto.montoBase as number) : 150000;
    const porcentajeRt = pago?.porcentajeRt ?? 60;
    const porcentajeFirmante = pago?.porcentajeFirmante ?? 25;
    const referenciaAgc = dto.referenciaAgc || 'M1';
    const periodo = dto.periodo || new Date().toISOString().slice(0, 7);

    // HU-07 RF-04: el recargo se suma una sola vez por máquina no inspeccionada, en la liquidación siguiente a la 3.ª
    // advertencia, y un Administrador puede anularlo. Después, aunque el edificio siga bloqueado, no vuelve a sumarse.
    const { tieneRecargo, noAplicadoPor, anulacion } = await this.decidirRecargo(dto.consorcioId, maquinaId, periodo, resumen);

    const porcentajeRecargo = tieneRecargo ? 45 : 0;
    const montoRecargo = tieneRecargo ? Math.round(montoBase * 0.45 * 100) / 100 : 0;
    const montoTotal = Math.round((montoBase + montoRecargo) * 100) / 100;
    const avisoCobro = resumen.bloqueadoPorTerceraVisita ? 'Cobro de Tercer Visita Habilitado' : null;

    const detalleConceptos: DetalleConceptoLiquidacion[] = [
      {
        concepto: `Abono mensual conservación y mantenimiento máquina ${referenciaAgc}`,
        monto: montoBase,
      },
    ];

    if (anulacion) {
      detalleConceptos.push({
        concepto: `Recargo 45% anulado por ${anulacion.usuario}: ${anulacion.motivo}`,
        monto: 0,
      });
    }

    if (tieneRecargo) {
      detalleConceptos.push({
        concepto: `Recargo 45% extra por tercera visita fallida — Cobro de Tercer Visita Habilitado (Normativa AGC)`,
        monto: montoRecargo,
      });
    }

    this.logger.log(
      `Liquidación emitida para máquina ${referenciaAgc} (Consorcio ${consorcioInfo.nombre}) — Base: $${montoBase}, Recargo 45%: $${montoRecargo}, Total: $${montoTotal}`,
    );

    return {
      id: `LIQ-${dto.consorcioId.slice(0, 8)}-${referenciaAgc}-${periodo}`,
      consorcioId: dto.consorcioId,
      consorcioNombre: consorcioInfo.nombre,
      maquinaId,
      referenciaAgc,
      periodo,
      montoBase,
      origenAbono,
      porcentajeRt,
      porcentajeFirmante,
      montoRt: Math.round(montoBase * porcentajeRt) / 100,
      montoFirmante: Math.round(montoBase * porcentajeFirmante) / 100,
      totalAdvertencias: resumen.totalAdvertencias,
      bloqueadoPorTerceraVisita: resumen.bloqueadoPorTerceraVisita,
      recargoAplicado: tieneRecargo,
      porcentajeRecargo,
      montoRecargo,
      montoTotal,
      avisoCobro,
      recargoNoAplicadoPor: noAplicadoPor,
      recargoAnulado: anulacion ? { usuario: anulacion.usuario, motivo: anulacion.motivo, fecha: anulacion.fecha } : null,
      detalleConceptos,
      fechaLiquidacion: new Date().toISOString(),
    };
  }

  /**
   * Si esta máquina lleva el recargo del 45 % en la liquidación de `periodo` (HU-07 RF-04). El recargo nace con la 3.ª
   * advertencia del edificio y se suma una sola vez, en la liquidación del mes de esa advertencia (hora de Buenos
   * Aires): la del período siguiente y las posteriores no lo repiten, aunque el edificio siga bloqueado. No lo lleva una
   * máquina inspeccionada ese mes, ni una cuyo recargo anuló un Administrador.
   */
  private async decidirRecargo(
    consorcioId: string,
    maquinaId: string,
    periodo: string,
    resumen: ResumenAdvertenciasConsorcio,
  ): Promise<{ tieneRecargo: boolean; noAplicadoPor: MotivoSinRecargo | null; anulacion: AnulacionRecargo | null }> {
    const tercera = resumen.historial[2];
    if (resumen.totalAdvertencias < 3 || !tercera) return { tieneRecargo: false, noAplicadoPor: null, anulacion: null };

    const mesDelRecargo = formatearMes(fechaEnZona(Date.parse(tercera.fechaHora)));
    if (periodo !== mesDelRecargo) return { tieneRecargo: false, noAplicadoPor: 'otro_periodo', anulacion: null };

    const inspeccionadas = await this.repo.maquinasInspeccionadasEnMes(consorcioId, mesDelRecargo);
    if (inspeccionadas.includes(maquinaId)) return { tieneRecargo: false, noAplicadoPor: 'maquina_inspeccionada', anulacion: null };

    const anulacion = (await this.repo.listarAnulaciones(consorcioId)).find(
      (a) => a.visitaFallidaId === tercera.id && a.maquinaId === maquinaId,
    );
    if (anulacion) return { tieneRecargo: false, noAplicadoPor: 'anulado', anulacion };
    return { tieneRecargo: true, noAplicadoPor: null, anulacion: null };
  }

  /**
   * Anula el recargo del 45 % de una máquina (sólo un Administrador: lo exige el controlador). El motivo es obligatorio y
   * la anulación queda registrada con el usuario de la sesión, la fecha del servidor y el motivo.
   */
  async anularRecargo(dto: AnularRecargoDto, usuario: string): Promise<AnulacionRecargo> {
    const errores: string[] = [];
    const consorcioId = typeof dto?.consorcioId === 'string' ? dto.consorcioId.trim() : '';
    const maquinaId = typeof dto?.maquinaId === 'string' ? dto.maquinaId.trim() : '';
    const motivo = typeof dto?.motivo === 'string' ? dto.motivo.trim() : '';
    if (!consorcioId) errores.push('consorcioId es obligatorio');
    if (!maquinaId) errores.push('maquinaId es obligatorio');
    if (!motivo) errores.push('motivo es obligatorio: dejá constancia de por qué se anula el recargo');
    if (motivo.length > 500) errores.push('motivo no puede superar los 500 caracteres');
    if (errores.length > 0) throw new BadRequestException({ message: 'Datos inválidos', errores });

    await this.resolverConsorcioInfo(consorcioId);
    const resumen = await this.getHistorialConsorcio(consorcioId);
    const tercera = resumen.historial[2];
    if (resumen.totalAdvertencias < 3 || !tercera) {
      throw new ConflictException('Este edificio no tiene un recargo del 45 % para anular: no llegó a la 3.ª advertencia.');
    }
    const maquinas = await this.repo.listarMaquinasConsorcio(consorcioId);
    if (maquinas.length > 0 && !maquinas.some((m) => m.id === maquinaId)) {
      throw new NotFoundException('Esa máquina no pertenece al edificio.');
    }

    const anulacion = await this.repo.anularRecargo({ consorcioId, maquinaId, visitaFallidaId: tercera.id, usuario, motivo });
    if (!anulacion) throw new ConflictException('El recargo de esta máquina ya estaba anulado.');
    this.logger.log(`Recargo 45% anulado por ${usuario} — consorcio ${consorcioId}, máquina ${maquinaId}: ${motivo}`);
    return anulacion;
  }

  /**
   * Facturación mensual consolidada de todas las máquinas del consorcio aplicando recargo 45% si corresponde.
   */
  async liquidarConsorcio(
    consorcioId: string,
    periodo?: string,
    montoBasePorMaquina?: number,
  ): Promise<LiquidacionConsorcioResultado> {
    const consorcioInfo = await this.resolverConsorcioInfo(consorcioId);
    const resumen = await this.getHistorialConsorcio(consorcioId);
    const periodoActual = periodo || new Date().toISOString().slice(0, 7);

    let maquinasLista = await this.repo.listarMaquinasConsorcio(consorcioId);
    if (maquinasLista.length === 0) {
      maquinasLista = [
        { id: `maq-${consorcioId}-1`, referenciaAgc: 'M1' },
        { id: `maq-${consorcioId}-2`, referenciaAgc: 'M2' },
      ];
    }

    const liquidacionesMaquinas: LiquidacionMaquinaResultado[] = [];
    let subtotalBase = 0;
    let totalRecargos = 0;

    for (const maq of maquinasLista) {
      const liq = await this.liquidarMaquina({
        consorcioId,
        maquinaId: maq.id,
        referenciaAgc: maq.referenciaAgc,
        periodo: periodoActual,
        montoBase: montoBasePorMaquina,
      });
      liquidacionesMaquinas.push(liq);
      subtotalBase += liq.montoBase;
      totalRecargos += liq.montoRecargo;
    }

    return {
      consorcioId,
      consorcioNombre: consorcioInfo.nombre,
      periodo: periodoActual,
      totalMaquinas: maquinasLista.length,
      totalAdvertencias: resumen.totalAdvertencias,
      bloqueadoPorTerceraVisita: resumen.bloqueadoPorTerceraVisita,
      avisoCobro: resumen.avisoCobro,
      subtotalBase,
      totalRecargos,
      totalGeneral: subtotalBase + totalRecargos,
      liquidacionesMaquinas,
      fechaLiquidacion: new Date().toISOString(),
    };
  }

  async getTodas(): Promise<VisitaFallidaRegistro[]> {
    return this.repo.listarTodas();
  }

  /**
   * Criterio 2: Genera la plantilla formal institucional de MAICON S.R.L. y simula el despacho de email formal.
   */
  private generarYEnviarCorreoFormal(params: {
    consorcioNombre: string;
    direccion: string;
    numeroAdvertencia: 1 | 2;
    destinatario: string;
    motivo: string;
    fotoFrenteUrl: string;
    gps: { latitud: number; longitud: number };
    fechaHora: string;
    inspector: string;
  }): EmailNotificacionConsorcio {
    const asunto = `[MAICON S.R.L.] Notificación Oficial de Visita Fallida — Advertencia ${params.numeroAdvertencia} — ${params.consorcioNombre}`;

    const cuerpo = [
      '=========================================================================',
      '                      MAICON S.R.L. - CONSERVACIÓN AGC                   ',
      '        DEPARTAMENTO TÉCNICO Y LEGAL DE TRANSPORTE VERTICAL              ',
      '=========================================================================',
      '',
      `Estimada Administración de ${params.consorcioNombre}:`,
      '',
      `Por medio de la presente, se notifica fehacientemente que con fecha ${new Date(
        params.fechaHora,
      ).toLocaleString('es-AR')}, el inspector técnico ${params.inspector} se apersonó`,
      `en el inmueble sito en ${params.direccion} para llevar a cabo la inspección`,
      'mensual obligatoria conforme la normativa vigente del Gobierno de la Ciudad (AGC).',
      '',
      `MOTIVO DE VISITA FALLIDA: ${params.motivo}.`,
      'Se deja expresa constancia de la imposibilidad de acceder a las máquinas / ausencia del encargado.',
      '',
      'CONSTANCIAS FEHACIENTES REGISTRADAS:',
      `- Coordenadas GPS congeladas en punto de visita: Latitud ${params.gps.latitud.toFixed(
        6,
      )}, Longitud ${params.gps.longitud.toFixed(6)}`,
      `- Registro fotográfico del frente del inmueble: ${params.fotoFrenteUrl}`,
      '',
      `ESTADO: NOTIFICACIÓN DE ADVERTENCIA ${params.numeroAdvertencia} DE 3.`,
      'ADVERTENCIA REGLAMENTARIA:',
      'Le recordamos que el protocolo técnico de servicio establece que, de registrarse',
      'una 3ra (tercera) visita fallida consecutiva, el edificio quedará bloqueado en el',
      'sistema de rutas y se aplicará automáticamente el recargo reglamentario del 45% extra',
      'sobre el abono en la próxima liquidación mensual.',
      '',
      'Solicitamos comunicarse a la brevedad con nuestra guardia técnica para coordinar un nuevo acceso.',
      '',
      'Atentamente,',
      'Mesa de Notificaciones Legales y Operativas',
      'MAICON S.R.L. — Transporte Vertical CABA',
      '=========================================================================',
    ].join('\n');

    return {
      id: `MAIL-ADV-${params.numeroAdvertencia}-${Date.now()}`,
      destinatario: params.destinatario,
      remitente: 'notificaciones@maicon.com.ar',
      asunto,
      cuerpo,
      fechaEnvio: params.fechaHora,
      estado: 'enviado',
    };
  }

  private async resolverConsorcioInfo(
    consorcioId: string,
  ): Promise<{ nombre: string; direccion: string; email: string }> {
    const encontrado = await this.repo.buscarConsorcioInfo(consorcioId);
    if (encontrado) {
      return {
        nombre: encontrado.nombre,
        direccion: encontrado.direccion,
        email: encontrado.email || 'administracion@consorcio.com.ar',
      };
    }

    return {
      nombre: `Consorcio Edificio ${consorcioId}`,
      direccion: `Av. Corrientes ${consorcioId.slice(0, 4) || '1234'}, CABA`,
      email: `administracion@${consorcioId}.com.ar`,
    };
  }

  /**
   * HU-07 RF-05: la Secretaría desbloquea un edificio bloqueado por la 3.ª visita fallida, con motivo obligatorio. Vuelve al recorrido
   * del RT y el desbloqueo queda registrado (usuario de la sesión, fecha del servidor y motivo). No reinicia el contador: eso sólo lo
   * hace una visita exitosa; si el edificio falla otra vez después, se bloquea de nuevo.
   */
  async desbloquearEdificio(consorcioId: string, dto: DesbloquearEdificioDto, usuario: string): Promise<DesbloqueoEdificio> {
    const motivo = typeof dto?.motivo === 'string' ? dto.motivo.trim() : '';
    if (!motivo) throw new BadRequestException({ message: 'Datos inválidos', errores: ['motivo es obligatorio: dejá constancia de por qué se desbloquea el edificio'] });
    if (motivo.length > 500) throw new BadRequestException({ message: 'Datos inválidos', errores: ['motivo no puede superar los 500 caracteres'] });

    await this.resolverConsorcioInfo(consorcioId);
    const resumen = await this.getHistorialConsorcio(consorcioId);
    const ultima = resumen.historial[resumen.historial.length - 1];
    if (!resumen.bloqueadoPorTerceraVisita || !ultima) {
      throw new ConflictException('Este edificio no está bloqueado: no hay nada para desbloquear.');
    }
    const desbloqueo = await this.repo.desbloquear({ consorcioId, hastaVisitaId: ultima.id, usuario, motivo });
    if (!desbloqueo) throw new ConflictException('Este edificio ya fue desbloqueado.');
    this.logger.log(`Edificio ${consorcioId} desbloqueado por ${usuario}: ${motivo}`);
    return desbloqueo;
  }

  /**
   * La lista de edificios a visitar. El RT de Calle no ve los edificios bloqueados (salen de su recorrido hasta que la Secretaría los
   * desbloquea); la Secretaría y el Administrador ven todos, con el estado de bloqueo. Los edificios que cada usuario ve los decide el RLS.
   */
  async getRecorrido(rol: string): Promise<EdificioRecorrido[]> {
    const [edificios, todas, inspecciones, desbloqueos] = await Promise.all([
      this.repo.listarEdificiosVisibles(),
      this.repo.listarTodas(),
      this.repo.ultimasInspecciones(),
      this.repo.listarDesbloqueos(),
    ]);
    const lista = edificios.map((e) => {
      const propias = todas.filter((v) => v.consorcioId === e.id);
      const ciclo = cicloDeAdvertencias(propias, inspecciones[e.id] ?? null);
      return { ...e, bloqueado: estaBloqueado(ciclo, desbloqueos.filter((d) => d.consorcioId === e.id)) };
    });
    return rol === 'rt_calle' ? lista.filter((e) => !e.bloqueado) : lista;
  }
}
