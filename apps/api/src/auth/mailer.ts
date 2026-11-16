import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { APP_CONFIG, AppConfig } from '../config';

/**
 * Correo saliente por SMTP. Sin SMTP_* configurado no manda nada: deja el aviso en el log
 * (en desarrollo, con el enlace, para poder probar el recupero sin casilla de correo).
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);
  private transporte: Transporter | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get habilitado(): boolean {
    return this.config.smtp !== null;
  }

  async enviar(a: string, asunto: string, texto: string): Promise<void> {
    const smtp = this.config.smtp;
    if (!smtp) {
      this.logger.warn(`SMTP no configurado: no se envió "${asunto}" a ${a}.`);
      if (this.config.nodeEnv !== 'production') this.logger.debug(texto);
      return;
    }
    this.transporte ??= createTransport({
      host: smtp.host,
      port: smtp.puerto,
      // 465 es TLS desde el saludo; 587 arranca en claro y sube a TLS con STARTTLS.
      secure: smtp.puerto === 465,
      auth: { user: smtp.usuario, pass: smtp.clave },
    });
    await this.transporte.sendMail({ from: smtp.desde, to: a, subject: asunto, text: texto });
    this.logger.log(`Correo "${asunto}" enviado a ${a}.`);
  }
}
