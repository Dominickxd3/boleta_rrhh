import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ImportarNominaDto } from './dto/importar-nomina.dto';
import { NominaService } from './nomina.service';

function actorDe(req: Request) {
  const user = req.user as { username?: string } | undefined;
  return {
    usuario: user?.username ?? null,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@ApiTags('nomina')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nomina')
export class NominaController {
  constructor(private readonly service: NominaService) {}

  @Get('empresa')
  empresa() {
    return this.service.getEmpresa();
  }

  @Get('periodos')
  periodos() {
    return this.service.getPeriodos();
  }

  @Post('sincronizar')
  sincronizar(@Req() req: Request, @Body() dto: ImportarNominaDto) {
    return this.service.sincronizar(dto.anomes, dto.correl, actorDe(req));
  }

  @Get('boletas')
  boletas(
    @Query('anomes') anomes: string,
    @Query('correl') correl: string,
  ) {
    return this.service.getBoletas(anomes, correl);
  }

  @Post('importar')
  importar(@Req() req: Request, @Body() dto: ImportarNominaDto) {
    return this.service.importar(dto.anomes, dto.correl, actorDe(req));
  }

  @Post('generar')
  generar(@Req() req: Request, @Body() dto: ImportarNominaDto) {
    return this.service.generar(dto.anomes, dto.correl, actorDe(req));
  }
}