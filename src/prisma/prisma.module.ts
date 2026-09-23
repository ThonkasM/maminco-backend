import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule
 *
 * Módulo global que proporciona el PrismaService a toda la aplicación.
 *
 * Al marcar como @Global(), el servicio está disponible en todos los módulos
 * sin necesidad de importar este módulo en cada uno.
 *
 * Esto simplifica la estructura y permite que cualquier servicio inyecte
 * directamente PrismaService sin configuración adicional.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
