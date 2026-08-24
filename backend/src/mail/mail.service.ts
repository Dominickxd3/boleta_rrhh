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

export type EstadoCorreo =
  | 'ok'
  | 'bloqueado'
  | 'indisponible'
  | 'no_configurado';

export interface CorreoEstadoInfo {
  configurado: boolean;
  limiteDiario: number;
  usadosHoy: number;
  restantesHoy: number;
  estado: EstadoCorreo;
}

@Injectable()
export class MailService {
  private transporter: Transporter | null = null;
  private usadosHoy = 0;
  private diaContador = '';
  private ultimoEstado: EstadoCorreo = 'no_configurado';

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
        pool: true,
        maxConnections: 1,
        maxMessages: 200,
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 60000,
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

  // ===== Contador diario (límite de Gmail 500/día, tope configurable) =====
  private hoy(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private resetSiCambioDia(): void {
    const h = this.hoy();
    if (this.diaContador !== h) {
      this.diaContador = h;
      this.usadosHoy = 0;
    }
  }

  limiteDiario(): number {
    return Number(this.config.get<string>('SMTP_DAILY_LIMIT', '450'));
  }

  usadosHoyValor(): number {
    this.resetSiCambioDia();
    return this.usadosHoy;
  }

  restantesHoy(): number {
    this.resetSiCambioDia();
    return Math.max(0, this.limiteDiario() - this.usadosHoy);
  }

  estadoCorreo(): CorreoEstadoInfo {
    return {
      configurado: this.transporter !== null,
      limiteDiario: this.limiteDiario(),
      usadosHoy: this.usadosHoyValor(),
      restantesHoy: this.restantesHoy(),
      estado: this.ultimoEstado,
    };
  }

  private registrarIntento(): void {
    this.resetSiCambioDia();
    this.usadosHoy++;
  }

  // ===== Reintentos con backoff =====
  private dormir(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private esTransitorio(err: unknown): boolean {
    const e = err as { responseCode?: unknown; message?: unknown; code?: unknown };
    if (!e) return false;
    const code = e.responseCode;
    if (typeof code === 'number') return code >= 400 && code < 500;
    const msg = String(e.message ?? e.code ?? '').toLowerCase();
    return /timeout|econn|esocket|enotfound|socket|temporar|too many|rate|eai_|eagain/.test(
      msg,
    );
  }

  private async conReintentos(fn: () => Promise<void>): Promise<void> {
    const intentos = 3;
    let err: unknown;
    for (let i = 0; i < intentos; i++) {
      try {
        await fn();
        this.ultimoEstado = 'ok';
        return;
      } catch (e) {
        err = e;
        if (!this.esTransitorio(e) || i === intentos - 1) break;
        await this.dormir(1000 * 2 ** i);
      }
    }
    this.ultimoEstado = this.esTransitorio(err) ? 'bloqueado' : 'indisponible';
    throw err;
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
      this.ultimoEstado = 'no_configurado';
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

    this.registrarIntento();
    await this.conReintentos(async () => {
      await this.transporter!.sendMail({
        from: this.desde(),
        to: args.destinatario,
        subject: `Boleta de Pago — ${mesLabel}`,
        html,
      });
    });
    return true;
  }

  async enviarBoletaFirmada(args: CorreoBoletaFirmadaArgs): Promise<boolean> {
    if (!this.transporter) {
      this.ultimoEstado = 'no_configurado';
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
          <h3 style="margin:0 0 16px;color:#111827">REGISTRO DE CONFORMIDAD Y FIRMA</h3>
          <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px">
            <p style="margin:6px 0"><b>Documento:</b> Boleta de Pago de Haberes (Periodo: ${mesLabel})</p>
            <p style="margin:6px 0"><b>Estatus:</b> Firmado digitalmente conforme a normativa interna</p>
            <p style="margin:6px 0"><b>Archivo adjunto:</b> ${nombreArchivo}</p>
          </div>
          <p style="font-weight:bold;margin:16px 0 4px">Instrucciones de acceso:</p>
          <p style="font-size:13px;color:#4b5563;margin:0">
            Por motivos de confidencialidad y seguridad de la información, el
            archivo adjunto se encuentra protegido. Para abrirlo e ingresar al
            documento, utilice su número de DNI como clave de acceso.
          </p>
        </div>
      </div>`;

    this.registrarIntento();
    await this.conReintentos(async () => {
      await this.transporter!.sendMail({
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
    });
    return true;
  }
}