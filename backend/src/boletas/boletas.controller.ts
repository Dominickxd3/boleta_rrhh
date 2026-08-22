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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BoletasService } from './boletas.service';
import { CreateBoletaDto } from './dto/create-boleta.dto';
import { EnviarMasivoDto } from './dto/enviar-masivo.dto';

function actorDe(req: Request) {
  const user = req.user as { username?: string } | undefined;
  return { usuario: user?.username ?? null, ip: req.ip ?? null };
}

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
    @Req() req: Request,
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
    await this.service.auditar('exportar_csv', 'boleta', null, actorDe(req), `Exportó boletas ${anio ?? ''}-${mes ?? ''}`);
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

  @Get('firmas-por-mes')
  firmasPorMes(@Query('anio') anio?: string) {
    return this.service.firmasPorMes(anio);
  }

  @Get('actividad-reciente')
  actividadReciente(@Query('limite') limite?: string) {
    return this.service.actividadReciente(limite ? Number(limite) : 15);
  }

  @Patch(':id/email-enviado')
  marcarEmailEnviado(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.service.marcarEmailEnviado(id, actorDe(req));
  }

  @Post('enviar-masivo')
  enviarMasivo(@Req() req: Request, @Body() dto: EnviarMasivoDto) {
    return this.service.enviarMasivo(dto.ids, actorDe(req));
  }

  @Post(':id/enviar-correo')
  enviarCorreo(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.service.enviarCorreo(id, actorDe(req));
  }

  @Post(':id/revertir-firma')
  revertirFirma(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.service.revertirFirma(id, actorDe(req));
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
  create(@Req() req: Request, @Body() dto: CreateBoletaDto) {
    return this.service.create(dto, actorDe(req));
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id, actorDe(req));
  }
}