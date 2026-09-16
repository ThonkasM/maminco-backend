import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
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
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        super({
            // Logging: descomentar para ver queries en desarrollo
            // log: [
            //   { emit: 'stdout', level: 'query' },
            //   { emit: 'stdout', level: 'error' },
            //   { emit: 'stdout', level: 'warn' },
            // ],
        });
    }

    /**
     * Conectar a la base de datos cuando el módulo se inicializa
     */
    async onModuleInit() {
        await this.$connect();
        console.log('✅ PrismaService conectado a la base de datos');
    }

    /**
     * Desconectar de la base de datos cuando la aplicación se detiene
     */
    async onModuleDestroy() {
        await this.$disconnect();
        console.log('🔌 PrismaService desconectado de la base de datos');
    }
}
