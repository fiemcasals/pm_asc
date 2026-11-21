import { ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { Subscription } from 'rxjs';
import { Mailer } from '../auth/mailer';
import { APP_CONFIG, AppConfig } from '../config';
import { ConsorciosRepository } from '../consorcios/consorcios.repository';
import { VistaInformeAviso } from './informe-publico';
import { PdfLegalFallaService, PdfLegalGenerado } from './pdf-legal-falla.service';
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

  private readonly pdfService: PdfLegalFallaService;

  constructor(
    private readonly fallas: FallasCriticasService,
    private readonly whatsapp: WhatsAppConnectorService,
    private readonly mailer: Mailer,
    @Optional() @Inject(APP_CONFIG) config?: AppConfig,
    @Optional() pdfLegal?: PdfLegalFallaService,
    @Optional() private readonly consorcios?: ConsorciosRepository,
  ) {
    this.appUrl = config?.appUrl ?? 'http://localhost:8050';
    this.pdfService = pdfLegal ?? new PdfLegalFallaService();
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
      constanciaEmailLegal: null,
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
      constanciaEmailLegal: null,
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
    const aviso = this.avisos.get(alertaId);
    if (aviso) this.sincronizarConProveedor(aviso);
    return aviso?.estado ?? null;
  }

  listar(estado?: string): AvisoFalla[] {
    const todos = [...this.avisos.values()].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
    for (const aviso of todos) this.sincronizarConProveedor(aviso);
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

    const telefonoEca = await this.resolverTelefonoEca(aviso, destinos.telefonoEca);
    const whatsappA: [CanalAviso, string, string][] = [
      ['whatsapp_eca', telefonoEca, aviso.eca],
      ['whatsapp_firmante', destinos.telefonoFirmante ?? DESTINOS_PROVISORIOS.telefonoFirmante, aviso.firmanteUsername || 'Firmante'],
    ];
    for (const [canal, telefono, nombre] of whatsappA) {
      if (yaSalio(canal)) continue;
      const r = await this.whatsapp.enviarMensajeAlerta(mensaje(telefono, nombre), 3, 50, contexto);
      aviso.envios.push({ canal, destino: r.telefonoDestino, ok: r.ok, estado: r.estadoEntrega, ...(r.error ? { motivo: r.error } : {}), ...(r.idMensaje ? { idMensaje: r.idMensaje } : {}), fecha: r.timestampEnvio });
    }

    if (!yaSalio('email_eca')) {
      const emailDestino = await this.resolverEmailEca(aviso, destinos.emailEca);
      aviso.envios.push(await this.enviarCorreoConPdfLegal(aviso, emailDestino, enlace));
    }

    const whatsappOk = whatsappA.every(([canal]) => yaSalio(canal));
    const emailFallo = aviso.constanciaEmailLegal?.estado === 'Envío fallido';
    aviso.estado = whatsappOk && !emailFallo ? 'Enviado' : 'Falló el envío';
    return structuredClone(aviso);
  }

  /** Genera el PDF formal MAICON S.R.L. para el aviso (con membrete, datos del edificio/máquina, fallas y fotos adjuntas). */
  async generarPdfLegal(id: string): Promise<PdfLegalGenerado> {
    const aviso = this.buscar(id);
    const interno = this.internos.get(aviso.alertaId)!;
    return this.pdfService.generarPdf({
      avisoId: aviso.id,
      alertaId: aviso.alertaId,
      consorcio: interno.vista.consorcio,
      direccion: interno.vista.direccion,
      equipo: interno.vista.equipo,
      eca: interno.vista.eca,
      fechaDeteccion: interno.vista.fecha,
      fallas: interno.vista.detalle,
      observaciones: interno.vista.observaciones,
      fotografias: interno.vista.fotografias,
      aprobadoPor: aviso.aprobadoPor,
      aprobadoEn: aviso.aprobadoEn,
      enlaceInforme: aviso.enlace,
    });
  }

  /**
   * Reintenta el envío del email legal con PDF adjunto a la ECA para un aviso ya aprobado cuyo correo falló
   * (HU-06 RF-02, criterio 4). No permite enviar antes de la aprobación de la Secretaría.
   */
  async reintentarEmail(id: string, destinos: DestinosAviso = {}): Promise<AvisoFalla> {
    const aviso = this.buscar(id);
    if (!aviso.aprobadoPor || !aviso.aprobadoEn) {
      throw new ConflictException(
        'El aviso todavía está pendiente de revisión: la Secretaría debe aprobarlo antes de enviar el correo legal a la ECA.',
      );
    }
    if (aviso.envios.some((e) => e.canal === 'email_eca' && e.ok)) {
      throw new ConflictException('El correo con PDF legal a la ECA ya fue enviado exitosamente para este aviso.');
    }

    const enlace = aviso.enlace ?? `${this.appUrl}${aviso.enlaceInforme}`;
    const emailDestino = await this.resolverEmailEca(aviso, destinos.emailEca);
    aviso.envios.push(await this.enviarCorreoConPdfLegal(aviso, emailDestino, enlace));

    const whatsappOk = (['whatsapp_eca', 'whatsapp_firmante'] as CanalAviso[]).every((canal) =>
      aviso.envios.some((e) => e.canal === canal && e.ok),
    );
    const emailFallo = aviso.constanciaEmailLegal?.estado === 'Envío fallido';
    aviso.estado = whatsappOk && !emailFallo ? 'Enviado' : 'Falló el envío';
    return structuredClone(aviso);
  }

  private async resolverTelefonoEca(aviso: AvisoFalla, telefonoExplicito?: string): Promise<string> {
    if (telefonoExplicito !== undefined) return telefonoExplicito.trim();
    if (this.consorcios) {
      try {
        const [edificios, roles] = await Promise.all([
          this.consorcios.listar(),
          this.consorcios.listarRoles(),
        ]);
        const dirNorm = aviso.direccion.trim().toLowerCase();
        const consorcioMatch = edificios.find((c) => {
          const cDir = c.direccion.trim().toLowerCase();
          return cDir === dirNorm || dirNorm.startsWith(cDir) || cDir.startsWith(dirNorm);
        });
        if (consorcioMatch) {
          const rolEdificio = roles.find((r) => r.consorcioId === consorcioMatch.id);
          // Si el edificio existe en la base, se respeta estrictamente su terna (sin número fijo hardcodeado).
          return rolEdificio?.eca?.telefono?.trim() ?? '';
        }
        const ecaNorm = aviso.eca.trim().toLowerCase();
        const porEca = roles.find((r) => r.eca?.nombre.trim().toLowerCase() === ecaNorm);
        if (porEca) return porEca.eca?.telefono?.trim() ?? '';
      } catch {
        // Fallback abajo si la consulta no está disponible.
      }
    }
    return DESTINOS_PROVISORIOS.telefonoEca;
  }

  private async resolverEmailEca(aviso: AvisoFalla, emailExplicito?: string): Promise<string> {
    if (emailExplicito && emailExplicito.trim()) return emailExplicito.trim();
    if (this.consorcios) {
      try {
        const [edificios, roles] = await Promise.all([
          this.consorcios.listar(),
          this.consorcios.listarRoles(),
        ]);
        const dirNorm = aviso.direccion.trim().toLowerCase();
        const consorcioMatch = edificios.find((c) => {
          const cDir = c.direccion.trim().toLowerCase();
          return cDir === dirNorm || dirNorm.startsWith(cDir) || cDir.startsWith(dirNorm);
        });
        if (consorcioMatch) {
          const rolEdificio = roles.find((r) => r.consorcioId === consorcioMatch.id);
          if (rolEdificio?.eca?.email?.trim()) return rolEdificio.eca.email.trim();
        }
        const ecaNorm = aviso.eca.trim().toLowerCase();
        const porEca = roles.find((r) => r.eca?.nombre.trim().toLowerCase() === ecaNorm && r.eca.email?.trim());
        if (porEca?.eca?.email?.trim()) return porEca.eca.email.trim();
      } catch {
        // Si la consulta de consorcios falla, se usa el destino provisorio sin frenar el flujo.
      }
    }
    return DESTINOS_PROVISORIOS.emailEca;
  }

  private async enviarCorreoConPdfLegal(aviso: AvisoFalla, destino: string, enlace: string): Promise<EnvioAviso> {
    const fecha = new Date().toISOString();
    const intentosPrevios = aviso.constanciaEmailLegal?.intentos ?? 0;
    const pdf = await this.generarPdfLegal(aviso.id);
    const remitente = (this.mailer as { remitente?: string }).remitente ?? 'notificaciones@maicon.com.ar';
    const asunto = `Falla crítica en ${aviso.direccion} — Notificación Formal MAICON S.R.L.`;
    const cuerpo = [
      `Estimada ECA ${aviso.eca},`,
      '',
      `Se notifica formalmente una falla crítica detectada en ${aviso.equipo} (${aviso.direccion}, ${aviso.consorcio}):`,
      `${aviso.detalle}.`,
      '',
      'Se adjunta el PDF legal con membrete de MAICON S.R.L. para el deslinde de responsabilidad.',
      `Informe técnico en línea: ${enlace}`,
      '',
      `Aprobado por Secretaría: ${aviso.aprobadoPor ?? 'Secretaría'} (${aviso.aprobadoEn ?? fecha})`,
    ].join('\n');

    if (!this.mailer.habilitado) {
      await this.mailer.enviar(destino, asunto, cuerpo, [
        { filename: pdf.filename, content: pdf.buffer, contentType: pdf.mimeType },
      ]);
      aviso.constanciaEmailLegal = {
        estado: 'No configurado',
        destino,
        remitente,
        fecha,
        archivoPdf: pdf.filename,
        pdfSha256: pdf.sha256,
        tamanoBytes: pdf.buffer.length,
        intentos: intentosPrevios + 1,
        motivo: 'El correo no está configurado (SMTP).',
      };
      return {
        canal: 'email_eca',
        destino,
        ok: false,
        estado: 'no_configurado',
        motivo: 'El correo no está configurado (SMTP).',
        fecha,
        archivoPdf: pdf.filename,
        pdfSha256: pdf.sha256,
      };
    }

    try {
      await this.mailer.enviar(destino, asunto, cuerpo, [
        { filename: pdf.filename, content: pdf.buffer, contentType: pdf.mimeType },
      ]);
      aviso.constanciaEmailLegal = {
        estado: 'Enviado',
        destino,
        remitente,
        fecha,
        archivoPdf: pdf.filename,
        pdfSha256: pdf.sha256,
        tamanoBytes: pdf.buffer.length,
        intentos: intentosPrevios + 1,
      };
      return {
        canal: 'email_eca',
        destino,
        ok: true,
        estado: 'enviado',
        fecha,
        archivoPdf: pdf.filename,
        pdfSha256: pdf.sha256,
      };
    } catch (err) {
      const motivo = err instanceof Error ? err.message : 'No se pudo enviar el correo';
      aviso.constanciaEmailLegal = {
        estado: 'Envío fallido',
        destino,
        remitente,
        fecha,
        archivoPdf: pdf.filename,
        pdfSha256: pdf.sha256,
        tamanoBytes: pdf.buffer.length,
        intentos: intentosPrevios + 1,
        motivo,
      };
      return {
        canal: 'email_eca',
        destino,
        ok: false,
        estado: 'Envío fallido',
        motivo,
        fecha,
        archivoPdf: pdf.filename,
        pdfSha256: pdf.sha256,
      };
    }
  }

  private buscar(id: string): AvisoFalla {
    const aviso = [...this.avisos.values()].find((a) => a.id === id || a.alertaId === id);
    if (!aviso) throw new NotFoundException('Aviso no encontrado');
    this.sincronizarConProveedor(aviso);
    return aviso;
  }

  /**
   * HU-11 RF-14: un WhatsApp que salió bien («aceptado» por el proveedor) puede fallar después, cuando el proveedor avisa que no lo
   * entregó (HU-11 RF-09). Ese envío pasa a fallido y, si el aviso figuraba «Enviado», vuelve a «Falló el envío»: la Secretaría lo ve en
   * la bandeja sin abrir cada aviso y puede reintentar, que vuelve a mandar sólo lo que no salió. Un envío entregado o leído no cambia.
   */
  private sincronizarConProveedor(aviso: AvisoFalla): void {
    let fallo = false;
    for (const envio of aviso.envios) {
      if (!envio.ok || !envio.idMensaje || envio.canal === 'email_eca') continue;
      const registro = this.whatsapp.registroDeMensaje(envio.idMensaje);
      if (registro?.estadoEntrega !== 'fallido') continue;
      envio.ok = false;
      envio.estado = 'fallido';
      envio.motivo = registro.motivo ?? 'El proveedor informó que el mensaje no se entregó';
      envio.falloInformadoEn = registro.estadoActualizadoEn ?? new Date().toISOString();
      fallo = true;
    }
    if (fallo && aviso.estado === 'Enviado') aviso.estado = 'Falló el envío';
  }
}
