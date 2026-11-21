import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { FallasCriticasRepository } from './fallas-criticas.repository';
import { randomUUID } from 'node:crypto';
import { Observable, Subject, filter } from 'rxjs';
import { obtenerFallasCriticasDefinidas } from '../checklist/checklist.config';
import { FirmanteService } from '../firmante/firmante.service';
import {
  EventoAperturaFalla,
  EventoFallaCritica,
  FallaCritica,
  FallaCriticaDetalle,
  InformeFalla,
  InformeFallaInput,
  RegistrarInformeResponse,
} from './fallas-criticas.types';

const MAX_OBSERVACIONES = 2000;

/**
 * Las fallas críticas que definió el cliente (HU-06 RF-03), tal como las tiene el checklist: por código, con su nombre legible, su zona
 * y los tipos de máquina en los que existen. Es la única fuente: cualquier otro código es una falla común y no genera alerta.
 */
/** Los dos códigos históricos conservan el nombre con el que ya se mostraban. */
const NOMBRES_HISTORICOS: Record<string, string> = {
  CABLES_DESGASTADOS: 'Cables de tracción desgastados',
  LIMITADOR_ANULADO: 'Limitador de velocidad anulado',
};

const CATALOGO = new Map(
  obtenerFallasCriticasDefinidas().map((f, orden) => [
    f.codigoFallaCritica,
    {
      detalle: { codigo: f.codigoFallaCritica, nombre: NOMBRES_HISTORICOS[f.codigoFallaCritica] ?? `${f.itemEtiqueta}: ${f.opcionEtiqueta}`, zonaId: f.solapaId, zona: f.solapaNombre } as FallaCriticaDetalle,
      tipos: f.tiposAplicables as readonly string[],
      orden,
    },
  ]),
);

/** El detalle de las fallas críticas, en el orden de las zonas y de los ítems del checklist. */
function detalleOrdenado(codigos: FallaCritica[]): FallaCriticaDetalle[] {
  return codigos
    .map((c) => CATALOGO.get(c))
    .filter((e): e is NonNullable<typeof e> => e !== undefined)
    .sort((a, b) => a.orden - b.orden)
    .map((e) => ({ ...e.detalle }));
}
const MAX_FOTOGRAFIAS = 10;

/** Una alerta de un edificio con ese Firmante: la Secretaría y el Administrador ven todas; un Firmante, solo las suyas (sin distinguir mayúsculas). */
function esVisiblePara(firmanteDelEdificio: string, usuario: { usuario: string; rol: string }): boolean {
  return usuario.rol !== 'firmante' || firmanteDelEdificio.toLowerCase() === usuario.usuario.toLowerCase();
}

/**
 * Recibe los informes que carga el RT de calle y, si traen una falla crítica (cables
 * desgastados o limitador de velocidad anulado), emite un evento en tiempo real para el panel
 * de Secretaría.
 *
 * Los informes quedan en memoria, igual que las máquinas de FirmanteService de las que cuelgan:
 * se pierden al reiniciar la API. No modifica la alerta crítica de la máquina (eso alimenta el
 * Portal ECA y el despacho legal, que son otros Requerimientos).
 */
@Injectable()
export class FallasCriticasService {
  private readonly informes = new Map<string, InformeFalla>();
  private readonly informesPorClientId = new Map<string, InformeFalla>();
  private readonly eventos = new Subject<EventoFallaCritica>();
  private readonly aperturas = new Subject<EventoAperturaFalla>();

  private readonly logger = new Logger(FallasCriticasService.name);
  /** Escrituras al repositorio en orden: una versión vieja de un informe nunca pisa a una nueva. */
  private cola: Promise<void> = Promise.resolve();

  /** Sin repositorio (pruebas aisladas) los informes quedan en memoria, como antes. */
  constructor(
    private readonly firmanteService: FirmanteService,
    @Optional() private readonly repo?: FallasCriticasRepository,
  ) {}

