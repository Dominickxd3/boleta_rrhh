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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkersService } from './workers.service';
import { CreateWorkerDto, UpdateWorkerDto } from './dto/worker.dto';

function actorDe(req: Request) {
  const user = req.user as { username?: string } | undefined;
  return { usuario: user?.username ?? null, ip: req.ip ?? null };
}

@ApiTags('trabajadores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trabajadores')
export class WorkersController {
  constructor(private readonly service: WorkersService) {}

  @Post('sincronizar')
  sincronizar(@Req() req: Request) {
    return this.service.sincronizarDesdeGGHH(actorDe(req));
  }

  @Get()
  findAll(
    @Query('busqueda') busqueda?: string,
    @Query('soloActivos') soloActivos?: string,
  ) {
    return this.service.findAll(busqueda, soloActivos === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateWorkerDto) {
    return this.service.create(dto, actorDe(req));
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkerDto,
  ) {
    return this.service.update(id, dto, actorDe(req));
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id, actorDe(req));
  }
}
