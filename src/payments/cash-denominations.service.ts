import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    CreateCashDenominationDto,
    UpdateCashDenominationDto,
    CashDenominationResponseDto,
} from './dto';

/**
 * Servicio para gestionar denominaciones de efectivo (monedas y billetes)
 * Denominaciones en Bolivianos: 1, 2, 5, 10, 20, 50, 100, 200
 */
@Injectable()
export class CashDenominationsService {
    constructor(private prisma: PrismaService) { }

    /**
     * Obtener todas las denominaciones de efectivo
     */
    async findAll(
        includeInactive = false,
    ): Promise<CashDenominationResponseDto[]> {
        const denominations = await this.prisma.cashDenomination.findMany({
            where: includeInactive ? {} : { isActive: true },
            orderBy: { value: 'asc' },
        });

        return denominations.map((denom) => this.mapToResponseDto(denom));
    }

    /**
     * Obtener denominación por ID
     */
    async findById(id: string): Promise<CashDenominationResponseDto> {
        const denomination = await this.prisma.cashDenomination.findUnique({
            where: { id },
        });

        if (!denomination) {
            throw new NotFoundException(
                `Denominación con ID "${id}" no encontrada`,
            );
        }

        return this.mapToResponseDto(denomination);
    }

    /**
     * Obtener denominación por valor y tipo
     */
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

    /**
     * Actualizar cantidad de denominación en caja
     */
    async updateQuantity(
        id: string,
        dto: UpdateCashDenominationDto,
    ): Promise<CashDenominationResponseDto> {
        // Verificar que existe
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

    /**
     * Incrementar cantidad (cuando se agrega efectivo a la caja)
     */
    async incrementQuantity(id: string, amount: number): Promise<CashDenominationResponseDto> {
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

    /**
     * Decrementar cantidad (cuando se saca efectivo de la caja)
     */
    async decrementQuantity(id: string, amount: number): Promise<CashDenominationResponseDto> {
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

    /**
     * Obtener total en efectivo en caja
     */
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

    /**
     * Obtener resumen de caja (desglosado por denominación)
     */
    async getCashSummary(): Promise<any> {
        const denominations = await this.prisma.cashDenomination.findMany({
            where: { isActive: true },
            orderBy: { value: 'asc' },
        });

        const summary: any = {
            coins: [],
            bills: [],
            totalCoins: 0,
            totalBills: 0,
            grandTotal: 0,
        };

        for (const denom of denominations) {
            const value = parseFloat(denom.value.toString());
            const subtotal = value * denom.quantity;

            const item = {
                value,
                type: denom.type,
                quantity: denom.quantity,
                subtotal,
            };

            if (denom.type === 'COIN') {
                summary.coins.push(item);
                summary.totalCoins += subtotal;
            } else {
                summary.bills.push(item);
                summary.totalBills += subtotal;
            }

            summary.grandTotal += subtotal;
        }

        return summary;
    }

    /**
     * Resetear todas las denominaciones a 0
     * (Solo para cierre de caja)
     */
    async resetAllQuantities(): Promise<void> {
        await this.prisma.cashDenomination.updateMany({
            where: { isActive: true },
            data: {
                quantity: 0,
                updatedAt: new Date(),
            },
        });
    }

    /**
     * Activar/Desactivar denominación
     */
    async toggleActive(id: string, isActive: boolean): Promise<CashDenominationResponseDto> {
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

    /**
     * Crear una nueva denominación de efectivo
     */
    async create(data: { value: number; type: string }): Promise<CashDenominationResponseDto> {
        // Validar que no exista ya
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

    /**
     * Eliminar denominación de efectivo (solo si no tiene cantidad registrada)
     */
    async delete(id: string): Promise<void> {
        // Verificar que existe
        const denomination = await this.findById(id);

        // No permitir eliminar si tiene cantidad en caja
        if (denomination.quantity > 0) {
            throw new BadRequestException(
                `No se puede eliminar denominación con cantidad en caja (${denomination.quantity} registrados)`,
            );
        }

        await this.prisma.cashDenomination.delete({
            where: { id },
        });
    }

    /**
     * Mapear entidad Prisma a DTO de respuesta
     */
    private mapToResponseDto(denomination: any): CashDenominationResponseDto {
        const value = parseFloat(denomination.value.toString());
        return {
            id: denomination.id,
            value,
            type: denomination.type,
            quantity: denomination.quantity,
            total: value * denomination.quantity,
            isActive: denomination.isActive,
        };
    }
}
