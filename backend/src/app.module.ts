import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity';
import { Worker } from './workers/worker.entity';
import { Boleta } from './boletas/boleta.entity';
import { AuthModule } from './auth/auth.module';
import { WorkersModule } from './workers/workers.module';
import { BoletasModule } from './boletas/boletas.module';
import { FirmaModule } from './firma/firma.module';
import { NominaModule } from './nomina/nomina.module';
import { GghhModule } from './gghh/gghh.module';
import { EventsModule } from './events/events.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mssql',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: parseInt(config.get<string>('DB_PORT', '1433'), 10),
        username: config.get<string>('DB_USER', 'sa'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_NAME', 'BoletaRRHH'),
        entities: [User, Worker, Boleta],
        synchronize: true,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
        },
      }),
    }),
    AuthModule,
    WorkersModule,
    BoletasModule,
    FirmaModule,
    NominaModule,
    GghhModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
