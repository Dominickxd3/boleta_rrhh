import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const corsOrigin = process.env.CORS_ORIGIN;
  const origin = corsOrigin
    ? corsOrigin
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : true;
  app.enableCors({ origin, credentials: true });
  // Para capturar la IP real del cliente detrás de un proxy/balanceador
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Boleta RRHH API')
    .setDescription('API para boletas de pago y firma de trabajadores')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`API corriendo en http://${host}:${port}/api`);
}
bootstrap();
