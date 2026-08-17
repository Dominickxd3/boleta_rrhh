import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface CorreoBoletaArgs {
  destinatario: string;
  nombreTrabajador: string;
  periodo: string;
  urlFirma: string;
}

@Injectable()
export class MailService {
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    if (host && user) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
  }

  private desde(): string {
    return this.config.get<string>(
      'SMTP_FROM',
      'Boletas RRHH <noreply@empresa.com>',
    );
  }

  configurado(): boolean {
    return this.transporter !== null;
  }

  async enviarBoleta(args: CorreoBoletaArgs): Promise<boolean> {
    if (!this.transporter) {
      throw new Error(
        'Correo no configurado: define SMTP_HOST, SMTP_USER y SMTP_PASS en backend/.env',
      );
    }
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:#1e3a8a;color:#fff;padding:20px 24px">
          <h2 style="margin:0">Boleta de pago</h2>
        </div>
        <div style="padding:24px">
          <p>Hola <b>${args.nombreTrabajador}</b>,</p>
          <p>Ya está disponible tu boleta de pago del periodo <b>${args.periodo}</b>.</p>
          <p>Para revisarla y firmarla, haz clic en el siguiente botón:</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${args.urlFirma}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">Firmar mi boleta</a>
          </p>
          <p style="font-size:13px;color:#6b7280">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${args.urlFirma}" style="color:#2563eb">${args.urlFirma}</a></p>
          <p style="font-size:13px;color:#6b7280">Este enlace es personal e intransferible.</p>
        </div>
      </div>`;

    await this.transporter.sendMail({
      from: this.desde(),
      to: args.destinatario,
      subject: `Boleta de pago ${args.periodo} — ${args.nombreTrabajador}`,
      html,
    });
    return true;
  }
}