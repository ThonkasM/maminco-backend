import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Maminco API')
    .setDescription('Restaurant POS API (orders, payments, tables, reports)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
}
