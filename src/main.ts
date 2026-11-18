import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { resolve } from 'node:path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { buildSwaggerConfig } from './config/swagger.config';
import { AppLogger } from './system/app-logger.service';
import {
  SocketIoAdapter,
  resolveCorsOrigins,
} from './common/adapters/socket-io.adapter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(AppLogger));

  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  app.use(helmet());
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  const corsOrigin = resolveCorsOrigins();

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, buildSwaggerConfig()),
  );

  if (process.env.STORAGE_DRIVER !== 's3') {
    // Only product images are public. `uploads/reports` (documents) is never mounted here.
    app.useStaticAssets(
      resolve(process.env.UPLOADS_DIR ?? './uploads', 'products'),
      {
        prefix: '/uploads/products/',
        maxAge: '365d',
        immutable: true,
        index: false,
        dotfiles: 'deny',
        setHeaders: (res) => {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
      },
    );
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Servidor iniciado en http://localhost:${port}`);
  logger.log(`CORS habilitado para: ${JSON.stringify(corsOrigin)}`);
}
void bootstrap();