  /**
   * HU-06 RF-08: al arrancar, carga los informes guardados (con su clientReportId y quién abrió cada alerta). No vuelve a emitir sus
   * eventos: lo que ya se avisó no se avisa de nuevo (los avisos se guardan aparte, HU-11 RF-11).
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.repo) return;
    try {
      for (const informe of await this.repo.leer()) {
        if (this.informes.has(informe.id)) continue;
        this.informes.set(informe.id, informe);
        if (informe.clientReportId && !this.informesPorClientId.has(informe.clientReportId)) this.informesPorClientId.set(informe.clientReportId, informe);
      }
    } catch (err) {
      this.logger.error(`No se pudieron cargar los informes de falla guardados: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Termina las escrituras pendientes (para las pruebas y el apagado). */
  async esperarGuardados(): Promise<void> {
    await this.cola;
  }

  /** Guarda una copia del informe en orden y en segundo plano. Si la base no responde, lo deja registrado y el informe sigue en memoria. */
  private guardar(informe: InformeFalla): void {
    if (!this.repo) return;
    const copia = structuredClone(informe);
    this.cola = this.cola
      .then(() => this.repo!.guardar(copia))
      .catch((err) => this.logger.error(`No se pudo guardar el informe ${copia.id}: ${err instanceof Error ? err.message : String(err)}`));
  }

  /** Flujo de eventos de falla crítica. Cada suscriptor recibe sólo los posteriores a suscribirse. */
  eventos$(): Observable<EventoFallaCritica> {
    return this.eventos.asObservable();
  }

  /** Avisos de apertura de alertas: cuando alguien abre una, la alarma se detiene en todas las pantallas. */
  aperturas$(): Observable<EventoAperturaFalla> {
    return this.aperturas.asObservable();
  }

  /**
   * Lo que ve un usuario por el canal en tiempo real (HU-06 RF-07): la Secretaría y el Administrador, todas las fallas críticas; un Firmante,
   * solo las de los edificios que tiene asignados (el mismo criterio que la lista y que abrir una alerta).
   */
  eventosPara(usuario: { usuario: string; rol: string }): Observable<EventoFallaCritica> {
    return this.eventos.pipe(filter((evento) => esVisiblePara(evento.firmanteUsername, usuario)));
  }

  /** Las aperturas de alerta que ve ese usuario por el canal: las de las alertas que él puede ver. */
  aperturasPara(usuario: { usuario: string; rol: string }): Observable<EventoAperturaFalla> {
    return this.aperturas.pipe(
      filter((apertura) => {
        const informe = this.informes.get(apertura.informeId);
        return informe !== undefined && esVisiblePara(informe.firmanteUsername, usuario);
      }),
    );
  }

  /**
   * Lista eventos críticos ya emitidos (en orden cronológico) para Secretaría y Firmante al abrir su panel. Un Firmante sólo ve las
   * alertas de los edificios que tiene asignados (HU-06 RF-04); la Secretaría y el Administrador ven todas.
   */
  listarEventosCriticos(para?: { usuario: string; rol: string }): EventoFallaCritica[] {
    const lista: EventoFallaCritica[] = [];
    for (const informe of this.informes.values()) {
      if (informe.fallasCriticas.length === 0) continue;
      if (para && !esVisiblePara(informe.firmanteUsername, para)) continue;
      lista.push(aEventoFalla(informe));
    }
    return lista;
  }

  /**
   * HU-06 RF-04: registra quién abrió la alerta primero y cuándo, y avisa por el canal para que deje de sonar en todas las pantallas.
   * Idempotente: una segunda apertura no cambia nada y devuelve la primera. Un Firmante sólo abre las de sus edificios.
   */
  abrir(id: string, usuario: { usuario: string; rol: string }): { abiertaPor: string; abiertaEn: string; primera: boolean } {
    const informe = this.informes.get(id);
    if (!informe || informe.fallasCriticas.length === 0) throw new NotFoundException(`No existe la alerta ${id}`);
    if (!esVisiblePara(informe.firmanteUsername, usuario)) {
      throw new ForbiddenException('Esta alerta es de un edificio que no tenés asignado.');
    }
    if (informe.abiertaPor) return { abiertaPor: informe.abiertaPor, abiertaEn: informe.abiertaEn!, primera: false };
    informe.abiertaPor = usuario.usuario;
    informe.abiertaEn = new Date().toISOString();
    this.guardar(informe);
    this.aperturas.next({ tipo: 'falla-abierta', informeId: id, abiertaPor: informe.abiertaPor, abiertaEn: informe.abiertaEn });
    return { abiertaPor: informe.abiertaPor, abiertaEn: informe.abiertaEn, primera: true };
  }

