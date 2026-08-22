import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditoriaService } from './auditoria.service';

@ApiTags('auditoria')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @UseGuards(JwtAuthGuard)
  @Get('dispositivos')
  dispositivos() {
    return this.auditoria.resumenDispositivos();
  }
}