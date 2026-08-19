import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { BoletasService } from '../boletas/boletas.service';
import { FirmaService } from './firma.service';
import { FirmarDto } from './dto/firmar.dto';

@ApiTags('firma')
@Controller('firma')
export class FirmaController {
  constructor(
    private readonly service: FirmaService,
    private readonly boletas: BoletasService,
  ) {}

  @Get('firma/:token')
  infoFirma(@Param('token') token: string) {
    return this.service.infoFirma(token);
  }

  @Post('firma/:token')
  firmar(@Param('token') token: string, @Body() dto: FirmarDto) {
    return this.service.firmar(token, dto.firma);
  }

  @Get('firma/:token/pdf')
  async pdfFirma(@Param('token') token: string, @Res() res: Response) {
    const { buffer, nombre } = await this.service.pdfFirma(token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(Buffer.from(buffer));
  }

  @Get('ver/:token')
  infoVer(@Param('token') token: string) {
    return this.service.infoVer(token);
  }

  @Get('ver/:token/pdf')
  async pdfVer(@Param('token') token: string, @Res() res: Response) {
    const { buffer, nombre } = await this.boletas.obtenerPdfPorToken(token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(Buffer.from(buffer));
  }
}