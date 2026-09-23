import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
  PaymentMethodResponseDto,
} from './dto';

/**
 * Servicio para gestionar métodos de pago
 * CRUD completo para métodos de pago (EFECTIVO, TRANSFERENCIA, TARJETA, etc.)
 */
@Injectable()
export class PaymentMethodsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Crear nuevo método de pago
   */
  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    // Validar que no exista un método con el mismo nombre
    const existing = await this.prisma.paymentMethod.findFirst({
      where: {
        OR: [{ name: dto.name }, { code: dto.code }],
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Método de pago con nombre "${dto.name}" o código "${dto.code}" ya existe`,
      );
    }

    const paymentMethod = await this.prisma.paymentMethod.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });

    return this.mapToResponseDto(paymentMethod);
  }

  /**
   * Listar todos los métodos de pago
   */
  async findAll(includeInactive = false): Promise<PaymentMethodResponseDto[]> {
    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: includeInactive ? {} : { isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    return paymentMethods.map((method) => this.mapToResponseDto(method));
  }

  /**
   * Obtener método de pago por ID
   */
  async findById(id: string): Promise<PaymentMethodResponseDto> {
    const paymentMethod = await this.prisma.paymentMethod.findUnique({
      where: { id },
    });

    if (!paymentMethod) {
      throw new NotFoundException(
        `Método de pago con ID "${id}" no encontrado`,
      );
    }

    return this.mapToResponseDto(paymentMethod);
  }

  /**
   * Obtener método de pago por código
   */
  async findByCode(code: string): Promise<PaymentMethodResponseDto> {
    const paymentMethod = await this.prisma.paymentMethod.findUnique({
      where: { code },
    });

    if (!paymentMethod) {
      throw new NotFoundException(
        `Método de pago con código "${code}" no encontrado`,
      );
    }

    return this.mapToResponseDto(paymentMethod);
  }

  /**
   * Actualizar método de pago
   */
  async update(
    id: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    // Verificar que existe
    await this.findById(id);

    // Validar que no exista otro con el mismo nombre o código
    if (dto.name || dto.code) {
      const existing = await this.prisma.paymentMethod.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [{ name: dto.name }, { code: dto.code }],
            },
          ],
        },
      });

      if (existing) {
        throw new BadRequestException(
          `Ya existe otro método con nombre "${dto.name}" o código "${dto.code}"`,
        );
      }
    }

    const updated = await this.prisma.paymentMethod.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        isActive: dto.isActive,
        updatedAt: new Date(),
      },
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Eliminar (soft delete) método de pago
   */
  async delete(id: string): Promise<void> {
    // Verificar que existe
    await this.findById(id);

    // Verificar que no tiene pagos asociados
    const paymentCount = await this.prisma.payment.count({
      where: { paymentMethodId: id },
    });

    if (paymentCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar. Hay ${paymentCount} pago(s) asociado(s) a este método.`,
      );
    }

    // Soft delete
    await this.prisma.paymentMethod.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }

  /**
   * Activar/Desactivar método de pago
   */
  async toggleActive(
    id: string,
    isActive: boolean,
  ): Promise<PaymentMethodResponseDto> {
    // Verificar que existe
    await this.findById(id);

    const updated = await this.prisma.paymentMethod.update({
      where: { id },
      data: {
        isActive,
        updatedAt: new Date(),
      },
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Mapear entidad Prisma a DTO de respuesta
   */
  private mapToResponseDto(paymentMethod: any): PaymentMethodResponseDto {
    return {
      id: paymentMethod.id,
      name: paymentMethod.name,
      code: paymentMethod.code,
      description: paymentMethod.description,
      isActive: paymentMethod.isActive,
      createdAt: paymentMethod.createdAt,
      updatedAt: paymentMethod.updatedAt,
    };
  }
}
