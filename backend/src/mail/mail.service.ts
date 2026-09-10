import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
  | 'no_configurado'
  | 'auth'
  | 'cuota'
  | 'rechazado';

export interface CorreoEstadoInfo {
  configurado: boolean;
  limiteDiario: number;
  usadosHoy: number;
  restantesHoy: number;
  estado: EstadoCorreo;
  ultimoError: string | null;
  ultimoErrorFecha: string | null;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private usadosHoy = 0;
  private diaContador = '';
  private ultimoEstado: EstadoCorreo = 'no_configurado';
  private ultimoError: string | null = null;
  private ultimoErrorFecha: string | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {
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

  async onModuleInit() {
    await this.asegurarTablaMailEnvios();
    await this.sincronizarDesdeBd();
  }

  private async asegurarTablaMailEnvios(): Promise<void> {
    if (!this.dataSource?.isInitialized) return;
    try {
      await this.dataSource.query(`
        IF OBJECT_ID('dbo.mail_envios', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.mail_envios (
            id BIGINT IDENTITY(1,1) PRIMARY KEY,
            fecha DATETIME2 NOT NULL DEFAULT GETDATE(),
            tipo VARCHAR(50) NOT NULL,
            destinatario VARCHAR(200) NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'enviado'
          );
          CREATE INDEX IX_mail_envios_fecha ON dbo.mail_envios (fecha);
        END
      `);
    } catch (err) {
      this.logger.warn(`No se pudo asegurar tabla mail_envios: ${(err as Error).message}`);
    }
  }

  async sincronizarDesdeBd(): Promise<number> {
    if (!this.dataSource?.isInitialized) return this.usadosHoy;
    try {
      // 1. Contar envíos registrados en dbo.mail_envios para hoy
      const resMail = await this.dataSource.query(`
        SELECT COUNT(*) as c 
        FROM dbo.mail_envios 
        WHERE fecha >= CAST(CAST(GETDATE() AS DATE) AS DATETIME2)
      `);
      const enviosRegistrados = Number(resMail?.[0]?.c || 0);

      // 2. Contar envíos desde boletas (iniciales + firmadas) para hoy
      const resBoletas = await this.dataSource.query(`
        SELECT 
          (SELECT COUNT(*) FROM dbo.boletas WHERE fecha_email >= CAST(CAST(GETDATE() AS DATE) AS DATETIME2))
          +
          (SELECT COUNT(*) FROM dbo.boletas WHERE fecha_firmado >= CAST(CAST(GETDATE() AS DATE) AS DATETIME2))
        AS totalBoletas
      `);
      const enviosBoletas = Number(resBoletas?.[0]?.totalBoletas || 0);

      // Tomamos el mayor para garantizar que no se pierdan los envíos previos
      const totalReal = Math.max(enviosRegistrados, enviosBoletas);

      this.diaContador = this.hoy();
      this.usadosHoy = Math.max(this.usadosHoy, totalReal);
      return this.usadosHoy;
    } catch (err) {
      this.logger.warn(`Error al sincronizar contador de correos desde BD: ${(err as Error).message}`);
      return this.usadosHoy;
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

  async estadoCorreo(): Promise<CorreoEstadoInfo> {
    await this.sincronizarDesdeBd();
    return {
      configurado: this.transporter !== null,
      limiteDiario: this.limiteDiario(),
      usadosHoy: this.usadosHoyValor(),
      restantesHoy: this.restantesHoy(),
      estado: this.ultimoEstado,
      ultimoError: this.ultimoError,
      ultimoErrorFecha: this.ultimoErrorFecha,
    };
  }

  private async registrarIntento(tipo: string, destinatario?: string): Promise<void> {
    this.resetSiCambioDia();
    this.usadosHoy++;
    if (this.dataSource?.isInitialized) {
      try {
        await this.dataSource.query(
          `INSERT INTO dbo.mail_envios (fecha, tipo, destinatario, estado) VALUES (GETDATE(), @0, @1, 'enviado')`,
          [tipo, (destinatario || '').slice(0, 200)],
        );
      } catch {
        /* noop */
      }
    }
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

  private textoError(err: unknown): string {
    const e = err as { message?: unknown; code?: unknown; response?: unknown };
    const msg = String(e?.message ?? '');
    const code = (e as { responseCode?: unknown })?.responseCode;
    return typeof code === 'number' ? `Código ${code}: ${msg}` : msg;
  }

  private clasificar(err: unknown): EstadoCorreo {
    const e = err as { responseCode?: unknown; message?: unknown; code?: unknown };
    const code = e?.responseCode;
    const msg = String(e?.message ?? e?.code ?? '').toLowerCase();

    // Error de autenticación: cuenta rechazada / bloqueada / clave de app inválida
    if (
      code === 535 ||
      msg.includes('authentication') ||
      msg.includes('invalid login') ||
      msg.includes('credentials') ||
      msg.includes('username and password') ||
      msg.includes('auth')
    ) {
      return 'auth';
    }
    // Límite diario / cuota del proveedor (452 / 454 4.7.0 / too many messages)
    if (
      code === 452 ||
      code === 454 ||
      msg.includes('daily limit') ||
      msg.includes('too many') ||
      msg.includes('quota') ||
      msg.includes('message rejected') ||
      msg.includes('5.4.5') ||
      msg.includes('5.2.1')
    ) {
      return 'cuota';
    }
    // Rechazo permanente (5xx): posible bloqueo por comportamiento sospechoso
    if (typeof code === 'number' && code >= 500) return 'rechazado';
    // Errores transitorios (4xx / red): posible throttling
    if (this.esTransitorio(err)) return 'bloqueado';
    return 'indisponible';
  }

  private async conReintentos(fn: () => Promise<void>): Promise<void> {
    const intentos = 3;
    let err: unknown;
    for (let i = 0; i < intentos; i++) {
      try {
        await fn();
        this.ultimoEstado = 'ok';
        this.ultimoError = null;
        this.ultimoErrorFecha = null;
        return;
      } catch (e) {
        err = e;
        if (!this.esTransitorio(e) || i === intentos - 1) break;
        await this.dormir(1000 * 2 ** i);
      }
    }
    this.ultimoEstado = this.clasificar(err);
    this.ultimoError = this.textoError(err);
    this.ultimoErrorFecha = new Date().toISOString();
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

    await this.registrarIntento('boleta', args.destinatario);
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

    await this.registrarIntento('boleta_firmada', args.destinatario);
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