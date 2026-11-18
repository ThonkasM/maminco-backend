import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

process.env.JWT_SECRET ??= 'openapi-export-placeholder-secret-0123456789';
process.env.DATABASE_URL ??=
  'postgresql://openapi:openapi@localhost:5432/openapi';

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../src/app.module');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildSwaggerConfig } = require('../src/config/swagger.config');
  const app = await NestFactory.create(AppModule, {
    logger: false,
    preview: true,
    abortOnError: false,
  });
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  const out = resolve(process.argv[2] ?? 'openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2) + '\n');
  await app.close();
  console.log(`OpenAPI escrito en ${out}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
