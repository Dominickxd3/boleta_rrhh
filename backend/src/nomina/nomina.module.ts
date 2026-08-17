import { Module } from '@nestjs/common';
import { BoletasModule } from '../boletas/boletas.module';
import { WorkersModule } from '../workers/workers.module';
import { NominaController } from './nomina.controller';
import { NominaService } from './nomina.service';

@Module({
  imports: [WorkersModule, BoletasModule],
  controllers: [NominaController],
  providers: [NominaService],
})
export class NominaModule {}