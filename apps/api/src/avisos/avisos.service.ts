import { ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { Subscription } from 'rxjs';
import { Mailer } from '../auth/mailer';
import { APP_CONFIG, AppConfig } from '../config';
import { VistaInformeAviso } from './informe-publico';
import { EventoFallaCritica } from '../fallas-criticas/fallas-criticas.types';
import { FallasCriticasService } from '../fallas-criticas/fallas-criticas.service';
import { MaquinaAsignada } from '../firmante/firmante.types';
import { WhatsAppConnectorService } from '../whatsapp/whatsapp-connector.service';
import { AvisoFalla, CanalAviso, DESTINOS_PROVISORIOS, DestinosAviso, EnvioAviso, VENCIMIENTO_ENLACE_MS } from './avisos.types';

const TOKEN_VALIDO = /^[A-Za-z0-9_-]{43}$/;

interface Interno {
  /** El informe que muestra el enlace: se toma al crear el aviso. */
  vista: VistaInformeAviso;
  token?: string;
  /** Cuándo se emitió el enlace (se renueva en cada intento de envío). */
  emitidoEn?: number;
}

/**
 * Avisos de falla crítica con revisión previa (HU-11 RF-05). Al registrarse una falla crítica el aviso queda «Pendiente de revisión»
 * y no sale ningún WhatsApp ni correo; la Secretaría lo aprueba y recién entonces se envía a la ECA y al Firmante del edificio.
 *
 * Los avisos quedan en memoria, igual que los informes de fallas críticas de los que salen.
 */
@Injectable()
export class AvisosService implements OnModuleInit, OnModuleDestroy {
  private readonly avisos = new Map<string, AvisoFalla>();
  private readonly internos = new Map<string, Interno>();
  private readonly porToken = new Map<string, string>();
  private readonly appUrl: string;
  private suscripcion?: Subscription;

  constructor(
    private readonly fallas: FallasCriticasService,
    private readonly whatsapp: WhatsAppConnectorService,
    private readonly mailer: Mailer,
    @Optional() @Inject(APP_CONFIG) config?: AppConfig,
  ) {
    this.appUrl = config?.appUrl ?? 'http://localhost:8050';
  }

  onModuleInit(): void {
    this.suscripcion = this.fallas.eventos$().subscribe((evento) => this.crearDesdeEvento(evento));
  }

  onModuleDestroy(): void {
    this.suscripcion?.unsubscribe();
  }

  /** Crea el aviso pendiente de una falla crítica recién registrada (una sola vez por informe). */
  crearDesdeEvento(e: EventoFallaCritica): AvisoFalla {
    const existente = this.avisos.get(e.informeId);
    if (existente) return existente;
    const aviso: AvisoFalla = {
      id: `AV-${randomUUID()}`,
      alertaId: e.informeId,
      maquinaId: e.maquinaId,
      consorcio: e.consorcio,
      direccion: e.direccion,
      equipo: `${e.codigoAGC} - ${e.nombreMaquina}`,
      eca: e.eca,
      firmanteUsername: e.firmanteUsername,
      detalle: e.fallasDetalle.map((f) => f.nombre).join(', '),
      enlaceInforme: e.enlaceInforme,
      estado: 'Pendiente de revisión',
      creadoEn: new Date().toISOString(),
      aprobadoPor: null,
      aprobadoEn: null,
      enlaceVenceEn: null,
      enlace: null,
      envios: [],
    };
    this.avisos.set(e.informeId, aviso);
    const informe = this.fallas.obtenerInforme(e.informeId);
    this.internos.set(e.informeId, {
      vista: {
        titulo: 'Falla crítica reportada',
        equipo: aviso.equipo,
        direccion: e.direccion,
        consorcio: e.consorcio,
        eca: e.eca,
        fecha: e.registradoEn,
        detalle: e.fallasDetalle.map((f) => f.nombre),
        observaciones: informe.observaciones,
        fotografias: informe.fotografias,
      },
    });
    return aviso;
  }

  /** El aviso de la alerta crítica de una máquina; si todavía no tiene, se crea pendiente (nunca sale solo). */
  paraAlertaDeMaquina(maquina: MaquinaAsignada): AvisoFalla {
    const alerta = maquina.alertaCritica;
    if (!alerta) throw new NotFoundException('La máquina no tiene una alerta crítica activa');
    const existente = this.avisos.get(alerta.id);
    if (existente) return existente;
    const aviso: AvisoFalla = {
      id: `AV-${randomUUID()}`,
      alertaId: alerta.id,
      maquinaId: maquina.id,
      consorcio: maquina.edificio.consorcio,
      direccion: maquina.edificio.direccion,
      equipo: `${maquina.codigoAGC} - ${maquina.nombre}`,
      eca: maquina.eca,
      firmanteUsername: maquina.firmanteUsername ?? '',
      detalle: alerta.motivo,
      enlaceInforme: `/api/eca/remito/${alerta.id}/informe`,
      estado: 'Pendiente de revisión',
      creadoEn: new Date().toISOString(),
      aprobadoPor: null,
      aprobadoEn: null,
      enlaceVenceEn: null,
      enlace: null,
      envios: [],
    };
    this.avisos.set(alerta.id, aviso);
    this.internos.set(alerta.id, {
      vista: {
        titulo: alerta.titulo,
        equipo: aviso.equipo,
        direccion: maquina.edificio.direccion,
        consorcio: maquina.edificio.consorcio,
        eca: maquina.eca,
        fecha: alerta.fechaDeteccion,
        detalle: [alerta.motivo],
        observaciones: '',
        fotografias: alerta.fotografiaCabinaTrabada ? [alerta.fotografiaCabinaTrabada] : [],
      },
    });
    return aviso;
  }

  /**
   * Resuelve el token del enlace (HU-11 RF-06). Un token que no tiene el formato, no existe o fue alterado es «inexistente» y no revela
   * nada; uno emitido hace más de 7 días es «vencido».
   */
  informePorToken(token: string): { resultado: 'ok'; vista: VistaInformeAviso } | { resultado: 'vencido' } | { resultado: 'inexistente' } {
    if (typeof token !== 'string' || !TOKEN_VALIDO.test(token)) return { resultado: 'inexistente' };
    const alertaId = this.porToken.get(token);
    const interno = alertaId ? this.internos.get(alertaId) : undefined;
    if (!interno || interno.token !== token || interno.emitidoEn === undefined) return { resultado: 'inexistente' };
    if (Date.now() - interno.emitidoEn > VENCIMIENTO_ENLACE_MS) return { resultado: 'vencido' };
    return { resultado: 'ok', vista: structuredClone(interno.vista) };
  }

  /** El estado del aviso de una alerta o informe, o null si no tiene aviso todavía. */
  estadoDe(alertaId: string): AvisoFalla['estado'] | null {
    return this.avisos.get(alertaId)?.estado ?? null;
  }

  listar(estado?: string): AvisoFalla[] {
    const todos = [...this.avisos.values()].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
    return structuredClone(estado ? todos.filter((a) => a.estado === estado) : todos);
  }

  obtener(id: string): AvisoFalla {
    return structuredClone(this.buscar(id));
  }

  /**
   * La Secretaría (o el Administrador) aprueba el aviso: se registra quién y cuándo, y se envían el WhatsApp a la ECA y al Firmante
   * y el correo con el enlace al informe a la ECA. Si todos los WhatsApp salen, el aviso pasa a «Enviado»; si alguno falla queda
   * «Falló el envío» (la aprobación se conserva) y se puede reintentar: sólo se vuelve a mandar lo que no salió.
   */
  async aprobar(id: string, quien: { usuario: string }, destinos: DestinosAviso = {}): Promise<AvisoFalla> {
    const aviso = this.buscar(id);
    if (aviso.estado === 'Enviado') {
      throw new ConflictException('Este aviso ya fue aprobado y enviado.');
    }
    aviso.aprobadoPor ??= quien.usuario;
    aviso.aprobadoEn ??= new Date().toISOString();

    // HU-11 RF-06: el enlace del mensaje lleva un token aleatorio de 256 bits y vence a los 7 días de emitido (se renueva al reintentar).
    const interno = this.internos.get(aviso.alertaId)!;
    interno.token ??= randomBytes(32).toString('base64url');
    this.porToken.set(interno.token, aviso.alertaId);
    interno.emitidoEn = Date.now();
    aviso.enlaceVenceEn = new Date(interno.emitidoEn + VENCIMIENTO_ENLACE_MS).toISOString();
    const enlace = `${this.appUrl}/api/informe-aviso/${interno.token}`;
    aviso.enlace = enlace;
    const yaSalio = (canal: CanalAviso) => aviso.envios.some((e) => e.canal === canal && e.ok);
    const contexto = { origen: 'manual' as const, alertaId: aviso.alertaId, maquinaId: aviso.maquinaId, enlaceDirecto: `${this.appUrl}/api/informe-aviso/[token]`, aprobadoPor: aviso.aprobadoPor, aprobadoEn: aviso.aprobadoEn };
    const mensaje = (telefono: string, nombre: string) => ({
      telefonoDestino: telefono,
      nombreEca: nombre,
      consorcio: `${aviso.direccion} (${aviso.consorcio})`,
      equipo: aviso.equipo,
      estado: 'Falla crítica',
      detalle: aviso.detalle,
      remitoUrl: enlace,
      fechaDeteccion: aviso.creadoEn,
    });

    const whatsappA: [CanalAviso, string, string][] = [
      ['whatsapp_eca', destinos.telefonoEca ?? DESTINOS_PROVISORIOS.telefonoEca, aviso.eca],
      ['whatsapp_firmante', destinos.telefonoFirmante ?? DESTINOS_PROVISORIOS.telefonoFirmante, aviso.firmanteUsername || 'Firmante'],
    ];
    for (const [canal, telefono, nombre] of whatsappA) {
      if (yaSalio(canal)) continue;
      const r = await this.whatsapp.enviarMensajeAlerta(mensaje(telefono, nombre), 3, 50, contexto);
      aviso.envios.push({ canal, destino: r.telefonoDestino, ok: r.ok, estado: r.estadoEntrega, ...(r.error ? { motivo: r.error } : {}), fecha: r.timestampEnvio });
    }

    if (!yaSalio('email_eca')) aviso.envios.push(await this.enviarCorreo(aviso, destinos.emailEca ?? DESTINOS_PROVISORIOS.emailEca, enlace));

    const whatsappOk = whatsappA.every(([canal]) => yaSalio(canal));
    aviso.estado = whatsappOk ? 'Enviado' : 'Falló el envío';
    return structuredClone(aviso);
  }

  private async enviarCorreo(aviso: AvisoFalla, destino: string, enlace: string): Promise<EnvioAviso> {
    const fecha = new Date().toISOString();
    if (!this.mailer.habilitado) {
      // Sin SMTP el Mailer sólo deja el aviso en el log: no se marca como enviado.
      await this.mailer.enviar(destino, `Falla crítica en ${aviso.direccion}`, enlace);
      return { canal: 'email_eca', destino, ok: false, estado: 'no_configurado', motivo: 'El correo no está configurado (SMTP).', fecha };
    }
    try {
      await this.mailer.enviar(
        destino,
        `Falla crítica en ${aviso.direccion}`,
        `Se registró una falla crítica en ${aviso.equipo} (${aviso.direccion}, ${aviso.consorcio}): ${aviso.detalle}.\n\nInforme técnico: ${enlace}\n`,
      );
      return { canal: 'email_eca', destino, ok: true, estado: 'enviado', fecha };
    } catch (err) {
      return { canal: 'email_eca', destino, ok: false, estado: 'fallido', motivo: err instanceof Error ? err.message : 'No se pudo enviar el correo', fecha };
    }
  }

  private buscar(id: string): AvisoFalla {
    const aviso = [...this.avisos.values()].find((a) => a.id === id || a.alertaId === id);
    if (!aviso) throw new NotFoundException('Aviso no encontrado');
    return aviso;
  }
}
