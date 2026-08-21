import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoletasModule } from '../boletas/boletas.module';
import { PdfModule } from '../pdf/pdf.module';
import { MailModule } from '../mail/mail.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Boleta } from '../boletas/boleta.entity';
import { FirmaController } from './firma.controller';
import { FirmaService } from './firma.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Boleta]),
    BoletasModule,
    PdfModule,
    MailModule,
    AuditoriaModule,
  ],
  controllers: [FirmaController],
  providers: [FirmaService],
})
export class FirmaModule {}