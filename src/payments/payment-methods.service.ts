import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
  PaymentMethodResponseDto,
} from './dto';

@Injectable()
export class PaymentMethodsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
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

  async findAll(includeInactive = false): Promise<PaymentMethodResponseDto[]> {
    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: includeInactive ? {} : { isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    return paymentMethods.map((method) => this.mapToResponseDto(method));
  }

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

  async update(
    id: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    await this.findById(id);

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

  async delete(id: string): Promise<void> {
    await this.findById(id);

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

  async toggleActive(
    id: string,
    isActive: boolean,
  ): Promise<PaymentMethodResponseDto> {
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

  private mapToResponseDto(
    paymentMethod: PaymentMethod,
  ): PaymentMethodResponseDto {
    return {
      id: paymentMethod.id,
      name: paymentMethod.name,
      code: paymentMethod.code,
      description: paymentMethod.description ?? undefined,
      isActive: paymentMethod.isActive,
      createdAt: paymentMethod.createdAt,
      updatedAt: paymentMethod.updatedAt,
    };
  }
}
