import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  type RGB,
  StandardFonts,
} from 'pdf-lib';
import { Boleta } from '../boletas/boleta.entity';

interface DetalleItem {
  concepto: string;
  monto: number;
  movim?: string;
}

interface Detalle {
  empresa?: string;
  ruc?: string;
  direccion?: string;
  sdoBasico?: number;
  fIngreso?: string;
  fCese?: string;
  regimenPensionario?: string;
  cuspp?: string;
  tipoTrabajador?: string;
  condicion?: string;
  diasLab?: number;
  diasNL?: number;
  diasSub?: number;
  horasExtra?: number;
  formaPago?: string;
  categoria?: string;
  periodoPlanilla?: string;
  ingresos: DetalleItem[];
  descuentos: DetalleItem[];
  aportes?: DetalleItem[];
  netoPagar: number;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  helvetica: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  logo: PDFImage | null;
  logoW: number;
  logoH: number;
}

const NEGRO = rgb(0, 0, 0);
const GRIS_TEXTO = rgb(0.2, 0.2, 0.2);
const BLANCO: RGB = rgb(1, 1, 1);

const X0 = 40;
const X4 = 540;

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
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const mono = await doc.embedFont(StandardFonts.Courier);
    const page = doc.addPage([595.28, 841.89]);

    const ctx: Ctx = {
      doc,
      page,
      y: 0,
      helvetica,
      bold,
      mono,
      logo: null,
      logoW: 0,
      logoH: 0,
    };
    await this.cargarLogo(ctx);

    this.dibujarEncabezado(ctx, detalle);
    this.dibujarTablaDatos(ctx, boleta, detalle);
    this.dibujarTablaCargo(ctx, boleta, detalle);
    this.dibujarTablaJornada(ctx, detalle);
    this.dibujarPeriodo(ctx, detalle);
    this.dibujarConceptos(ctx, detalle);
    this.dibujarTotales(ctx, detalle);
    this.dibujarAportes(ctx, detalle);
    await this.dibujarFirmas(ctx, boleta, firmaBase64);
    this.dibujarPie(doc, helvetica);

    return doc.save();
  }

  private async cargarLogo(ctx: Ctx) {
    try {
      const ruta = path.join(__dirname, '../../assets/logo_gp.png');
      const bytes = await fs.readFile(ruta);
      const img = await ctx.doc.embedPng(bytes);
      const alto = 42;
      const ancho = (img.width / img.height) * alto;
      ctx.logo = img;
      ctx.logoH = alto;
      ctx.logoW = ancho;
    } catch {
      ctx.logo = null;
    }
  }

  private parseDetalle(json: string): Detalle {
    try {
      const d = JSON.parse(json);
      return {
        empresa: d?.empresa,
        ruc: d?.ruc,
        direccion: d?.direccion,
        sdoBasico: Number(d?.sdoBasico ?? 0),
        fIngreso: d?.fIngreso,
        fCese: d?.fCese,
        regimenPensionario: d?.regimenPensionario,
        cuspp: d?.cuspp,
        tipoTrabajador: d?.tipoTrabajador,
        condicion: d?.condicion,
        diasLab: Number(d?.diasLab ?? 0),
        diasNL: Number(d?.diasNL ?? 0),
        diasSub: Number(d?.diasSub ?? 0),
        horasExtra: Number(d?.horasExtra ?? 0),
        formaPago: d?.formaPago,
        categoria: d?.categoria,
        periodoPlanilla: d?.periodoPlanilla,
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
    color: RGB = NEGRO,
  ) {
    const limpio = String(texto).replace(/[^\u0000-\u00FF]/g, '?');
    page.drawText(limpio, { x, y, size, font, color });
  }

  private textoDer(
    page: PDFPage,
    font: PDFFont,
    size: number,
    xDer: number,
    y: number,
    texto: string,
    color: RGB = NEGRO,
  ) {
    const limpio = String(texto);
    const ancho = font.widthOfTextAtSize(limpio, size);
    this.texto(page, font, size, xDer - ancho, y, limpio, color);
  }

  private numero(monto: number): string {
    return monto.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private asegurarEspacio(ctx: Ctx, alto: number) {
    if (ctx.y - alto < 150) {
      this.agregarPagina(ctx);
    }
  }

  private agregarPagina(ctx: Ctx) {
    const page = ctx.doc.addPage([595.28, 841.89]);
    page.drawLine({
      start: { x: X0, y: 810 },
      end: { x: X4, y: 810 },
      thickness: 1,
      color: NEGRO,
    });
    const cont = 'BOLETA DE PAGO (CONTINUACIÓN)';
    this.textoDer(page, ctx.bold, 9, X4, 799, cont, NEGRO);
    ctx.page = page;
    ctx.y = 790;
  }

  private dibujarEncabezado(ctx: Ctx, detalle: Detalle) {
    const { page } = ctx;

    if (ctx.logo) {
      page.drawImage(ctx.logo, {
        x: X0,
        y: 788,
        width: ctx.logoW,
        height: ctx.logoH,
      });
    }
    const tx = X0 + ctx.logoW + 14;

    this.texto(page, ctx.bold, 11, tx, 824, detalle.empresa || 'EMPRESA S.A.C.', NEGRO);
    this.texto(page, ctx.helvetica, 8, tx, 810, `R.U.C.: ${detalle.ruc || ''}`, NEGRO);
    this.texto(page, ctx.helvetica, 8, tx, 797, detalle.direccion || '', NEGRO);

    const titulo = 'BOLETA DE PAGO';
    const anchoTitulo = ctx.bold.widthOfTextAtSize(titulo, 15);
    this.texto(page, ctx.bold, 15, (595.28 - anchoTitulo) / 2, 776, titulo, NEGRO);

    ctx.y = 760;
  }

  private tituloCelda(
    ctx: Ctx,
    x0: number,
    x1: number,
    yTop: number,
    yBottom: number,
    texto: string,
    centrado = true,
  ) {
    const { page } = ctx;
    let size = 8;
    let txt = String(texto).toUpperCase();
    const maxAncho = x1 - x0 - 8;
    while (size > 5.5 && ctx.bold.widthOfTextAtSize(txt, size) > maxAncho) {
      size -= 0.5;
    }
    const x = centrado
      ? x0 + (x1 - x0 - ctx.bold.widthOfTextAtSize(txt, size)) / 2
      : x0 + 5;
    this.texto(page, ctx.bold, size, x, yTop - 6, txt, NEGRO);
  }

  private valorCelda(
    ctx: Ctx,
    x0: number,
    x1: number,
    yTop: number,
    yBottom: number,
    texto: string,
    opts: { bold?: boolean; mono?: boolean; der?: boolean; centro?: boolean; tam?: number } = {},
  ) {
    const { page } = ctx;
    const font = opts.mono ? ctx.mono : opts.bold === false ? ctx.helvetica : ctx.bold;
    let size = opts.tam ?? 8;
    let txt = String(texto ?? '');
    if (txt === '') txt = '';
    const maxAncho = x1 - x0 - 10;
    while (size > 5.5 && font.widthOfTextAtSize(txt, size) > maxAncho) {
      size -= 0.5;
    }
    if (opts.der) {
      this.textoDer(page, font, size, x1 - 6, yTop - 6.5, txt, NEGRO);
    } else if (opts.centro) {
      const ancho = font.widthOfTextAtSize(txt, size);
      this.texto(page, font, size, x0 + (x1 - x0 - ancho) / 2, yTop - 6.5, txt, NEGRO);
    } else {
      this.texto(page, font, size, x0 + 5, yTop - 6.5, txt, NEGRO);
    }
  }

  private caja(ctx: Ctx, top: number, bottom: number, x0: number, x1: number, vlines: number[] = []) {
    const { page } = ctx;
    page.drawRectangle({
      x: x0,
      y: bottom,
      width: x1 - x0,
      height: top - bottom,
      color: BLANCO,
      borderColor: NEGRO,
      borderWidth: 1,
    });
    for (const x of vlines) {
      page.drawLine({
        start: { x, y: bottom },
        end: { x, y: top },
        thickness: 0.8,
        color: NEGRO,
      });
    }
  }

  private dibujarTablaDatos(ctx: Ctx, boleta: Boleta, detalle: Detalle) {
    const t = boleta.trabajador;
    const cols = [X0, 130, 330, 420, 480, X4];
    const top = ctx.y;
    const h1 = 15;
    const h2 = 17;

    this.caja(ctx, top, top - h1 - h2, X0, X4, cols.slice(1, -1));
    pageHline(ctx, top - h1);
    this.tituloCelda(ctx, cols[0], cols[1], top, top - h1, 'CÓDIGO');
    this.tituloCelda(ctx, cols[1], cols[2], top, top - h1, 'APELLIDOS Y NOMBRES', false);
    this.tituloCelda(ctx, cols[2], cols[3], top, top - h1, 'DOCUMENTO');
    this.tituloCelda(ctx, cols[3], cols[4], top, top - h1, 'F. INGRESO');
    this.tituloCelda(ctx, cols[4], cols[5], top, top - h1, 'F. CESE');

    const vy = top - h1;
    this.valorCelda(ctx, cols[0], cols[1], vy, vy - h2, '-', { centro: true });
    this.valorCelda(ctx, cols[1], cols[2], vy, vy - h2, t.nombreCompleto.toUpperCase(), { bold: true, tam: 8 });
    this.valorCelda(ctx, cols[2], cols[3], vy, vy - h2, t.dni || '-', { mono: true, centro: true });
    this.valorCelda(ctx, cols[3], cols[4], vy, vy - h2, detalle.fIngreso || '-', { centro: true });
    this.valorCelda(ctx, cols[4], cols[5], vy, vy - h2, detalle.fCese || '', { centro: true });

    ctx.y = vy - h2 - 4;
  }

  private dibujarTablaCargo(ctx: Ctx, boleta: Boleta, detalle: Detalle) {
    const t = boleta.trabajador;
    const cols = [X0, 330, 420, 480, X4];
    const top = ctx.y;
    const h1 = 15;
    const h2 = 17;

    this.caja(ctx, top, top - h1 - h2, X0, X4, cols.slice(1, -1));
    pageHline(ctx, top - h1);
    this.tituloCelda(ctx, cols[0], cols[1], top, top - h1, 'CARGO', false);
    this.tituloCelda(ctx, cols[1], cols[2], top, top - h1, 'SUELDO');
    this.tituloCelda(ctx, cols[2], cols[3], top, top - h1, 'S. PENSIONES');
    this.tituloCelda(ctx, cols[3], cols[4], top, top - h1, 'CUSPP');

    const vy = top - h1;
    this.valorCelda(ctx, cols[0], cols[1], vy, vy - h2, (t.cargo || '').toUpperCase(), { bold: true, tam: 8 });
    this.valorCelda(ctx, cols[1], cols[2], vy, vy - h2, `S/ ${this.numero(detalle.sdoBasico ?? 0)}`, { mono: true, der: true });
    this.valorCelda(ctx, cols[2], cols[3], vy, vy - h2, (detalle.regimenPensionario || '-').toUpperCase(), { centro: true, tam: 7.5 });
    this.valorCelda(ctx, cols[3], cols[4], vy, vy - h2, detalle.cuspp || '-', { mono: true, centro: true, tam: 7 });

    ctx.y = vy - h2 - 4;
  }

  private dibujarTablaJornada(ctx: Ctx, detalle: Detalle) {
    const cols = [X0, 250, 320, 380, 430, 490, X4];
    const top = ctx.y;
    const h1 = 15;
    const h2 = 17;

    this.caja(ctx, top, top - h1 - h2, X0, X4, cols.slice(1, -1));
    pageHline(ctx, top - h1);
    this.tituloCelda(ctx, cols[0], cols[1], top, top - h1, 'CATEGORÍA', false);
    this.tituloCelda(ctx, cols[1], cols[2], top, top - h1, 'DÍAS LAB.');
    this.tituloCelda(ctx, cols[2], cols[3], top, top - h1, 'DÍAS N/L');
    this.tituloCelda(ctx, cols[3], cols[4], top, top - h1, 'DÍAS SUB.');
    this.tituloCelda(ctx, cols[4], cols[5], top, top - h1, 'H.T.');
    this.tituloCelda(ctx, cols[5], cols[6], top, top - h1, 'FORMA PAGO');

    const vy = top - h1;
    this.valorCelda(ctx, cols[0], cols[1], vy, vy - h2, detalle.categoria || detalle.tipoTrabajador || '-', { bold: false, tam: 8 });
    this.valorCelda(ctx, cols[1], cols[2], vy, vy - h2, String(detalle.diasLab ?? 0), { mono: true, centro: true });
    this.valorCelda(ctx, cols[2], cols[3], vy, vy - h2, String(detalle.diasNL ?? 0), { mono: true, centro: true });
    this.valorCelda(ctx, cols[3], cols[4], vy, vy - h2, String(detalle.diasSub ?? 0), { mono: true, centro: true });
    this.valorCelda(ctx, cols[4], cols[5], vy, vy - h2, String(detalle.horasExtra ?? 0), { mono: true, centro: true });
    this.valorCelda(ctx, cols[5], cols[6], vy, vy - h2, detalle.formaPago || '-', { centro: true });

    ctx.y = vy - h2 - 4;
  }

  private dibujarPeriodo(ctx: Ctx, detalle: Detalle) {
    const top = ctx.y;
    const h = 17;
    this.caja(ctx, top, top - h, X0, X4, [120]);
    this.texto(page(ctx), ctx.bold, 8, 46, top - 6, 'PLANILLA', NEGRO);
    let txt = detalle.periodoPlanilla || '';
    let size = 8;
    while (size > 6 && ctx.bold.widthOfTextAtSize(txt, size) > 400) size -= 0.5;
    this.texto(page(ctx), ctx.bold, size, 128, top - 6, txt, NEGRO);
    ctx.y = top - h - 5;
  }

  private dibujarConceptos(ctx: Ctx, detalle: Detalle) {
    const { page } = ctx;
    const xC = X0;
    const xM = 290;
    const xI = 365;
    const xD = 452;

    const items = [...detalle.ingresos, ...detalle.descuentos];
    let filas = items.length;
    const altoBase = 17 + filas * 15;
    if (altoBase < 225 && ctx.y - 225 > 190) {
      filas += Math.ceil((225 - altoBase) / 15);
    }
    const alto = 17 + filas * 15;

    this.asegurarEspacio(ctx, alto + 60);
    const topR = ctx.y;

    this.caja(ctx, topR, topR - alto, X0, X4, [xM, xI, xD]);
    const cab = topR - 17;
    pageHline(ctx, cab);
    this.tituloCelda(ctx, xC, xM, topR, cab, 'CONCEPTO', false);
    this.tituloCelda(ctx, xM, xI, topR, cab, 'MOVIM.');
    this.tituloCelda(ctx, xI, xD, topR, cab, 'INGRESOS');
    this.tituloCelda(ctx, xD, X4, topR, cab, 'DESCUENTOS');

    let y = cab - 15;
    for (const item of detalle.ingresos) {
      this.texto(page, ctx.bold, 7.5, xC + 6, y + 5, item.concepto || '');
      this.valorCelda(ctx, xM, xI, y + 5, y - 10, item.movim || '', { mono: true, centro: true, tam: 7.5 });
      this.textoDer(page, ctx.mono, 7.5, xI - 6, y + 5, this.numero(item.monto));
      y -= 15;
    }
    for (const item of detalle.descuentos) {
      this.texto(page, ctx.helvetica, 7.5, xC + 6, y + 5, item.concepto || '');
      this.valorCelda(ctx, xM, xI, y + 5, y - 10, item.movim || '', { mono: true, centro: true, tam: 7.5 });
      this.textoDer(page, ctx.mono, 7.5, xD - 6, y + 5, this.numero(item.monto));
      y -= 15;
    }

    ctx.y = topR - alto - 10;
  }

  private dibujarTotales(ctx: Ctx, detalle: Detalle) {
    const { page } = ctx;
    const xI = 365;
    const xD = 452;

    const top = ctx.y;
    const h = 16;
    this.caja(ctx, top, top - h, X0, X4);
    pageHline(ctx, top);
    this.texto(page, ctx.bold, 9, X0 + 6, top - 6.5, 'TOTAL INGRESOS Y DESCUENTOS: S/.', NEGRO);
    const sumaI = detalle.ingresos.reduce((s, i) => s + i.monto, 0);
    const sumaD = detalle.descuentos.reduce((s, d) => s + d.monto, 0);
    this.textoDer(page, ctx.bold, 9, xI - 6, top - 6.5, this.numero(sumaI), NEGRO);
    this.textoDer(page, ctx.bold, 9, xD - 6, top - 6.5, this.numero(sumaD), NEGRO);

    const nx0 = 270;
    const nh = 21;
    const ntop = top - h - 4;
    this.caja(ctx, ntop, ntop - nh, nx0, X4);
    pageHline(ctx, ntop);
    this.texto(page, ctx.bold, 10, nx0 + 8, ntop - 8, 'IMPORTE NETO: S/.', NEGRO);
    this.textoDer(page, ctx.bold, 11, X4 - 8, ntop - 8, this.numero(detalle.netoPagar), NEGRO);

    ctx.y = ntop - nh - 6;
  }

  private dibujarAportes(ctx: Ctx, detalle: Detalle) {
    const aportes = detalle.aportes ?? [];
    if (aportes.length === 0) {
      ctx.y -= 8;
      return;
    }
    const { page } = ctx;
    const top = ctx.y;
    const h1 = 16;
    const alto = h1 + aportes.length * 14;
    this.asegurarEspacio(ctx, alto + 120);
    const topR = ctx.y;

    this.caja(ctx, topR, topR - alto, X0, X4);
    pageHline(ctx, topR - h1);
    const titulo = 'APORTES DEL EMPLEADOR';
    const anchoT = ctx.bold.widthOfTextAtSize(titulo, 10);
    this.texto(page, ctx.bold, 10, (595.28 - anchoT) / 2, topR - 6, titulo, NEGRO);

    let y = topR - h1 - 5;
    for (const item of aportes) {
      this.texto(page, ctx.helvetica, 8, X0 + 8, y, `${item.concepto}:`, NEGRO);
      this.textoDer(page, ctx.mono, 8, X4 - 8, y, this.numero(item.monto));
      y -= 14;
    }

    ctx.y = topR - alto - 8;
  }

  private async dibujarFirmas(
    ctx: Ctx,
    boleta: Boleta,
    firmaBase64?: string,
  ) {
    const { page } = ctx;
    if (ctx.y < 210) this.agregarPagina(ctx);

    const lineaY = 150;

    page.drawLine({
      start: { x: 40, y: lineaY },
      end: { x: 270, y: lineaY },
      thickness: 1,
      color: NEGRO,
    });
    this.texto(page, ctx.bold, 8, 40, lineaY - 8, 'REPRESENTANTE LEGAL', NEGRO);

    if (firmaBase64) {
      try {
        const png = this.base64APng(firmaBase64);
        const imagen = await ctx.doc.embedPng(png);
        page.drawImage(imagen, {
          x: 345,
          y: lineaY + 6,
          width: 110,
          height: 44,
        });
      } catch {
        /* sin firma visible */
      }
    }
    page.drawLine({
      start: { x: 330, y: lineaY },
      end: { x: 540, y: lineaY },
      thickness: 1,
      color: NEGRO,
    });
    this.texto(page, ctx.bold, 8, 330, lineaY - 8, 'FIRMA TRABAJADOR', NEGRO);
  }

  private dibujarPie(doc: PDFDocument, helvetica: PDFFont) {
    const pages = doc.getPages();
    const total = pages.length;
    pages.forEach((page, i) => {
      this.texto(
        page,
        helvetica,
        6.5,
        X0,
        26,
        'Documento emitido electrónicamente. No requiere sello ni firma de la empresa.',
        GRIS_TEXTO,
      );
      this.textoDer(page, helvetica, 6.5, X4, 26, `Página ${i + 1} de ${total}`, GRIS_TEXTO);
    });
  }

  private base64APng(dataUrl: string): Uint8Array {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }
}

function pageHline(ctx: Ctx, y: number) {
  ctx.page.drawLine({
    start: { x: X0, y },
    end: { x: X4, y },
    thickness: 0.8,
    color: NEGRO,
  });
}

function page(ctx: Ctx) {
  return ctx.page;
}