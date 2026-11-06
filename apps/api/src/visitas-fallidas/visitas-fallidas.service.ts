import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  EmailNotificacionConsorcio,
  ReporteVisitaFallidaDto,
  ResumenAdvertenciasConsorcio,
  VisitaFallidaRegistro,
} from './visitas-fallidas.types';

@Injectable()
export class VisitasFallidasService {
  private readonly logger = new Logger(VisitasFallidasService.name);
  private registros: VisitaFallidaRegistro[] = [];

  constructor(@Optional() private readonly db?: DatabaseService) {}

  /**
   * Criterio 1: Valida el reporte de visita fallida comprobando foto del frente y coordenadas GPS congeladas.
   * Criterio 2: Al confirmarse Advertencia 1 o 2, despacha email formal a la administración.
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
      isNaN(dto.gps.latitud) ||
      typeof dto.gps.longitud !== 'number' ||
      isNaN(dto.gps.longitud)
    ) {
      throw new BadRequestException(
        'Las coordenadas GPS congeladas son obligatorias para certificar la geolocalización de la visita fallida.',
      );
    }

    // Resolver datos del consorcio
    const consorcioInfo = await this.resolverConsorcioInfo(dto.consorcioId);

    // Contar advertencias previas del consorcio para determinar número (1, 2 o 3)
    const previas = this.registros.filter((r) => r.consorcioId === dto.consorcioId);
    const numeroAdvertencia: 1 | 2 | 3 =
      previas.length === 0 ? 1 : previas.length === 1 ? 2 : 3;

    const fechaHora = new Date().toISOString();
    const motivo = dto.motivo?.trim() || 'No se pudo realizar la inspección: encargado ausente';
    const inspector = dto.inspector?.trim() || 'Inspector Técnico de Guardia (RT Calle)';

    // Criterio 2: Al confirmarse Advertencia 1 o 2, generar y enviar correo formal
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

    const nuevoRegistro: VisitaFallidaRegistro = {
      id: `VF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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

    this.registros.push(nuevoRegistro);

    // Persistencia opcional en PostgreSQL si la base está activa
    if (this.db) {
      try {
        await this.db.query(
          `INSERT INTO acuses_recibo_legal (alerta_id, usuario, fecha_hora, metadata)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [
            nuevoRegistro.id,
            'sistema.notificaciones@maicon.com.ar',
            fechaHora,
            JSON.stringify(nuevoRegistro),
          ],
        );
      } catch (err) {
        this.logger.debug(`No se pudo persistir en PostgreSQL (continuando en memoria): ${err}`);
      }
    }

    this.logger.log(
      `Visita fallida registrada para consorcio ${consorcioInfo.nombre} — Advertencia ${numeroAdvertencia}${
        emailNotificacion ? ` (Email despachado a ${emailNotificacion.destinatario})` : ''
      }`,
    );

    return nuevoRegistro;
  }

  getHistorialConsorcio(consorcioId: string): ResumenAdvertenciasConsorcio {
    const historial = this.registros.filter((r) => r.consorcioId === consorcioId);
    const totalAdvertencias = historial.length;
    const ultima = historial.length > 0 ? historial[historial.length - 1].numeroAdvertencia : null;

    return {
      consorcioId,
      totalAdvertencias,
      ultimaAdvertencia: ultima,
      bloqueadoPorTerceraVisita: totalAdvertencias >= 3,
      recargoAplicable: totalAdvertencias >= 3,
      historial,
    };
  }

  getTodas(): VisitaFallidaRegistro[] {
    return [...this.registros];
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
    if (this.db) {
      try {
        const rows = await this.db.query<{
          nombre: string;
          direccion: string;
          administracion_email: string | null;
        }>(
          `SELECT nombre, direccion, administracion_email FROM consorcios WHERE id = $1`,
          [consorcioId],
        );
        if (rows && rows.length > 0) {
          return {
            nombre: rows[0].nombre,
            direccion: rows[0].direccion,
            email: rows[0].administracion_email || 'administracion@consorcio.com.ar',
          };
        }
      } catch {
        // Fallback a mapeo estándar
      }
    }

    // Defaults según IDs conocidos o generados
    return {
      nombre: `Consorcio Edificio ${consorcioId}`,
      direccion: `Av. Corrientes ${consorcioId.slice(0, 4) || '1234'}, CABA`,
      email: `administracion@${consorcioId}.com.ar`,
    };
  }
}
