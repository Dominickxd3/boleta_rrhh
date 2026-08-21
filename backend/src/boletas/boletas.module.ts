import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { WorkersModule } from '../workers/workers.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Boleta } from './boleta.entity';
import { BoletasController } from './boletas.controller';
import { BoletasService } from './boletas.service';
import { RealtimeController } from './realtime.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Boleta]),
    WorkersModule,
    PdfModule,
    MailModule,
    AuditoriaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'secret'),
      }),
    }),
  ],
  controllers: [BoletasController, RealtimeController],
  providers: [BoletasService],
  exports: [BoletasService],
})
export class BoletasModule {}