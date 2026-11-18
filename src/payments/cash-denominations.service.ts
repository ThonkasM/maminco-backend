import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CashDenomination, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCashDenominationDto, CashDenominationResponseDto } from './dto';

export interface CashSummaryItem {
  value: number;
  type: string;
  quantity: number;
  subtotal: number;
}

export interface CashSummary {
  coins: CashSummaryItem[];
  bills: CashSummaryItem[];
  totalCoins: number;
  totalBills: number;
  grandTotal: number;
}

@Injectable()
export class CashDenominationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    includeInactive = false,
  ): Promise<CashDenominationResponseDto[]> {
    const denominations = await this.prisma.cashDenomination.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { value: 'asc' },
    });

    return denominations.map((denom) => this.mapToResponseDto(denom));
  }

  async findById(id: string): Promise<CashDenominationResponseDto> {
    const denomination = await this.prisma.cashDenomination.findUnique({
      where: { id },
    });

    if (!denomination) {
      throw new NotFoundException(`Denominación con ID "${id}" no encontrada`);
    }

    return this.mapToResponseDto(denomination);
  }

  async findByValueAndType(
    value: number,
    type: string,
  ): Promise<CashDenominationResponseDto> {
    const denomination = await this.prisma.cashDenomination.findUnique({
      where: { value_type: { value: String(value), type } },
    });

    if (!denomination) {
      throw new NotFoundException(
        `Denominación de Bs ${value} tipo ${type} no encontrada`,
      );
    }

    return this.mapToResponseDto(denomination);
  }

  async updateQuantity(
    id: string,
    dto: UpdateCashDenominationDto,
  ): Promise<CashDenominationResponseDto> {
    await this.findById(id);

    if (dto.quantity < 0) {
      throw new BadRequestException('La cantidad no puede ser negativa');
    }

    const updated = await this.prisma.cashDenomination.update({
      where: { id },
      data: {
        quantity: dto.quantity,
        updatedAt: new Date(),
      },
    });

    return this.mapToResponseDto(updated);
  }

  async incrementQuantity(
    id: string,
    amount: number,
  ): Promise<CashDenominationResponseDto> {
    if (amount <= 0) {
      throw new BadRequestException('El monto debe ser positivo');
    }

    const denomination = await this.prisma.cashDenomination.findUnique({
      where: { id },
    });

    if (!denomination) {
      throw new NotFoundException(`Denominación con ID "${id}" no encontrada`);
    }

    const updated = await this.prisma.cashDenomination.update({
      where: { id },
      data: {
        quantity: denomination.quantity + amount,
        updatedAt: new Date(),
      },
    });

    return this.mapToResponseDto(updated);
  }

  async decrementQuantity(
    id: string,
    amount: number,
  ): Promise<CashDenominationResponseDto> {
    if (amount <= 0) {
      throw new BadRequestException('El monto debe ser positivo');
    }

    const denomination = await this.prisma.cashDenomination.findUnique({
      where: { id },
    });

    if (!denomination) {
      throw new NotFoundException(`Denominación con ID "${id}" no encontrada`);
    }

    if (denomination.quantity < amount) {
      throw new BadRequestException(
        `Cantidad insuficiente. Disponible: ${denomination.quantity}, Solicitado: ${amount}`,
      );
    }

    const updated = await this.prisma.cashDenomination.update({
      where: { id },
      data: {
        quantity: denomination.quantity - amount,
        updatedAt: new Date(),
      },
    });

    return this.mapToResponseDto(updated);
  }

  async getTotalCashAmount(): Promise<number> {
    const denominations = await this.prisma.cashDenomination.findMany({
      where: { isActive: true },
    });

    let total = 0;
    for (const denom of denominations) {
      const value = parseFloat(denom.value.toString());
      total += value * denom.quantity;
    }

    return total;
  }

  async getCashSummary(): Promise<CashSummary> {
    const denominations = await this.prisma.cashDenomination.findMany({
      where: { isActive: true },
      orderBy: { value: 'asc' },
    });

    const coins: CashSummaryItem[] = [];
    const bills: CashSummaryItem[] = [];
    let totalCoins = new Prisma.Decimal(0);
    let totalBills = new Prisma.Decimal(0);

    for (const denom of denominations) {
      const subtotal = denom.value.mul(denom.quantity);
      const item: CashSummaryItem = {
        value: denom.value.toNumber(),
        type: denom.type,
        quantity: denom.quantity,
        subtotal: subtotal.toNumber(),
      };

      if (denom.type === 'COIN') {
        coins.push(item);
        totalCoins = totalCoins.add(subtotal);
      } else {
        bills.push(item);
        totalBills = totalBills.add(subtotal);
      }
    }

    return {
      coins,
      bills,
      totalCoins: totalCoins.toNumber(),
      totalBills: totalBills.toNumber(),
      grandTotal: totalCoins.add(totalBills).toNumber(),
    };
  }

  async resetAllQuantities(): Promise<void> {
    await this.prisma.cashDenomination.updateMany({
      where: { isActive: true },
      data: {
        quantity: 0,
        updatedAt: new Date(),
      },
    });
  }

  async toggleActive(
    id: string,
    isActive: boolean,
  ): Promise<CashDenominationResponseDto> {
    await this.findById(id);

    const updated = await this.prisma.cashDenomination.update({
      where: { id },
      data: {
        isActive,
        updatedAt: new Date(),
      },
    });

    return this.mapToResponseDto(updated);
  }

  async create(data: {
    value: number;
    type: string;
  }): Promise<CashDenominationResponseDto> {
    const existing = await this.prisma.cashDenomination.findUnique({
      where: {
        value_type: {
          value: String(data.value),
          type: data.type,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Denominación de Bs ${data.value} tipo ${data.type} ya existe`,
      );
    }

    const created = await this.prisma.cashDenomination.create({
      data: {
        value: data.value,
        type: data.type,
        quantity: 0,
        isActive: true,
      },
    });

    return this.mapToResponseDto(created);
  }

  async delete(id: string): Promise<void> {
    const denomination = await this.findById(id);

    if (denomination.quantity > 0) {
      throw new BadRequestException(
        `No se puede eliminar denominación con cantidad en caja (${denomination.quantity} registrados)`,
      );
    }

    await this.prisma.cashDenomination.delete({
      where: { id },
    });
  }

  private mapToResponseDto(
    denomination: CashDenomination,
  ): CashDenominationResponseDto {
    return {
      id: denomination.id,
      value: denomination.value.toNumber(),
      type: denomination.type,
      quantity: denomination.quantity,
      total: denomination.value.mul(denomination.quantity).toNumber(),
      isActive: denomination.isActive,
    };
  }
}