  /**
   * `inspectorSesion` (HU-06 RF-06): el usuario de la sesión. Es el inspector del informe; el `inspector` que venga en el cuerpo se ignora
   * (cualquiera podía mandar otro nombre). Sin él (uso interno y pruebas del servicio) se sigue tomando del cuerpo.
   */
  registrarInforme(body: unknown, inspectorSesion?: string): RegistrarInformeResponse {
    const input = validarInforme(body, inspectorSesion);

    if (input.clientReportId && this.informesPorClientId.has(input.clientReportId)) {
      const existente = this.informesPorClientId.get(input.clientReportId)!;
      return { informe: structuredClone(existente), eventoEmitido: false };
    }

    const maquina = this.firmanteService.getMaquinas().find((m) => m.id === input.maquinaId);
    if (!maquina) {
      throw new NotFoundException(`No existe la máquina ${input.maquinaId}`);
    }

    const fallasCriticas: FallaCritica[] = [];
    const fallasComunes: string[] = [];
    const agregarCritica = (codigo: FallaCritica) => {
      if (!fallasCriticas.includes(codigo)) fallasCriticas.push(codigo);
    };
    if (input.cablesDesgastados) agregarCritica('CABLES_DESGASTADOS');
    if (input.limitadorAnulado) agregarCritica('LIMITADOR_ANULADO');
    for (const codigo of input.fallasCriticas ?? []) {
      // Sólo las fallas de la lista del cliente son críticas; las que sacó (pérdida de aceite, tablero, puerta tijera...) se registran
      // como falla común y no generan alerta.
      if (CATALOGO.has(codigo)) agregarCritica(codigo);
      else if (!fallasComunes.includes(codigo)) fallasComunes.push(codigo);
    }

    // Hay fallas críticas que sólo existen en un tipo de máquina: el aceite de batea, en las hidráulicas.
    const tipoMaquina = maquina.tipo ?? 'traccion';
    const noAplican = fallasCriticas.filter((c) => !CATALOGO.get(c)!.tipos.includes(tipoMaquina));
    if (noAplican.length > 0) {
      throw new BadRequestException({
        message: 'Datos inválidos',
        errores: noAplican.map((c) => {
          const solo = CATALOGO.get(c)!.tipos.join(' o ');
          return `${CATALOGO.get(c)!.detalle.nombre} no se puede informar en la máquina ${maquina.codigoAGC} (${tipoMaquina}): sólo aplica a máquinas ${solo}`;
        }),
      });
    }

    const id = `INF-${randomUUID()}`;
    const informe: InformeFalla = {
      id,
      ...(input.clientReportId ? { clientReportId: input.clientReportId } : {}),
      maquinaId: maquina.id,
      codigoAGC: maquina.codigoAGC,
      nombreMaquina: maquina.nombre,
      edificio: {
        direccion: maquina.edificio.direccion,
        consorcio: maquina.edificio.consorcio,
      },
      eca: maquina.eca,
      inspector: input.inspector,
      cablesDesgastados: input.cablesDesgastados || fallasCriticas.includes('CABLES_DESGASTADOS'),
      limitadorAnulado: input.limitadorAnulado || fallasCriticas.includes('LIMITADOR_ANULADO'),
      observaciones: input.observaciones ?? '',
      fotografias: input.fotografias ?? [],
      fallasCriticas,
      fallasCriticasDetalle: detalleOrdenado(fallasCriticas),
      fallasComunes,
      registradoEn: new Date().toISOString(),
      enlaceInforme: `/api/fallas-criticas/informes/${id}`,
      firmanteUsername: maquina.firmanteUsername,
      abiertaPor: null,
      abiertaEn: null,
    };
    this.informes.set(id, informe);
    if (input.clientReportId) {
      this.informesPorClientId.set(input.clientReportId, informe);
    }
    this.guardar(informe);

    const eventoEmitido = fallasCriticas.length > 0;
    if (eventoEmitido) {
      this.eventos.next(aEventoFalla(informe));
    }

    return { informe: structuredClone(informe), eventoEmitido };
  }

