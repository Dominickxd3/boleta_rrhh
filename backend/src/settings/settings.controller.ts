import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';

function actorDe(req: Request) {
  const user = req.user as { username?: string } | undefined;
  return {
    usuario: user?.username ?? null,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get('representante-firma')
  async getRepresentante(@Res() res: Response) {
    const buffer = await this.service.leer();
    if (!buffer) {
      throw new NotFoundException('No hay firma de representante cargada');
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(buffer);
  }

  @UseGuards(JwtAuthGuard)
  @Post('representante-firma')
  guardar(@Req() req: Request, @Body() body: { imagen?: string }) {
    if (!body?.imagen) {
      throw new NotFoundException('Falta la imagen');
    }
    return this.service.guardar(body.imagen, actorDe(req));
  }

  @UseGuards(JwtAuthGuard)
  @Delete('representante-firma')
  eliminar(@Req() req: Request) {
    return this.service.eliminar(actorDe(req));
  }
}
