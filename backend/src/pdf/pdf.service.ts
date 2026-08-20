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
  otrosEmpRta5ta?: string;
  ocupacion?: string;
  centroCostos?: string;
  situacion?: string;
  documento?: string;
  diasLab?: number;
  diasNL?: number;
  diasSub?: number;
  horasExtra?: number;
  minutos?: number;
  minutosSob?: number;
  totHoras?: number;
  periodoPlanilla?: string;
  ingresos: DetalleItem[];
  descuentos: DetalleItem[];
  aportesTrabajador?: DetalleItem[];
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
  representante: PDFImage | null;
}

const NEGRO = rgb(0, 0, 0);
const GRIS_TEXTO = rgb(0.2, 0.2, 0.2);
const GRIS_GRUPO: RGB = rgb(0.87, 0.87, 0.87);
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
      representante: null,
    };
    await this.cargarLogo(ctx);
    await this.cargarRepresentante(ctx);

    this.dibujarEncabezado(ctx, detalle, boleta.id);
    this.dibujarIdentidad(ctx, boleta, detalle);
    this.dibujarFechas(ctx, detalle);
    this.dibujarJornada(ctx, detalle);
    this.dibujarSueldo(ctx, detalle);
    this.dibujarCentro(ctx, detalle);
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

  private async cargarRepresentante(ctx: Ctx) {
    try {
      const ruta = path.join(__dirname, '../../assets/representante_firma.png');
      const bytes = await fs.readFile(ruta);
      ctx.representante = await ctx.doc.embedPng(bytes);
    } catch {
      ctx.representante = null;
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
        otrosEmpRta5ta: d?.otrosEmpRta5ta,
        ocupacion: d?.ocupacion,
        centroCostos: d?.centroCostos,
        situacion: d?.situacion,
        documento: d?.documento,
        diasLab: Number(d?.diasLab ?? 0),
        diasNL: Number(d?.diasNL ?? 0),
        diasSub: Number(d?.diasSub ?? 0),
        horasExtra: Number(d?.horasExtra ?? 0),
        minutos: Number(d?.minutos ?? 0),
        minutosSob: Number(d?.minutosSob ?? 0),
        totHoras: Number(d?.totHoras ?? 0),
        periodoPlanilla: d?.periodoPlanilla,
        ingresos: d?.ingresos ?? [],
        descuentos: d?.descuentos ?? [],
        aportesTrabajador: d?.aportesTrabajador ?? [],
        aportes: d?.aportes ?? [],
        netoPagar: Number(d?.netoPagar ?? 0),
      };
    } catch {
      return {
        ingresos: [],
        descuentos: [],
        aportesTrabajador: [],
        aportes: [],
        netoPagar: 0,
      };
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
    return monto.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private ajustarFuente(font: PDFFont, texto: string, maxAncho: number): number {
    let size = 8;
    while (size > 5.5 && font.widthOfTextAtSize(String(texto), size) > maxAncho) {
      size -= 0.5;
    }
    return size;
  }

  private asegurarEspacio(ctx: Ctx, alto: number) {
    if (ctx.y - alto < 120) {
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

  private dibujarEncabezado(ctx: Ctx, detalle: Detalle, boletaId: number) {
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

    this.texto(page, ctx.bold, 11, tx, 820, detalle.empresa || 'EMPRESA S.A.C.', NEGRO);
    this.texto(page, ctx.helvetica, 8, tx, 806, `R.U.C.: ${detalle.ruc || ''}`, NEGRO);
    this.texto(page, ctx.helvetica, 8, tx, 792, detalle.direccion || '', NEGRO);

        const titulo = 'BOLETA DE PAGO';
    const anchoTitulo = ctx.bold.widthOfTextAtSize(titulo, 15);
    this.texto(page, ctx.bold, 15, (595.28 - anchoTitulo) / 2, 764, titulo, NEGRO);

    const nro = `BOLETA N° ${String(boletaId).padStart(6, '0')}`;
    this.textoDer(page, ctx.bold, 10, X4, 820, nro, NEGRO);

    ctx.y = 746;
  }

  private centroY(yTop: number, h: number, size: number): number {
    return yTop - h / 2 - size * 0.25;
  }

  private tituloCelda(
    ctx: Ctx,
    x0: number,
    x1: number,
    yTop: number,
    texto: string,
    centrado = true,
    h = 15,
  ) {
    const { page } = ctx;
    const txt = String(texto).toUpperCase();
    const maxAncho = x1 - x0 - 8;
    const size = this.ajustarFuente(ctx.bold, txt, maxAncho);
    const x = centrado
      ? x0 + (x1 - x0 - ctx.bold.widthOfTextAtSize(txt, size)) / 2
      : x0 + 5;
    this.texto(page, ctx.bold, size, x, this.centroY(yTop, h, size), txt, NEGRO);
  }

  private valorCelda(
    ctx: Ctx,
    x0: number,
    x1: number,
    yTop: number,
    texto: string,
    opts: { bold?: boolean; mono?: boolean; der?: boolean; centro?: boolean; tam?: number } = {},
    h = 17,
  ) {
    const { page } = ctx;
    const font = opts.mono ? ctx.mono : opts.bold === false ? ctx.helvetica : ctx.bold;
    const txt = String(texto ?? '');
    const size = opts.tam ?? this.ajustarFuente(font, txt, x1 - x0 - 10);
    const y = this.centroY(yTop, h, size);
    if (opts.der) {
      this.textoDer(page, font, size, x1 - 6, y, txt, NEGRO);
    } else if (opts.centro) {
      const ancho = font.widthOfTextAtSize(txt, size);
      this.texto(page, font, size, x0 + (x1 - x0 - ancho) / 2, y, txt, NEGRO);
    } else {
      this.texto(page, font, size, x0 + 5, y, txt, NEGRO);
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

  private pageHline(ctx: Ctx, y: number) {
    ctx.page.drawLine({
      start: { x: X0, y },
      end: { x: X4, y },
      thickness: 0.8,
      color: NEGRO,
    });
  }

  private vline(ctx: Ctx, x: number, y1: number, y2: number) {
    ctx.page.drawLine({
      start: { x, y: y1 },
      end: { x, y: y2 },
      thickness: 0.8,
      color: NEGRO,
    });
  }

  private dibujarIdentidad(ctx: Ctx, boleta: Boleta, detalle: Detalle) {
    const cols = [X0, 100, 190, 390, X4];
    const top = ctx.y;
    const h1 = 15;
    const h2 = 17;

    this.caja(ctx, top, top - h1 - h2, X0, X4);
    this.vline(ctx, cols[2], top, top - h1);
    this.vline(ctx, cols[3], top, top - h1);
    this.pageHline(ctx, top - h1);
    this.vline(ctx, cols[1], top - h1, top - h1 - h2);
    this.vline(ctx, cols[2], top - h1, top - h1 - h2);
    this.vline(ctx, cols[3], top - h1, top - h1 - h2);

    this.tituloCelda(ctx, cols[0], cols[2], top, 'DOCUMENTO DE IDENTIDAD', false);
    this.tituloCelda(ctx, cols[2], cols[3], top, 'APELLIDOS Y NOMBRE', false);
    this.tituloCelda(ctx, cols[3], cols[4], top, 'SITUACIÓN');

    const vy = top - h1;
    const dni = (boleta.trabajador.dni || '').trim();
    this.valorCelda(ctx, cols[0], cols[1], vy, 'DNI', { bold: true, centro: true });
    this.valorCelda(ctx, cols[1], cols[2], vy, dni, { bold: false, mono: true, centro: true });
    this.valorCelda(ctx, cols[2], cols[3], vy, boleta.trabajador.nombreCompleto.toUpperCase(), { bold: true, centro: true });
    this.valorCelda(ctx, cols[3], cols[4], vy, detalle.situacion || '-', { bold: false, centro: true });

    ctx.y = vy - h2 - 4;
  }

  private dibujarFechas(ctx: Ctx, detalle: Detalle) {
    const cols = [X0, 100, 160, 260, 400, X4];
    const top = ctx.y;
    const h1 = 15;
    const h2 = 17;

    this.caja(ctx, top, top - h1 - h2, X0, X4, cols.slice(1, -1));
    this.pageHline(ctx, top - h1);
    this.tituloCelda(ctx, cols[0], cols[1], top, 'FEC. INGRESO');
    this.tituloCelda(ctx, cols[1], cols[2], top, 'FEC. CESE');
    this.tituloCelda(ctx, cols[2], cols[3], top, 'TIPO DE TRABAJADOR');
    this.tituloCelda(ctx, cols[3], cols[4], top, 'RÉGIMEN PENSIONARIO');
    this.tituloCelda(ctx, cols[4], cols[5], top, 'CUSPP');

    const vy = top - h1;
    this.valorCelda(ctx, cols[0], cols[1], vy, detalle.fIngreso || '-', { bold: false, centro: true });
    this.valorCelda(ctx, cols[1], cols[2], vy, detalle.fCese || '', { bold: false, centro: true });
    this.valorCelda(ctx, cols[2], cols[3], vy, (detalle.tipoTrabajador || '-').toUpperCase(), { bold: false, centro: true, tam: 7.5 });
    this.valorCelda(ctx, cols[3], cols[4], vy, detalle.regimenPensionario || '-', { bold: false, centro: true, tam: 7.5 });
    this.valorCelda(ctx, cols[4], cols[5], vy, detalle.cuspp || '-', { bold: false, mono: true, centro: true, tam: 7 });

    ctx.y = vy - h2 - 4;
  }

  private dibujarJornada(ctx: Ctx, detalle: Detalle) {
    const cols = [X0, 110, 180, 248, 300, 352, 404, 472, X4];
    const top = ctx.y;
    const h1 = 15;
    const h2 = 15;
    const h3 = 17;

    this.caja(ctx, top, top - h1 - h2 - h3, X0, X4);
    for (const x of [248, 404]) this.vline(ctx, x, top, top - h1);
    this.pageHline(ctx, top - h1);
    for (const x of [110, 180, 248, 300, 352, 404, 472])
      this.vline(ctx, x, top - h1, top - h1 - h2 - h3);
    this.pageHline(ctx, top - h1 - h2);

    this.tituloCelda(ctx, cols[0], cols[3], top, 'DÍAS');
    this.tituloCelda(ctx, cols[3], cols[6], top, 'JORNADA ORDINARIA');
    this.tituloCelda(ctx, cols[6], cols[8], top, 'SOBRETIEMPO');

    const y2 = top - h1;
    this.tituloCelda(ctx, cols[0], cols[1], y2, 'DÍAS LAB.');
    this.tituloCelda(ctx, cols[1], cols[2], y2, 'DÍAS NO LAB.');
    this.tituloCelda(ctx, cols[2], cols[3], y2, 'DÍAS SUB.');
    this.valorCelda(ctx, cols[3], cols[4], y2, 'CONDICIÓN', { bold: true, centro: true, tam: 7 });
    this.tituloCelda(ctx, cols[4], cols[5], y2, 'TOTAL HORAS');
    this.tituloCelda(ctx, cols[5], cols[6], y2, 'MINUTOS');
    this.tituloCelda(ctx, cols[6], cols[7], y2, 'TOTAL HORAS');
    this.tituloCelda(ctx, cols[7], cols[8], y2, 'MINUTOS');

    const y3 = y2 - h2;
    this.valorCelda(ctx, cols[0], cols[1], y3, String(detalle.diasLab ?? 0), { bold: false, mono: true, centro: true });
    this.valorCelda(ctx, cols[1], cols[2], y3, String(detalle.diasNL ?? 0), { bold: false, mono: true, centro: true });
    this.valorCelda(ctx, cols[2], cols[3], y3, String(detalle.diasSub ?? 0), { bold: false, mono: true, centro: true });
    this.valorCelda(ctx, cols[3], cols[4], y3, this.tituloPropio(detalle.condicion || '-'), { bold: false, centro: true, tam: 7 });
    this.valorCelda(ctx, cols[4], cols[5], y3, String(detalle.totHoras ?? 0), { bold: false, mono: true, centro: true });
    this.valorCelda(ctx, cols[5], cols[6], y3, String(detalle.minutos ?? 0), { bold: false, mono: true, centro: true });
    this.valorCelda(ctx, cols[6], cols[7], y3, String(detalle.horasExtra ?? 0), { bold: false, mono: true, centro: true });
    this.valorCelda(ctx, cols[7], cols[8], y3, String(detalle.minutosSob ?? 0), { bold: false, mono: true, centro: true });

    ctx.y = y3 - h3 - 4;
  }

  private dibujarSueldo(ctx: Ctx, detalle: Detalle) {
    const cols = [X0, 290, X4];
    const top = ctx.y;
    const h = 17;

    this.caja(ctx, top, top - h, X0, X4, [cols[1]]);
    this.texto(page(ctx), ctx.bold, 8, cols[0] + 6, this.centroY(top, h, 8), 'SUELDO BÁSICO', NEGRO);
    this.valorCelda(ctx, cols[1], cols[2], top, this.numero(detalle.sdoBasico ?? 0), { bold: true, mono: true, centro: true }, h);

    ctx.y = top - h - 4;
  }

  private dibujarCentro(ctx: Ctx, detalle: Detalle) {
    const cols = [X0, 220, 440, X4];
    const top = ctx.y;
    const h1 = 15;
    const h2 = 17;

    this.caja(ctx, top, top - h1 - h2, X0, X4, cols.slice(1, -1));
    this.pageHline(ctx, top - h1);
    this.tituloCelda(ctx, cols[0], cols[1], top, 'CENTRO DE COSTOS', false);
    this.tituloCelda(ctx, cols[1], cols[2], top, 'OCUPACIÓN', false);
    this.tituloCelda(ctx, cols[2], cols[3], top, 'OTROS EMP. RTA. 5TA. CAT.', false);

    const vy = top - h1;
    this.valorCelda(ctx, cols[0], cols[1], vy, detalle.centroCostos || '-', { bold: false, centro: true, tam: 7.5 });
    this.valorCelda(ctx, cols[1], cols[2], vy, detalle.ocupacion || '-', { bold: false, centro: true, tam: 7.5 });
    this.valorCelda(ctx, cols[2], cols[3], vy, detalle.otrosEmpRta5ta || '-', { bold: false, centro: true, tam: 7 });

    ctx.y = vy - h2 - 4;
  }

  private dibujarPeriodo(ctx: Ctx, detalle: Detalle) {
    const top = ctx.y;
    const h = 17;
    this.caja(ctx, top, top - h, X0, X4, [130]);
    this.texto(page(ctx), ctx.bold, 8, 46, this.centroY(top, h, 8), 'PLANILLA', NEGRO);
    let txt = detalle.periodoPlanilla || '';
    const size = this.ajustarFuente(ctx.bold, txt, 400);
    this.texto(page(ctx), ctx.bold, size, 138, this.centroY(top, h, size), txt, NEGRO);
    ctx.y = top - h - 5;
  }

  private dibujarConceptos(ctx: Ctx, detalle: Detalle) {
    const { page } = ctx;
    const xM = 290;
    const xI = 365;
    const xD = 452;

    const grupos = [
      { titulo: '01 Ingresos', items: detalle.ingresos },
      { titulo: '02 Descuentos', items: detalle.descuentos },
      { titulo: '03 Aportes del Trabajador', items: detalle.aportesTrabajador || [] },
    ];

    const grupoH = 14;
    const itemH = 14;
    let alto = 17;
    for (const g of grupos) alto += grupoH + g.items.length * itemH;

    this.asegurarEspacio(ctx, alto + 40);
    const topR = ctx.y;

    this.caja(ctx, topR, topR - alto, X0, X4, [xM, xI, xD]);
    const cab = topR - 17;
    this.pageHline(ctx, cab);
    this.tituloCelda(ctx, X0, xM, topR, 'CONCEPTO', false, 17);
    this.tituloCelda(ctx, xM, xI, topR, 'MOVIM.', true, 17);
    this.tituloCelda(ctx, xI, xD, topR, 'INGRESOS S/', true, 17);
    this.tituloCelda(ctx, xD, X4, topR, 'DESCUENTOS', true, 17);

    let y = cab;
    for (const g of grupos) {
      const gy = y - grupoH;
      page.drawRectangle({
        x: X0,
        y: gy,
        width: X4 - X0,
        height: grupoH,
        color: GRIS_GRUPO,
        borderColor: NEGRO,
        borderWidth: 0.8,
      });
      this.texto(page, ctx.bold, 8, X0 + 6, this.centroY(y, grupoH, 8), g.titulo, NEGRO);
      y = gy;
      const esIngresos = g.titulo.startsWith('01');
      const colImp = esIngresos ? xD : X4;
      for (const item of g.items) {
        const by = y - itemH;
        const nom = item.concepto || '';
        const anchoNom = xM - 8 - (X0 + 12);
        const sizeN = this.ajustarFuente(ctx.helvetica, nom, anchoNom);
        const usN = Math.min(7.5, sizeN);
        this.texto(page, ctx.helvetica, usN, X0 + 12, this.centroY(y, itemH, usN), nom, NEGRO);
        if (item.movim) {
          const m = ctx.mono;
          const mov = item.movim;
          const sizeM = this.ajustarFuente(m, mov, xI - xM - 12);
          const usM = Math.min(7.5, sizeM);
          this.texto(page, m, usM, xM + (xI - xM - m.widthOfTextAtSize(mov, usM)) / 2, this.centroY(y, itemH, usM), mov, NEGRO);
        }
        this.textoDer(page, ctx.mono, 7.5, colImp - 6, this.centroY(y, itemH, 7.5), this.numero(item.monto), NEGRO);
        y = by;
      }
    }

    ctx.y = topR - alto - 6;
  }

  private dibujarTotales(ctx: Ctx, detalle: Detalle) {
    const { page } = ctx;
    const xI = 452;

    const top = ctx.y;
    const h = 16;
    this.caja(ctx, top, top - h, X0, X4);
    this.texto(page, ctx.bold, 9, X0 + 6, this.centroY(top, h, 9), 'NETO A PAGAR', NEGRO);
    const sumaI = detalle.ingresos.reduce((s, i) => s + i.monto, 0);
    const sumaD =
      detalle.descuentos.reduce((s, d) => s + d.monto, 0) +
      (detalle.aportesTrabajador || []).reduce((s, d) => s + d.monto, 0);
    this.textoDer(page, ctx.bold, 9, xI - 6, this.centroY(top, h, 9), this.numero(sumaI), NEGRO);
    this.textoDer(page, ctx.bold, 9, X4 - 6, this.centroY(top, h, 9), this.numero(sumaD), NEGRO);

    const nx0 = 270;
    const nh = 21;
    const ntop = top - h - 4;
    this.caja(ctx, ntop, ntop - nh, nx0, X4);
    this.texto(page, ctx.bold, 10, nx0 + 8, this.centroY(ntop, nh, 10), 'IMPORTE NETO: S/.', NEGRO);
    this.textoDer(page, ctx.bold, 11, X4 - 8, this.centroY(ntop, nh, 11), this.numero(detalle.netoPagar), NEGRO);

    ctx.y = ntop - nh - 6;
  }

  private dibujarAportes(ctx: Ctx, detalle: Detalle) {
    const aportes = detalle.aportes ?? [];
    if (aportes.length === 0) {
      ctx.y -= 8;
      return;
    }
    const { page } = ctx;
    const h1 = 16;
    const itemH = 13.5;
    let alto = h1 + aportes.length * itemH;
    if (alto < 65 && ctx.y - 65 > 190) alto = 65;

    this.asegurarEspacio(ctx, alto + 20);
    const topR = ctx.y;

    this.caja(ctx, topR, topR - alto, X0, X4);
    this.pageHline(ctx, topR - h1);

    page.drawRectangle({
      x: X0,
      y: topR - h1,
      width: X4 - X0,
      height: h1,
      color: GRIS_GRUPO,
      borderColor: NEGRO,
      borderWidth: 0.8,
    });
    const titulo = '04 Aportes del Empleador';
    const anchoT = ctx.bold.widthOfTextAtSize(titulo, 10);
    this.texto(page, ctx.bold, 10, (595.28 - anchoT) / 2, this.centroY(topR, h1, 10), titulo, NEGRO);

    let y = topR - h1;
    for (const item of aportes) {
      const by = y - itemH;
      this.texto(page, ctx.helvetica, 8, X0 + 8, this.centroY(y, itemH, 8), `${item.concepto}:`, NEGRO);
      this.textoDer(page, ctx.mono, 8, X4 - 8, this.centroY(y, itemH, 8), this.numero(item.monto));
      y = by;
    }

    ctx.y = topR - alto - 8;
  }

  private async dibujarFirmas(
    ctx: Ctx,
    boleta: Boleta,
    firmaBase64?: string,
  ) {
    const { page } = ctx;
    const contenidoEnd = ctx.y;
    if (contenidoEnd < 140) this.agregarPagina(ctx);

    const lineaY = 120;

    page.drawLine({
      start: { x: 40, y: lineaY },
      end: { x: 270, y: lineaY },
      thickness: 1,
      color: NEGRO,
    });

    if (ctx.representante) {
      const imagen = ctx.representante;
      const imgBottom = lineaY + 6;
      const areaX0 = 40;
      const areaX1 = 270;
      const areaW = areaX1 - areaX0;
      let imgH = Math.max(0, contenidoEnd - 8 - imgBottom);
      if (imgH > 60) imgH = 60;
      const aspect = imagen.width / imagen.height;
      let imgW = aspect * imgH;
      if (imgW > areaW) {
        imgW = areaW;
        imgH = imgW / aspect;
      }
      if (imgH > 4 && imgW > 4) {
        page.drawImage(imagen, {
          x: areaX0 + (areaW - imgW) / 2,
          y: imgBottom,
          width: imgW,
          height: imgH,
        });
      }
    }

    const lblRep = 'REPRESENTANTE LEGAL';
    this.texto(
      page,
      ctx.bold,
      8,
      40 + (270 - 40 - ctx.bold.widthOfTextAtSize(lblRep, 8)) / 2,
      lineaY - 8,
      lblRep,
      NEGRO,
    );

    if (firmaBase64) {
      try {
        const png = this.base64APng(firmaBase64);
        const imagen = await ctx.doc.embedPng(png);
        const imgBottom = lineaY + 6;
        let imgH = Math.max(0, contenidoEnd - 8 - imgBottom);
        if (imgH > 44) imgH = 44;
        // Área de la firma centrada dentro de la línea FIRMA TRABAJADOR (330..540)
        const areaX0 = 345;
        const areaX1 = 528;
        const areaW = areaX1 - areaX0;
        const aspect = imagen.width / imagen.height;
        let imgW = aspect * imgH;
        if (imgW > areaW) {
          imgW = areaW;
          imgH = imgW / aspect;
        }
        if (imgH > 4 && imgW > 4) {
          page.drawImage(imagen, {
            x: areaX0 + (areaW - imgW) / 2,
            y: imgBottom,
            width: imgW,
            height: imgH,
          });
        }
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
    const lblFir = 'FIRMA TRABAJADOR';
    this.texto(
      page,
      ctx.bold,
      8,
      330 + (540 - 330 - ctx.bold.widthOfTextAtSize(lblFir, 8)) / 2,
      lineaY - 8,
      lblFir,
      NEGRO,
    );
  }

  private dibujarPie(doc: PDFDocument, helvetica: PDFFont) {
    const pages = doc.getPages();
    const total = pages.length;
    pages.forEach((page, i) => {
      this.textoDer(page, helvetica, 6.5, X4, 26, `Página ${i + 1} de ${total}`, GRIS_TEXTO);
    });
  }

  private tituloPropio(texto: string): string {
    return texto
      .toLowerCase()
      .split(' ')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }

  private base64APng(dataUrl: string): Uint8Array {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }
}

function page(ctx: Ctx) {
  return ctx.page;
}