import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BoletasService } from './boletas.service';
import { CreateBoletaDto } from './dto/create-boleta.dto';
import { EnviarMasivoDto } from './dto/enviar-masivo.dto';

@ApiTags('boletas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('boletas')
export class BoletasController {
  constructor(private readonly service: BoletasService) {}

  @Get()
  findAll(
    @Query('anio') anio?: string,
    @Query('mes') mes?: string,
    @Query('estado') estado?: string,
  ) {
    return this.service.findAll({ anio, mes, estado });
  }

  @Get('exportar')
  async exportar(
    @Res() res: Response,
    @Query('anio') anio?: string,
    @Query('mes') mes?: string,
    @Query('soloPendientes') soloPendientes?: string,
  ) {
    const { contenido, nombre } = await this.service.exportarCsv({
      anio,
      mes,
      soloPendientes,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(contenido);
  }

  @Get('resumen')
  resumen(@Query('anio') anio?: string, @Query('mes') mes?: string) {
    return this.service.resumen({ anio, mes });
  }

  @Get('por-area')
  porArea(
    @Query('anio') anio?: string,
    @Query('mes') mes?: string,
    @Query('soloPendientes') soloPendientes?: string,
  ) {
    return this.service.porArea({ anio, mes, soloPendientes });
  }

  @Get('envios-por-mes')
  enviosPorMes(@Query('anio') anio?: string) {
    return this.service.enviosPorMes(anio);
  }

  @Get('actividad-reciente')
  actividadReciente(@Query('limite') limite?: string) {
    return this.service.actividadReciente(limite ? Number(limite) : 15);
  }

  @Patch(':id/email-enviado')
  marcarEmailEnviado(@Param('id', ParseIntPipe) id: number) {
    return this.service.marcarEmailEnviado(id);
  }

  @Post('enviar-masivo')
  enviarMasivo(@Body() dto: EnviarMasivoDto) {
    return this.service.enviarMasivo(dto.ids);
  }

  @Post(':id/enviar-correo')
  enviarCorreo(@Param('id', ParseIntPipe) id: number) {
    return this.service.enviarCorreo(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/pdf')
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, nombre } = await this.service.obtenerPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(Buffer.from(buffer));
  }

  @Post()
  create(@Body() dto: CreateBoletaDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}