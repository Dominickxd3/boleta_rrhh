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

export interface CorreoBoletaFirmadaArgs {
  destinatario: string;
  nombreTrabajador: string;
  periodo: string;
  pdfBuffer: Uint8Array;
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
    const from = this.config.get<string>('SMTP_FROM');
    if (from) return from;
    const user = this.config.get<string>('SMTP_USER');
    return user ? `Recursos Humanos <${user}>` : 'Boletas RRHH <noreply@empresa.com>';
  }

  configurado(): boolean {
    return this.transporter !== null;
  }

  private mesLabel(periodo: string): string {
    const anio = periodo.slice(0, 4);
    const mesNum = Number(periodo.slice(4, 6));
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return `${meses[mesNum - 1] ?? ''} ${anio}`.trim();
  }

  async enviarBoleta(args: CorreoBoletaArgs): Promise<boolean> {
    if (!this.transporter) {
      throw new Error(
        'Correo no configurado: define SMTP_HOST, SMTP_USER y SMTP_PASS en backend/.env',
      );
    }
    const mesLabel = this.mesLabel(args.periodo);
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:#1e3a8a;color:#fff;padding:20px 24px">
          <h2 style="margin:0">Boleta de Pago — ${mesLabel}</h2>
        </div>
        <div style="padding:24px">
          <p>Hola ${args.nombreTrabajador},</p>
          <p>Te informamos que ya se encuentra disponible tu boleta de pago correspondiente al periodo de ${mesLabel}.</p>
          <p>Agradecemos tu gestión ingresando al siguiente botón para su revisión y firma digital:</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${args.urlFirma}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">Firmar mi boleta</a>
          </p>
          <p style="font-size:13px;color:#6b7280">Aviso de seguridad: Este enlace es personal e intransferible. Expira automáticamente en 72 horas por protección de tus datos.</p>
        </div>
      </div>`;

    await this.transporter.sendMail({
      from: this.desde(),
      to: args.destinatario,
      subject: `Boleta de Pago — ${mesLabel}`,
      html,
    });
    return true;
  }

  async enviarBoletaFirmada(args: CorreoBoletaFirmadaArgs): Promise<boolean> {
    if (!this.transporter) {
      throw new Error(
        'Correo no configurado: define SMTP_HOST, SMTP_USER y SMTP_PASS en backend/.env',
      );
    }
    const mesLabel = this.mesLabel(args.periodo);
    const nombreArchivo = `Boleta_${mesLabel.replace(' ', '_')}_${args.nombreTrabajador
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')}.pdf`;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:#1e3a8a;color:#fff;padding:20px 24px">
          <h2 style="margin:0;font-size:18px">Grupo Pecuario</h2>
          <p style="margin:2px 0 0;font-size:13px;color:#dbeafe">Recursos Humanos</p>
        </div>
        <div style="padding:24px">
          <p>Hola ${args.nombreTrabajador},</p>
          <p>Confirmamos que hemos recibido la firma digital de tu boleta de pago correspondiente al periodo de ${mesLabel}.</p>
          <p style="font-weight:bold;margin:20px 0 8px">Resumen de la transacción:</p>
          <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:16px">
            <p style="margin:4px 0"><b>Documento:</b> Boleta de Pago - ${mesLabel}</p>
            <p style="margin:4px 0"><b>Estado:</b> Firmado digitalmente</p>
            <p style="margin:4px 0"><b>Archivo adjunto:</b> ${nombreArchivo}</p>
          </div>
          <p>Hemos adjuntado a este correo una copia completa en formato PDF para que puedas descargarla y guardarla en tus archivos personales.</p>
        </div>
      </div>`;

    await this.transporter.sendMail({
      from: this.desde(),
      to: args.destinatario,
      subject: `Confirmación de firma — Boleta de Pago ${mesLabel}`,
      html,
      attachments: [
        {
          filename: nombreArchivo,
          content: Buffer.from(args.pdfBuffer),
          contentType: 'application/pdf',
        },
      ],
    });
    return true;
  }
}
