import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { WorkersModule } from '../workers/workers.module';
import { PdfModule } from '../pdf/pdf.module';
import { Boleta } from './boleta.entity';
import { BoletasController } from './boletas.controller';
import { BoletasService } from './boletas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Boleta]),
    WorkersModule,
    PdfModule,
    MailModule,
  ],
  controllers: [BoletasController],
  providers: [BoletasService],
  exports: [BoletasService],
})
export class BoletasModule {}