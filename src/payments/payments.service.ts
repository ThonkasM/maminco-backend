import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsGateway } from './payments.gateway';
import {
    ProcessPaymentDto,
    ListPaymentsQueryDto,
    PaymentResponseDto,
    PaginatedPaymentResponseDto,
    PaymentMethodResponseDto,
    PaymentProcessResponseDto,
} from './dto';

@Injectable()
export class PaymentsService {
    private logger: Logger = new Logger('PaymentsService');

    constructor(
        private prisma: PrismaService,
        private paymentsGateway: PaymentsGateway,
    ) { }

    /**
     * Obtiene todos los métodos de pago activos
     * Útil para mostrar opciones en el UI
     */
    async getPaymentMethods(): Promise<PaymentMethodResponseDto[]> {
        const methods = await this.prisma.paymentMethod.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
        });

        return methods.map(method => ({
            id: method.id,
            name: method.name,
            code: method.code,
            description: method.description || undefined,
            isActive: method.isActive,
            createdAt: method.createdAt,
            updatedAt: method.updatedAt,
        }));
    }

    /**
     * Procesa un pago en una orden
     * 
     * Flujo mejorado para MÚLTIPLES PAGOS PARCIALES:
     * 1. Permite pagos parciales (300 + 200 = 500)
     * 2. Cada pago se registra independientemente
     * 3. Solo cierra la orden cuando: totalPagado >= totalDue
     * 4. Calcula saldo pendiente después de cada pago
     * 5. Cuando es último pago: maneja cambio o propina
     * 
     * @param orderId - ID de la orden a pagar
     * @param dto - Datos del pago (incluye amountReceived = monto del pago ACTUAL)
     * @param userId - ID del usuario que registra
     * @returns Información del pago procesado
     */
    async processPayment(
        orderId: string,
        dto: ProcessPaymentDto,
        userId: string,
    ): Promise<PaymentProcessResponseDto> {
        // 1. Obtener la orden
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                table: true,
                createdBy: { select: { name: true } },
                payments: true, // ← IMPORTANTE: Incluir pagos existentes
            },
        });

        if (!order) {
            throw new NotFoundException(`Orden ${orderId} no encontrada`);
        }

        const totalDue = order.total.toNumber();

        // 2. Validar que la orden no esté ya pagada
        if (order.status === 'CERRADO') {
            return {
                status: 'ERROR',
                message: 'La orden ya está cerrada y pagada',
                error: 'ORDER_ALREADY_CLOSED',
            };
        }

        // 3. Obtener método de pago
        const paymentMethod = await this.prisma.paymentMethod.findUnique({
            where: { id: dto.paymentMethodId },
        });

        if (!paymentMethod || !paymentMethod.isActive) {
            throw new BadRequestException('Método de pago inválido o inactivo');
        }

        // 4. Calcular cuánto ya está pagado
        const totalPaidAlready = order.payments
            .reduce((sum, p) => sum + p.amountApplied.toNumber(), 0);
        const pendingBalance = totalDue - totalPaidAlready;

        // 5. Validar que el pago no sea 0 o negativo
        if (dto.amountReceived <= 0) {
            return {
                status: 'ERROR',
                message: 'El monto del pago debe ser mayor a 0',
                error: 'INVALID_AMOUNT',
            };
        }

        // 6. Lógica específica por método de pago
        const paymentMethodName = paymentMethod.name.toUpperCase();
        let changeAmount: number | null = null;
        let tipAmount: number = 0;
        let amountApplied: number = 0;
        let shouldCloseOrder = false;
        let remainingBalance = 0;

        // Determinar cuánto aplicar de este pago
        // Si el pago es mayor que lo pendiente, el excedente es cambio/propina
        if (dto.amountReceived >= pendingBalance) {
            // Este es el pago final
            amountApplied = pendingBalance;
            const excess = dto.amountReceived - pendingBalance;

            // EFECTIVO: El excedente es cambio
            if (paymentMethodName === 'EFECTIVO') {
                changeAmount = excess;
                tipAmount = 0;
            }
            // TRANSFERENCIA o TARJETA: Pregunta si el excedente es propina
            else if (
                paymentMethodName === 'TRANSFERENCIA' ||
                paymentMethodName === 'TARJETA'
            ) {
                if (excess > 0 && !dto.isExtraTip) {
                    // Pedir confirmación si hay excedente
                    return {
                        status: 'PENDING_CONFIRMATION',
                        message: `Monto mayor al saldo pendiente. ¿La diferencia de $${excess.toFixed(2)} es propina?`,
                        difference: excess,
                        amountReceived: dto.amountReceived,
                        totalDue: pendingBalance,
                        pendingBalance: 0,
                    };
                }
                // Si está confirmada como propina o no hay excedente
                tipAmount = dto.isExtraTip ? excess : 0;
                changeAmount = null;
            }

            shouldCloseOrder = true;
            remainingBalance = 0;
        } else {
            // Pago parcial
            amountApplied = dto.amountReceived;
            changeAmount = null;
            tipAmount = 0;
            shouldCloseOrder = false;
            remainingBalance = pendingBalance - amountApplied;
        }

        // 6. Crear registro de pago
        const payment = await this.prisma.payment.create({
            data: {
                amountReceived: new Prisma.Decimal(dto.amountReceived),
                amountApplied: new Prisma.Decimal(amountApplied),
                changeAmount: changeAmount !== null ? new Prisma.Decimal(changeAmount) : null,
                tipAmount: new Prisma.Decimal(tipAmount),
                order: { connect: { id: orderId } },
                paymentMethod: { connect: { id: dto.paymentMethodId } },
                createdBy: { connect: { id: userId } },
            },
            include: {
                paymentMethod: true,
                createdBy: { select: { id: true, name: true, email: true } },
            },
        });

        this.logger.log(
            `✅ Pago registrado: $${amountApplied} - Método: ${paymentMethod.name} - Cambio: ${changeAmount || 'N/A'} - Saldo pendiente: $${remainingBalance.toFixed(2)}`,
        );

        // 7. Actualizar orden solo si está completamente pagada
        if (shouldCloseOrder) {
            const updateData: any = {
                status: 'CERRADO',
                closedAt: new Date(),
                closedBy: { connect: { id: userId } },
            };

            // Agregar propina si existe
            if (tipAmount > 0) {
                updateData.tipAmount = new Prisma.Decimal(tipAmount);
            }

            await this.prisma.order.update({
                where: { id: orderId },
                data: updateData,
            });

            this.logger.log(
                `✅ Orden #${order.orderNumber} CERRADA. Total pagado: $${(totalPaidAlready + amountApplied).toFixed(2)}`,
            );
        } else {
            this.logger.debug(
                `⏳ Pago parcial registrado. Saldo pendiente: $${remainingBalance.toFixed(2)}`,
            );
        }

        // 8. Registrar en auditoría
        let auditDescription = `Pago de $${amountApplied} por ${paymentMethod.name}`;
        if (shouldCloseOrder) {
            auditDescription += ` (PAGO FINAL)`;
            if (changeAmount) auditDescription += ` - Cambio: $${changeAmount.toFixed(2)}`;
            if (tipAmount) auditDescription += ` - Propina: $${tipAmount.toFixed(2)}`;
        } else {
            auditDescription += ` (PAGO PARCIAL) - Saldo pendiente: $${remainingBalance.toFixed(2)}`;
        }

        await this.prisma.auditLog.create({
            data: {
                action: 'PAYMENT',
                tableName: 'payments',
                recordId: payment.id,
                description: auditDescription,
                user: { connect: { id: userId } },
                order: { connect: { id: orderId } },
                newValues: {
                    paymentId: payment.id,
                    amountReceived: dto.amountReceived,
                    amountApplied,
                    changeAmount: changeAmount || null,
                    tipAmount,
                    method: paymentMethod.name,
                },
            },
        });

        // 9. Emitir evento WebSocket
        this.paymentsGateway.emitPaymentProcessed(
            orderId,
            order.tableId,
            {
                paymentId: payment.id,
                amount: amountApplied,
                method: paymentMethod.name,
                changeAmount: changeAmount || 0,
                tipAmount,
                isPaid: shouldCloseOrder,
                paidBy: order.createdBy.name,
            },
        );

        // 10. Construir mensaje de respuesta
        const totalPaidNow = totalPaidAlready + amountApplied;
        let message = '';

        if (shouldCloseOrder) {
            message = `✅ Pago final registrado. Orden completamente pagada.`;
            if (changeAmount) message += ` Cambio a dar: $${changeAmount.toFixed(2)}.`;
            if (tipAmount) message += ` Propina registrada: $${tipAmount.toFixed(2)}.`;
        } else {
            message = `⏳ Pago parcial registrado: $${amountApplied.toFixed(2)}. Saldo pendiente: $${remainingBalance.toFixed(2)}.`;
        }

        return {
            status: shouldCloseOrder ? 'COMPLETED' : 'PARTIAL_PAYMENT',
            message,
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentId: payment.id,
            amountReceived: dto.amountReceived,
            amountApplied,
            changeAmount: changeAmount || null,
            tipAmount,
            totalDue,
            paymentMethod: paymentMethod.name,
            orderStatus: shouldCloseOrder ? 'CERRADO' : 'BORRADOR',
            totalPaidSoFar: totalPaidNow,
            pendingBalance: remainingBalance,
            isPaid: shouldCloseOrder,
        };
    }

    /**
     * Obtiene el monto total pagado en una orden
     */
    async getTotalPaidAmount(orderId: string): Promise<number> {
        const result = await this.prisma.payment.aggregate({
            where: { orderId },
            _sum: { amountApplied: true },
        });

        return result._sum.amountApplied?.toNumber() || 0;
    }

    /**
     * Obtiene todos los pagos de una orden
     */
    async getPaymentsByOrder(orderId: string): Promise<PaymentResponseDto[]> {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { orderNumber: true },
        });

        if (!order) {
            throw new NotFoundException(`Orden ${orderId} no encontrada`);
        }

        const payments = await this.prisma.payment.findMany({
            where: { orderId },
            include: {
                paymentMethod: true,
                createdBy: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        return payments.map(p => ({
            id: p.id,
            orderId: p.orderId,
            orderNumber: order.orderNumber,
            amountReceived: p.amountReceived.toNumber(),
            amountApplied: p.amountApplied.toNumber(),
            changeAmount: p.changeAmount?.toNumber() || null,
            tipAmount: p.tipAmount.toNumber(),
            paymentMethod: {
                id: p.paymentMethod.id,
                name: p.paymentMethod.name,
            },
            createdBy: p.createdBy,
            createdAt: p.createdAt,
        }));
    }

    /**
     * Lista todos los pagos con filtros y paginación
     */
    async findAll(query: ListPaymentsQueryDto): Promise<PaginatedPaymentResponseDto> {
        const page = Math.max(1, query.page || 1);
        const limit = Math.min(100, Math.max(1, query.limit || 20));
        const skip = (page - 1) * limit;

        // Construir filtro
        const where: Prisma.PaymentWhereInput = {};

        if (query.orderId) {
            where.orderId = query.orderId;
        }

        if (query.paymentMethodId) {
            where.paymentMethodId = query.paymentMethodId;
        }

        if (query.createdById) {
            where.createdById = query.createdById;
        }

        if (query.startDate || query.endDate) {
            where.createdAt = {};
            if (query.startDate) {
                where.createdAt.gte = new Date(query.startDate);
            }
            if (query.endDate) {
                const endDate = new Date(query.endDate);
                endDate.setHours(23, 59, 59, 999);
                where.createdAt.lte = endDate;
            }
        }

        // Obtener total y pagos
        const [total, payments] = await Promise.all([
            this.prisma.payment.count({ where }),
            this.prisma.payment.findMany({
                where,
                include: {
                    order: { select: { orderNumber: true } },
                    paymentMethod: true,
                    createdBy: { select: { id: true, name: true, email: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);

        const data = payments.map(p => ({
            id: p.id,
            orderId: p.orderId,
            orderNumber: p.order.orderNumber,
            amountReceived: p.amountReceived.toNumber(),
            amountApplied: p.amountApplied.toNumber(),
            changeAmount: p.changeAmount?.toNumber() || null,
            tipAmount: p.tipAmount.toNumber(),
            paymentMethod: {
                id: p.paymentMethod.id,
                name: p.paymentMethod.name,
            },
            createdBy: p.createdBy,
            createdAt: p.createdAt,
        }));

        return {
            data,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Obtiene un pago por ID
     */
    async findById(paymentId: string): Promise<PaymentResponseDto> {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                order: { select: { orderNumber: true } },
                paymentMethod: true,
                createdBy: { select: { id: true, name: true, email: true } },
            },
        });

        if (!payment) {
            throw new NotFoundException(`Pago ${paymentId} no encontrado`);
        }

        return {
            id: payment.id,
            orderId: payment.orderId,
            orderNumber: payment.order.orderNumber,
            amountReceived: payment.amountReceived.toNumber(),
            amountApplied: payment.amountApplied.toNumber(),
            changeAmount: payment.changeAmount?.toNumber() || null,
            tipAmount: payment.tipAmount.toNumber(),
            paymentMethod: {
                id: payment.paymentMethod.id,
                name: payment.paymentMethod.name,
            },
            createdBy: payment.createdBy,
            createdAt: payment.createdAt,
        };
    }

    /**
     * Obtiene resumen de pagos por método
     * Útil para reportes y análisis
     */
    async getPaymentSummaryByMethod(
        startDate?: Date,
        endDate?: Date,
    ): Promise<any> {
        const where: Prisma.PaymentWhereInput = {};

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = startDate;
            if (endDate) where.createdAt.lte = endDate;
        }

        const summary = await this.prisma.payment.groupBy({
            by: ['paymentMethodId'],
            where,
            _sum: { amountApplied: true },
            _count: { id: true },
            orderBy: { _sum: { amountApplied: 'desc' } },
        });

        // Obtener nombres de métodos
        const results = await Promise.all(
            summary.map(async (item) => {
                const method = await this.prisma.paymentMethod.findUnique({
                    where: { id: item.paymentMethodId },
                });
                const total = item._sum.amountApplied?.toNumber() || 0;
                return {
                    method: method?.name || 'Desconocido',
                    total,
                    count: item._count.id,
                    average: total / item._count.id,
                };
            }),
        );

        return results;
    }

    /**
     * Obtiene ingresos totales en un rango de fechas
     */
    async getTotalRevenue(startDate?: Date, endDate?: Date): Promise<number> {
        const where: Prisma.PaymentWhereInput = {};

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = startDate;
            if (endDate) where.createdAt.lte = endDate;
        }

        const result = await this.prisma.payment.aggregate({
            where,
            _sum: { amountApplied: true },
        });

        return result._sum.amountApplied?.toNumber() || 0;
    }

    /**
     * Obtiene resumen de cambio y propinas
     */
    async getCashSummary(startDate?: Date, endDate?: Date): Promise<any> {
        const where: Prisma.PaymentWhereInput = {
            paymentMethod: { name: { equals: 'EFECTIVO' } },
        };

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = startDate;
            if (endDate) where.createdAt.lte = endDate;
        }

        const cashPayments = await this.prisma.payment.findMany({
            where,
        });

        const totalCashReceived = cashPayments.reduce(
            (sum, p) => sum + p.amountReceived.toNumber(),
            0,
        );
        const totalCashApplied = cashPayments.reduce(
            (sum, p) => sum + p.amountApplied.toNumber(),
            0,
        );
        const totalChange = cashPayments.reduce(
            (sum, p) => sum + (p.changeAmount?.toNumber() || 0),
            0,
        );

        return {
            totalCashReceived,
            totalCashApplied,
            totalChange,
            expectedInDrawer: totalCashReceived - totalChange,
        };
    }
}
