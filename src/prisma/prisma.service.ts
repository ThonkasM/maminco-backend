import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService
 *
 * Servicio centralizado para el acceso a la base de datos usando Prisma ORM.
 *
 * Características:
 * - Inicializa PrismaClient en el arranque del módulo
 * - Desconecta automáticamente al detener la aplicación
 * - Exponse todos los modelos y métodos de Prisma
 * - Singleton: una única instancia durante toda la vida de la aplicación
 *
 * Uso en otros servicios:
 * ```
 * constructor(private prisma: PrismaService) {}
 *
 * async getUsers() {
 *   return this.prisma.user.findMany();
 * }
 * ```
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
  }

  /**
   * Conectar a la base de datos cuando el módulo se inicializa
   */
  async onModuleInit() {
    await this.$connect();
    this.logger.log('PrismaService conectado a la base de datos');
  }

  /**
   * Desconectar de la base de datos cuando la aplicación se detiene
   */
  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('PrismaService desconectado de la base de datos');
  }
}