  obtenerInforme(id: string): InformeFalla {
    const informe = this.informes.get(id);
    if (!informe) {
      throw new NotFoundException(`No existe el informe ${id}`);
    }
    return structuredClone(informe);
  }
}

function aEventoFalla(informe: InformeFalla): EventoFallaCritica {
  return {
    tipo: 'falla-critica',
    informeId: informe.id,
    maquinaId: informe.maquinaId,
    codigoAGC: informe.codigoAGC,
    nombreMaquina: informe.nombreMaquina,
    direccion: informe.edificio.direccion,
    consorcio: informe.edificio.consorcio,
    eca: informe.eca,
    inspector: informe.inspector,
    fallas: [...informe.fallasCriticas],
    fallasDetalle: informe.fallasCriticasDetalle.map((d) => ({ ...d })),
    registradoEn: informe.registradoEn,
    enlaceInforme: informe.enlaceInforme,
    firmanteUsername: informe.firmanteUsername,
    abiertaPor: informe.abiertaPor,
    abiertaEn: informe.abiertaEn,
  };
}

function esTextualDataImage(v: string): boolean {
  return /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(v) && v.length <= 750_000;
}

function esUrlFotoValida(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (esTextualDataImage(v)) return true;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function esTextoNoVacio(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Valida el cuerpo del informe y devuelve 400 nombrando cada campo que está mal. */
export function validarInforme(body: unknown, inspectorSesion?: string): InformeFallaInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('El cuerpo del informe tiene que ser un objeto JSON');
  }
  const b = body as Record<string, unknown>;
  const errores: string[] = [];

  if (!esTextoNoVacio(b.maquinaId)) errores.push('maquinaId es obligatorio');
  if (inspectorSesion === undefined && !esTextoNoVacio(b.inspector)) errores.push('inspector es obligatorio');

  const tieneListaFallas = b.fallasCriticas !== undefined;
  if (tieneListaFallas && (!Array.isArray(b.fallasCriticas) || !b.fallasCriticas.every(esTextoNoVacio))) {
    errores.push('fallasCriticas tiene que ser una lista de códigos válidos');
  }

  const cables = b.cablesDesgastados ?? (tieneListaFallas ? false : undefined);
  const limitador = b.limitadorAnulado ?? (tieneListaFallas ? false : undefined);

  if (typeof cables !== 'boolean') {
    errores.push('cablesDesgastados tiene que ser true o false');
  }
  if (typeof limitador !== 'boolean') {
    errores.push('limitadorAnulado tiene que ser true o false');
  }
  if (b.observaciones !== undefined) {
    if (typeof b.observaciones !== 'string') {
      errores.push('observaciones tiene que ser texto');
    } else if (b.observaciones.length > MAX_OBSERVACIONES) {
      errores.push(`observaciones admite hasta ${MAX_OBSERVACIONES} caracteres`);
    }
  }
  if (b.fotografias !== undefined) {
    if (!Array.isArray(b.fotografias) || !b.fotografias.every(esUrlFotoValida)) {
      errores.push('fotografias tiene que ser una lista de URLs http(s)');
    } else if (b.fotografias.length > MAX_FOTOGRAFIAS) {
      errores.push(`fotografias admite hasta ${MAX_FOTOGRAFIAS} URLs`);
    }
  }

  if (errores.length > 0) {
    throw new BadRequestException(errores);
  }

  return {
    ...(esTextoNoVacio(b.clientReportId) ? { clientReportId: b.clientReportId.trim() } : {}),
    maquinaId: (b.maquinaId as string).trim(),
    inspector: inspectorSesion !== undefined ? inspectorSesion : (b.inspector as string).trim(),
    cablesDesgastados: cables as boolean,
    limitadorAnulado: limitador as boolean,
    ...(tieneListaFallas
      ? { fallasCriticas: (b.fallasCriticas as string[]).map((c) => c.trim()) }
      : {}),
    observaciones: (b.observaciones as string | undefined)?.trim(),
    fotografias: b.fotografias as string[] | undefined,
  };
}
