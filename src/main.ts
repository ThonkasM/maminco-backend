import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ============================================
  // CORS Configuration
  // ============================================
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:8000',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
    ];

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  });

  // ============================================
  // Global Validation Pipe
  // ============================================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ============================================
  // Start server
  // ============================================
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Servidor iniciado en http://localhost:${port}`);
  console.log(`📋 CORS habilitado para: ${JSON.stringify(corsOrigin)}`);
}
bootstrap();
