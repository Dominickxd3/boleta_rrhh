import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ImportarNominaDto } from './dto/importar-nomina.dto';
import { NominaService } from './nomina.service';

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
  sincronizar(@Body() dto: ImportarNominaDto) {
    return this.service.sincronizar(dto.anomes, dto.correl);
  }

  @Get('boletas')
  boletas(
    @Query('anomes') anomes: string,
    @Query('correl') correl: string,
  ) {
    return this.service.getBoletas(anomes, correl);
  }

  @Post('importar')
  importar(@Body() dto: ImportarNominaDto) {
    return this.service.importar(dto.anomes, dto.correl);
  }
}