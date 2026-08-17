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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkersService } from './workers.service';
import { CreateWorkerDto, UpdateWorkerDto } from './dto/worker.dto';

@ApiTags('trabajadores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trabajadores')
export class WorkersController {
  constructor(private readonly service: WorkersService) {}

  @Post('sincronizar')
  sincronizar() {
    return this.service.sincronizarDesdeGGHH();
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
  create(@Body() dto: CreateWorkerDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWorkerDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
