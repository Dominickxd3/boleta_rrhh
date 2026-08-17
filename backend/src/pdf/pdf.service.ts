import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { Boleta } from '../boletas/boleta.entity';

interface DetalleItem {
  concepto: string;
  monto: number;
}

interface Detalle {
  empresa?: string;
  ruc?: string;
  direccion?: string;
  remune?: string;
  sdoBasico?: number;
  sdoBasFam?: number;
  totDias?: number;
  totHoras?: number;
  ingresos: DetalleItem[];
  descuentos: DetalleItem[];
  aportes?: DetalleItem[];
  netoPagar: number;
}

@Injectable()
export class PdfService {
  constructor(private readonly config: ConfigService) {}

  getCarpetaBase(): string {
    return this.config.get<string>('SERVIDOR_BOLETAS', 'D:\\Boletas');
  }

  nombreArchivo(boleta: Boleta): string {
    const nombre = boleta.trabajador.nombreCompleto;
    return `${boleta.periodo} - ${this.sanitizar(nombre)}.pdf`;
  }

  sanitizar(texto: string): string {
    return texto.replace(/[\\/:*?"<>|]/g, '').trim();
  }

  async guardarEnDisco(boleta: Boleta, buffer: Uint8Array): Promise<string> {
    const anio = String(boleta.anio);
    const mes = String(boleta.mes).padStart(2, '0');
    const carpeta = path.join(this.getCarpetaBase(), anio, mes);
    await fs.mkdir(carpeta, { recursive: true });
    const ruta = path.join(carpeta, this.nombreArchivo(boleta));
    await fs.writeFile(ruta, buffer);
    return ruta;
  }

  async generarBoleta(
    boleta: Boleta,
    firmaBase64?: string,
  ): Promise<Uint8Array> {
    const detalle = this.parseDetalle(boleta.detalleJson);
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    this.dibujarEncabezado(page, helvetica, bold, detalle);
    this.dibujarDatos(page, helvetica, bold, boleta, detalle);
    this.dibujarTabla(page, helvetica, bold, detalle, boleta);
    await this.dibujarFirma(doc, page, helvetica, bold, boleta, firmaBase64);

    return doc.save();
  }

  private parseDetalle(json: string): Detalle {
    try {
      const d = JSON.parse(json);
      return {
        empresa: d?.empresa,
        ruc: d?.ruc,
        direccion: d?.direccion,
        remune: d?.remune,
        sdoBasico: Number(d?.sdoBasico ?? 0),
        sdoBasFam: Number(d?.sdoBasFam ?? 0),
        totDias: Number(d?.totDias ?? 0),
        totHoras: Number(d?.totHoras ?? 0),
        ingresos: d?.ingresos ?? [],
        descuentos: d?.descuentos ?? [],
        aportes: d?.aportes ?? [],
        netoPagar: Number(d?.netoPagar ?? 0),
      };
    } catch {
      return { ingresos: [], descuentos: [], aportes: [], netoPagar: 0 };
    }
  }

  private texto(
    page: PDFPage,
    font: PDFFont,
    size: number,
    x: number,
    y: number,
    texto: string,
    color = rgb(0, 0, 0),
  ) {
    const limpio = texto.replace(/[^\u0000-\u00FF]/g, '?');
    page.drawText(limpio, { x, y, size, font, color });
  }

  private dinero(monto: number): string {
    return `S/ ${monto.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private dibujarEncabezado(
    page: PDFPage,
    _helvetica: PDFFont,
    bold: PDFFont,
    detalle: Detalle,
  ) {
    this.texto(page, bold, 18, 40, 790, detalle.empresa || 'EMPRESA S.A.C.');
    this.texto(page, bold, 13, 40, 768, 'BOLETA DE PAGO');
  }

  private dibujarDatos(
    page: PDFPage,
    helvetica: PDFFont,
    bold: PDFFont,
    boleta: Boleta,
    detalle: Detalle,
  ) {
    let y = 730;
    this.texto(page, bold, 11, 40, y, 'TRABAJADOR:');
    this.texto(
      page,
      helvetica,
      11,
      130,
      y,
      boleta.trabajador.nombreCompleto.toUpperCase(),
    );
    this.texto(page, bold, 11, 360, y, 'DNI:');
    this.texto(page, helvetica, 11, 430, y, boleta.trabajador.dni);
    y -= 18;
    this.texto(page, bold, 11, 40, y, 'RUC:');
    this.texto(page, helvetica, 11, 130, y, detalle.ruc || '');
    this.texto(page, bold, 11, 360, y, 'PERIODO:');
    this.texto(page, helvetica, 11, 430, y, boleta.periodo);
    y -= 18;
    this.texto(page, bold, 11, 40, y, 'REMUNERACIÓN:');
    this.texto(page, helvetica, 11, 130, y, detalle.remune || '');
    y -= 18;
    this.texto(page, bold, 11, 40, y, 'SUELDO BÁSICO:');
    this.texto(page, helvetica, 11, 130, y, this.dinero(detalle.sdoBasico ?? 0));
    this.texto(page, bold, 11, 300, y, 'DÍAS:');
    this.texto(page, helvetica, 11, 350, y, String(detalle.totDias ?? 0));
    this.texto(page, bold, 11, 420, y, 'HORAS:');
    this.texto(page, helvetica, 11, 480, y, String(detalle.totHoras ?? 0));
    y -= 18;
    this.texto(page, bold, 11, 40, y, 'ESTADO:');
    this.texto(
      page,
      helvetica,
      11,
      130,
      y,
      boleta.estado === 'FIRMADA' ? 'FIRMADA' : 'PENDIENTE DE FIRMA',
    );
  }

  private dibujarTabla(
    page: PDFPage,
    helvetica: PDFFont,
    bold: PDFFont,
    detalle: Detalle,
    _boleta: Boleta,
  ) {
    let y = 650;
    page.drawText('INGRESOS', {
      x: 40,
      y,
      size: 12,
      font: bold,
    });
    y -= 18;
    for (const item of detalle.ingresos) {
      this.texto(page, helvetica, 11, 40, y, item.concepto);
      this.texto(page, helvetica, 11, 480, y, this.dinero(item.monto));
      y -= 18;
    }
    y -= 12;
    page.drawText('DESCUENTOS', { x: 40, y, size: 12, font: bold });
    y -= 18;
    for (const item of detalle.descuentos) {
      this.texto(page, helvetica, 11, 40, y, item.concepto);
      this.texto(page, helvetica, 11, 480, y, `- ${this.dinero(item.monto)}`);
      y -= 18;
    }
    if (detalle.aportes && detalle.aportes.length > 0) {
      y -= 12;
      page.drawText('APORTES DEL EMPLEADOR', {
        x: 40,
        y,
        size: 12,
        font: bold,
      });
      y -= 18;
      for (const item of detalle.aportes) {
        this.texto(page, helvetica, 10, 40, y, item.concepto);
        this.texto(page, helvetica, 10, 480, y, this.dinero(item.monto));
        y -= 18;
      }
    }
    y -= 18;
    page.drawRectangle({
      x: 40,
      y: y - 4,
      width: 515,
      height: 24,
      color: rgb(0.9, 0.9, 0.9),
    });
    this.texto(page, bold, 12, 40, y, 'NETO A PAGAR');
    this.texto(page, bold, 12, 480, y, this.dinero(detalle.netoPagar));
  }

  private async dibujarFirma(
    doc: PDFDocument,
    page: PDFPage,
    helvetica: PDFFont,
    bold: PDFFont,
    boleta: Boleta,
    firmaBase64?: string,
  ) {
    let y = 230;
    this.texto(page, bold, 11, 40, y, 'FIRMA DEL TRABAJADOR:');
    y -= 80;

    if (firmaBase64) {
      try {
        const png = this.base64APng(firmaBase64);
        const imagen = await doc.embedPng(png);
        page.drawImage(imagen, {
          x: 60,
          y: y - 5,
          width: 150,
          height: 60,
        });
      } catch {
        y -= 18;
      }
    }

    page.drawLine({
      start: { x: 40, y },
      end: { x: 240, y },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    this.texto(
      page,
      helvetica,
      9,
      40,
      y - 14,
      boleta.trabajador.nombreCompleto.toUpperCase(),
    );
    this.texto(
      page,
      helvetica,
      9,
      40,
      y - 26,
      `DNI: ${boleta.trabajador.dni}`,
    );

    if (boleta.fechaFirmado) {
      const fecha = new Date(boleta.fechaFirmado).toLocaleString('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      this.texto(page, helvetica, 9, 320, y, `Firmado el: ${fecha}`);
    }
  }

  private base64APng(dataUrl: string): Uint8Array {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }
}