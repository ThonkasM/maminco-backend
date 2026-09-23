import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersGateway } from './orders.gateway';
import { PrintingService } from '../printing/printing.service';
import {
  CreateOrderDto,
  AddOrderItemDto,
  UpdateOrderItemDto,
  ChangeOrderStatusDto,
  ApplyDiscountDto,
  OrderResponseDto,
  ListOrdersQueryDto,
  PaginatedOrderResponseDto,
} from './dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private ordersGateway: OrdersGateway,
    private printingService: PrintingService,
  ) {}

  /**
   * Genera el próximo número de orden correlativo
   */
  private async generateOrderNumber(): Promise<string> {
    const lastOrder = await this.prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });

    if (!lastOrder) {
      return '000001';
    }

    const lastNumber = parseInt(lastOrder.orderNumber, 10);
    const nextNumber = lastNumber + 1;
    return nextNumber.toString().padStart(6, '0');
  }

  /**
   * Calcula el subtotal de una orden
   */
  private calculateSubtotal(items: any[]): number {
    return items.reduce((sum, item) => {
      const itemTotal = Number(item.unitPrice) * item.quantity;
      const itemDiscount = Number(item.discountAmount) || 0;
      return sum + itemTotal - itemDiscount;
    }, 0);
  }

  /**
   * Calcula el total final de una orden
   */
  private calculateTotal(
    subtotal: number,
    discount: number,
    tip: number,
  ): number {
    return Math.max(0, subtotal - discount + tip);
  }

  /**
   * Crea una nueva orden
   */
  async create(dto: CreateOrderDto): Promise<OrderResponseDto> {
    // Validar que la mesa existe y obtener su área
    const table = await this.prisma.table.findUnique({
      where: { id: dto.tableId },
      include: { area: true },
    });

    if (!table || table.deletedAt) {
      throw new NotFoundException('Mesa no encontrada');
    }

    if (!table.area) {
      throw new NotFoundException('Mesa no tiene área asignada');
    }

    // Validar que el usuario creador existe
    const createdByUser = await this.prisma.user.findUnique({
      where: { id: dto.createdById },
    });

    if (!createdByUser || createdByUser.deletedAt) {
      throw new NotFoundException('Usuario creador no encontrado');
    }

    // Validar usuario asistente si se proporciona
    if (dto.attendedById) {
      const attendedByUser = await this.prisma.user.findUnique({
        where: { id: dto.attendedById },
      });

      if (!attendedByUser || attendedByUser.deletedAt) {
        throw new NotFoundException('Usuario asistente no encontrado');
      }
    }

    const orderNumber = await this.generateOrderNumber();

    // Preparar items iniciales si se proporcionan
    const initialItems: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    let subtotal = 0;

    if (dto.initialItems && dto.initialItems.length > 0) {
      for (const item of dto.initialItems) {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });

        if (!product || product.deletedAt) {
          throw new NotFoundException(
            `Producto no encontrado: ${item.productId}`,
          );
        }

        if (!product.isAvailable) {
          throw new BadRequestException(
            `Producto no disponible: ${product.name}`,
          );
        }

        const unitPrice = Number(product.price);
        const itemSubtotal = unitPrice * item.quantity;
        subtotal += itemSubtotal;

        initialItems.push({
          product: { connect: { id: item.productId } },
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          subtotal: new Prisma.Decimal(itemSubtotal),
          notes: item.notes,
          discountAmount: new Prisma.Decimal(0),
          addedBy: { connect: { id: dto.createdById } },
        });
      }
    }

    // Crear la orden con items iniciales
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        status: 'BORRADOR',
        serviceType: table.area.name, // Heredar de Area.name
        table: { connect: { id: dto.tableId } },
        createdBy: { connect: { id: dto.createdById } },
        attendedBy: dto.attendedById
          ? { connect: { id: dto.attendedById } }
          : undefined,
        subtotal: new Prisma.Decimal(subtotal),
        discountAmount: new Prisma.Decimal(0),
        tipAmount: new Prisma.Decimal(0),
        total: new Prisma.Decimal(subtotal),
        items: {
          create: initialItems,
        },
        histories: {
          create: {
            action: 'CREATED',
            description: `Orden creada por ${createdByUser.name}`,
            user: { connect: { id: dto.createdById } },
          },
        },
      },
      include: {
        table: { include: { area: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attendedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            addedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    const response = this.mapOrderToResponse(order);

    // Emitir eventos WebSocket
    // 1. Evento específico de orden creada
    this.ordersGateway.emitOrderCreated(dto.tableId, response);

    // 2. Evento de estado completo de la mesa
    this.ordersGateway.emitTableStateUpdated(dto.tableId, response);

    // 3. Evento de cambio de estado de mesa (ahora está OCUPADA)
    this.ordersGateway.emitTableStatusChanged(dto.tableId, 'OCUPADA', {
      number: order.table?.number,
      tableName: `Mesa ${order.table?.number}`,
      areaId: order.table?.areaId,
      areaName: order.table?.area?.name,
    });

    // 4. Emitir snapshot de todas las mesas
    const allTablesState = await this.getAllTablesState();
    this.ordersGateway.emitAllTablesState(allTablesState);

    return response;
  }

  /**
   * Lista órdenes con filtros avanzados
   */
  async findAll(query: ListOrdersQueryDto): Promise<PaginatedOrderResponseDto> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    // Construir filtros
    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.tableId) {
      where.tableId = query.tableId;
    }

    if (query.serviceType) {
      where.serviceType = query.serviceType;
    }

    if (query.createdById) {
      where.createdById = query.createdById;
    }

    if (query.onlyOpen) {
      where.status = { in: ['BORRADOR'] };
    }

    // Construir orden
    const orderBy: any = {};
    if (query.sortBy) {
      orderBy[query.sortBy] = query.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          table: { include: { area: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          attendedBy: { select: { id: true, name: true, email: true } },
          closedBy: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: true,
              addedBy: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const data = orders.map((order) => this.mapOrderToResponse(order));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Obtiene una orden por ID
   */
  async findById(id: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        table: { include: { area: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attendedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            addedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    return this.mapOrderToResponse(order);
  }

  /**
   * Obtiene la orden activa (BORRADOR) de una mesa específica
   * Retorna null si no hay orden abierta en esa mesa
   */
  async getActiveOrderByTable(
    tableId: string,
  ): Promise<OrderResponseDto | null> {
    const order = await this.prisma.order.findFirst({
      where: {
        tableId,
        status: 'BORRADOR',
        deletedAt: null,
      },
      include: {
        table: { include: { area: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attendedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            addedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!order) {
      return null;
    }

    return this.mapOrderToResponse(order);
  }

  /**
   * Cambia el estado de una orden
   */
  async changeStatus(
    id: string,
    dto: ChangeOrderStatusDto,
    userId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        createdBy: true,
        table: { include: { area: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    // Validar transiciones de estado permitidas
    const validTransitions: Record<string, string[]> = {
      BORRADOR: ['CERRADO', 'CANCELADO'],
      CERRADO: ['CANCELADO'],
      CANCELADO: [],
    };

    if (!validTransitions[order.status].includes(dto.status)) {
      const message =
        order.status === 'CERRADO' && dto.status === 'CERRADO'
          ? `La orden #${order.orderNumber} ya está CERRADA. No se puede cerrar dos veces. Verifica el estado de la orden antes de intentar cerrar.`
          : `No se puede cambiar de ${order.status} a ${dto.status}`;
      throw new BadRequestException(message);
    }

    // Si se cierra la orden, validar que tenga al menos un item
    if (dto.status === 'CERRADO' && order.items.length === 0) {
      throw new BadRequestException('No se puede cerrar una orden sin items');
    }

    const closedAt = dto.status === 'CERRADO' ? new Date() : null;

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        closedAt,
        closedBy:
          dto.status === 'CERRADO' ? { connect: { id: userId } } : undefined,
        histories: {
          create: {
            action: 'STATUS_CHANGED',
            description: `Estado cambiado de ${order.status} a ${dto.status}`,
            user: { connect: { id: userId } },
          },
        },
      },
      include: {
        table: { include: { area: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attendedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            addedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    const response = this.mapOrderToResponse(updated);

    // Emitir eventos WebSocket
    // 1. Evento específico del cambio de estado
    this.ordersGateway.emitOrderStatusChanged(id, order.tableId, dto.status);

    // 2. Evento de estado completo de la mesa
    this.ordersGateway.emitTableStateUpdated(order.tableId, response);

    // 3. Si la orden se cierra, emitir que la mesa está disponible
    if (dto.status === 'CERRADO') {
      this.ordersGateway.emitTableStatusChanged(order.tableId, 'DISPONIBLE', {
        number: order.table?.number,
        tableName: `Mesa ${order.table?.number}`,
        areaId: order.table?.areaId,
        areaName: order.table?.area?.name,
      });

      // Si se solicita impresión automática al cerrar, imprimir orden
      if (dto.autoPrint) {
        this.logger.log(
          `Imprimiendo orden #${updated.orderNumber} automáticamente`,
        );

        try {
          const printResult = await this.printingService.printOrderFromDatabase(
            updated.id,
            dto.printerName,
          );

          if (printResult.success) {
            this.logger.log(
              `Orden #${updated.orderNumber} impresa exitosamente`,
            );
          } else {
            this.logger.warn(
              `Error imprimiendo orden #${updated.orderNumber}: ${printResult.message}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error durante impresión automática de orden #${updated.orderNumber}:`,
            error,
          );
        }
      }
    }

    // 4. Emitir snapshot de todas las mesas
    const allTablesState = await this.getAllTablesState();
    this.ordersGateway.emitAllTablesState(allTablesState);

    return response;
  }

  /**
   * Añade un item a una orden
   */
  async addItem(
    orderId: string,
    dto: AddOrderItemDto,
    userId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    // Solo se pueden agregar items a órdenes en estado BORRADOR
    if (order.status !== 'BORRADOR') {
      throw new ForbiddenException(
        `No se pueden agregar items a una orden ${order.status}`,
      );
    }

    // Validar que el producto existe
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (!product.isAvailable) {
      throw new BadRequestException('Producto no disponible');
    }

    // Crear el item
    const unitPrice = Number(product.price);
    const itemSubtotal = unitPrice * dto.quantity;

    const newItem = await this.prisma.orderItem.create({
      data: {
        order: { connect: { id: orderId } },
        product: { connect: { id: dto.productId } },
        quantity: dto.quantity,
        unitPrice: new Prisma.Decimal(unitPrice),
        subtotal: new Prisma.Decimal(itemSubtotal),
        discountAmount: new Prisma.Decimal(0),
        notes: dto.notes,
        addedBy: { connect: { id: userId } },
      },
      include: {
        product: { select: { name: true } },
        addedBy: { select: { id: true, name: true } },
      },
    });

    // Recalcular totales de la orden
    const updatedOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!updatedOrder) {
      throw new NotFoundException('Orden no encontrada');
    }

    const newSubtotal = this.calculateSubtotal(updatedOrder.items);
    const newTotal = this.calculateTotal(
      newSubtotal,
      Number(order.discountAmount),
      Number(order.tipAmount),
    );

    const result = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        subtotal: new Prisma.Decimal(newSubtotal),
        total: new Prisma.Decimal(newTotal),
        histories: {
          create: {
            action: 'ITEM_ADDED',
            description: `Agregado ${product.name} x${dto.quantity}`,
            metadata: {
              productId: dto.productId,
              productName: product.name,
              quantity: dto.quantity,
              unitPrice: Number(product.price),
              subtotal: itemSubtotal,
            },
            user: { connect: { id: userId } },
          },
        },
      },
      include: {
        table: { include: { area: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attendedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            addedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    const response = this.mapOrderToResponse(result);

    // Emitir eventos WebSocket
    // 1. Evento específico del item agregado
    this.ordersGateway.emitOrderItemAdded(orderId, order.tableId, {
      id: newItem.id,
      productName: newItem.product.name,
      quantity: newItem.quantity,
      addedByName: newItem.addedBy.name,
      unitPrice: Number(newItem.unitPrice),
    });

    // 2. Evento de estado completo de la mesa
    this.ordersGateway.emitTableStateUpdated(order.tableId, response);

    return response;
  }

  /**
   * Elimina un item de una orden
   */
  async removeItem(
    orderId: string,
    itemId: string,
    userId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    // Solo se pueden eliminar items de órdenes en estado BORRADOR
    if (order.status !== 'BORRADOR') {
      throw new ForbiddenException(
        `No se pueden eliminar items de una orden ${order.status}`,
      );
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException('Item no encontrado en la orden');
    }

    // Obtener el nombre del producto antes de eliminarlo
    const product = await this.prisma.product.findUnique({
      where: { id: item.productId },
      select: { name: true },
    });

    // Eliminar el item
    await this.prisma.orderItem.delete({
      where: { id: itemId },
    });

    // Recalcular totales
    const updatedOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!updatedOrder) {
      throw new NotFoundException('Orden no encontrada');
    }

    const newSubtotal = this.calculateSubtotal(updatedOrder.items);
    const newTotal = this.calculateTotal(
      newSubtotal,
      Number(order.discountAmount),
      Number(order.tipAmount),
    );

    const result = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        subtotal: new Prisma.Decimal(newSubtotal),
        total: new Prisma.Decimal(newTotal),
        histories: {
          create: {
            action: 'ITEM_REMOVED',
            description: `Eliminado ${product?.name}`,
            user: { connect: { id: userId } },
          },
        },
      },
      include: {
        table: { include: { area: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attendedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            addedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    const response = this.mapOrderToResponse(result);

    // Emitir eventos WebSocket
    // 1. Evento específico del item eliminado
    this.ordersGateway.emitOrderItemRemoved(
      orderId,
      order.tableId,
      itemId,
      product?.name || 'Producto desconocido',
    );

    // 2. Evento de estado completo de la mesa
    this.ordersGateway.emitTableStateUpdated(order.tableId, response);

    return response;
  }

  /**
   * Actualiza la cantidad de un item en una orden (sin eliminar y re-crear)
   * Preserva el ID del item y actualiza los totales in-place
   * IMPORTANTE: También actualiza quién modificó el item (addedBy)
   */
  async updateItemQuantity(
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemDto,
    userId: string,
  ): Promise<OrderResponseDto> {
    // Obtener la orden actual
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    // Solo se pueden actualizar items de órdenes en estado BORRADOR
    if (order.status !== 'BORRADOR') {
      throw new ForbiddenException(
        `No se pueden actualizar items de una orden ${order.status}`,
      );
    }

    // Encontrar el item
    const item = order.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException('Item no encontrado en la orden');
    }

    // Si la nueva cantidad es 0 o negativa, eliminar el item
    if (dto.quantity < 1) {
      return this.removeItem(orderId, itemId, userId);
    }

    // Calcular nuevo subtotal para este item
    const newItemSubtotal = Number(item.unitPrice) * dto.quantity;

    // Obtener el nombre del producto
    const product = await this.prisma.product.findUnique({
      where: { id: item.productId },
      select: { name: true },
    });

    // Actualizar el item CON el usuario que lo modificó (addedById)
    const updatedItem = await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        quantity: dto.quantity,
        subtotal: new Prisma.Decimal(newItemSubtotal),
        notes: dto.notes !== undefined ? dto.notes : undefined,
        addedBy: { connect: { id: userId } }, // ✨ IMPORTANTE: Actualizar quién modificó
      },
      include: {
        addedBy: { select: { name: true } }, // Obtener nombre del usuario que modificó
      },
    });

    // Recalcular totales de la orden
    const updatedOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!updatedOrder) {
      throw new NotFoundException('Orden no encontrada');
    }

    const newSubtotal = this.calculateSubtotal(updatedOrder.items);
    const newTotal = this.calculateTotal(
      newSubtotal,
      Number(order.discountAmount),
      Number(order.tipAmount),
    );

    // Actualizar totales de la orden
    const result = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        subtotal: new Prisma.Decimal(newSubtotal),
        total: new Prisma.Decimal(newTotal),
        histories: {
          create: {
            action: 'ITEM_QUANTITY_UPDATED',
            description: `Cantidad actualizada en item ${itemId}: ${item.quantity} → ${dto.quantity} por ${updatedItem.addedBy?.name}`,
            metadata: {
              itemId: itemId,
              productName: product?.name || 'Producto desconocido',
              oldQuantity: item.quantity,
              newQuantity: dto.quantity,
              unitPrice: Number(item.unitPrice),
              modifiedBy: updatedItem.addedBy?.name || 'Usuario',
            },
            user: { connect: { id: userId } },
          },
        },
      },
      include: {
        table: { include: { area: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attendedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            addedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    const response = this.mapOrderToResponse(result);

    // Emitir eventos WebSocket
    // 1. Evento específico de actualización de cantidad (NUEVO)
    // ✨ Usar el nombre del usuario que modificó (updatedItem.addedBy?.name)
    this.ordersGateway.emitOrderItemUpdated(
      orderId,
      order.tableId,
      itemId,
      dto.quantity,
      newItemSubtotal,
      updatedItem.addedBy?.name || 'Usuario', // Quién modificó el item
    );

    // 2. Evento de estado completo de la mesa
    this.ordersGateway.emitTableStateUpdated(order.tableId, response);

    return response;
  }

  /**
   * Aplica un descuento a la orden
   */
  async applyDiscount(
    orderId: string,
    dto: ApplyDiscountDto,
    userId: string,
  ): Promise<OrderResponseDto> {
    if (!dto.percentageDiscount && !dto.fixedDiscount) {
      throw new BadRequestException(
        'Se debe proporcionar un descuento porcentual o fijo',
      );
    }

    if (dto.percentageDiscount && dto.fixedDiscount) {
      throw new BadRequestException(
        'No se puede aplicar ambos tipos de descuento simultáneamente',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    // Solo se pueden aplicar descuentos a órdenes en estado BORRADOR
    if (order.status !== 'BORRADOR') {
      throw new ForbiddenException(
        `No se pueden aplicar descuentos a una orden ${order.status}`,
      );
    }

    let discountAmount = 0;
    const subtotal = Number(order.subtotal);

    if (dto.percentageDiscount) {
      if (dto.percentageDiscount < 0 || dto.percentageDiscount > 100) {
        throw new BadRequestException(
          'El descuento porcentual debe estar entre 0 y 100',
        );
      }
      discountAmount = Math.round(subtotal * (dto.percentageDiscount / 100));
    } else if (dto.fixedDiscount) {
      if (dto.fixedDiscount < 0) {
        throw new BadRequestException(
          'El descuento fijo no puede ser negativo',
        );
      }
      if (dto.fixedDiscount > subtotal) {
        throw new BadRequestException(
          'El descuento no puede ser mayor al subtotal',
        );
      }
      discountAmount = dto.fixedDiscount;
    }

    const newTotal = this.calculateTotal(
      subtotal,
      discountAmount,
      Number(order.tipAmount),
    );

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        discountAmount: new Prisma.Decimal(discountAmount),
        total: new Prisma.Decimal(newTotal),
        histories: {
          create: {
            action: 'DISCOUNT_APPLIED',
            description: `Descuento aplicado: ${discountAmount} - ${dto.reason || 'Sin razón'}`,
            metadata: {
              discountAmount: discountAmount,
              discountType: dto.percentageDiscount ? 'percentage' : 'fixed',
              reason: dto.reason || 'Sin descripción',
              appliedTo: subtotal,
              newTotal: newTotal,
            },
            user: { connect: { id: userId } },
          },
        },
      },
      include: {
        table: { include: { area: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attendedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            addedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    const response = this.mapOrderToResponse(updated);

    // Emitir evento WebSocket
    this.ordersGateway.emitOrderUpdated(
      orderId,
      order.tableId,
      Number(updated.total),
      Number(updated.discountAmount),
      Number(updated.tipAmount),
    );

    // Emitir estado completo de la mesa
    this.ordersGateway.emitTableStateUpdated(order.tableId, response);

    return response;
  }

  /**
   * Agrega propina a la orden
   */
  async addTip(
    orderId: string,
    tipAmount: number,
    userId: string,
  ): Promise<OrderResponseDto> {
    if (tipAmount < 0) {
      throw new BadRequestException('La propina no puede ser negativa');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    const subtotal = Number(order.subtotal);
    const discount = Number(order.discountAmount);

    const newTotal = this.calculateTotal(subtotal, discount, tipAmount);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        tipAmount: new Prisma.Decimal(tipAmount),
        total: new Prisma.Decimal(newTotal),
        histories: {
          create: {
            action: 'TIP_ADDED',
            description: `Propina agregada: ${tipAmount}`,
            metadata: {
              tipAmount: tipAmount,
              newTotal: newTotal,
              subtotal: subtotal,
            },
            user: { connect: { id: userId } },
          },
        },
      },
      include: {
        table: { include: { area: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attendedBy: { select: { id: true, name: true, email: true } },
        closedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: true,
            addedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    const response = this.mapOrderToResponse(updated);

    // Emitir eventos WebSocket
    // 1. Evento específico de actualización
    this.ordersGateway.emitOrderUpdated(
      orderId,
      order.tableId,
      Number(updated.total),
      Number(updated.discountAmount),
      Number(updated.tipAmount),
    );

    // 2. Evento de estado completo de la mesa
    this.ordersGateway.emitTableStateUpdated(order.tableId, response);

    return response;
  }

  /**
   * Obtiene estadísticas de ingresos
   */
  async getRevenueStats(where?: Prisma.OrderWhereInput): Promise<{
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    totalDiscount: number;
    totalTip: number;
  }> {
    const orders = await this.prisma.order.findMany({
      where: { status: 'CERRADO', ...where },
      select: {
        total: true,
        discountAmount: true,
        tipAmount: true,
      },
    });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );
    const totalDiscount = orders.reduce(
      (sum, order) => sum + Number(order.discountAmount),
      0,
    );
    const totalTip = orders.reduce(
      (sum, order) => sum + Number(order.tipAmount),
      0,
    );
    const averageOrderValue =
      totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    return {
      totalOrders,
      totalRevenue,
      averageOrderValue,
      totalDiscount,
      totalTip,
    };
  }

  /**
   * Obtiene órdenes agrupadas por estado
   */
  async getOrdersByStatus(): Promise<Array<{ status: string; count: number }>> {
    const result = await this.prisma.order.groupBy({
      by: ['status'],
      _count: true,
    });

    return result.map((item) => ({
      status: item.status,
      count: item._count,
    }));
  }

  /**
   * Obtiene órdenes agrupadas por tipo de servicio
   */
  async getOrdersByServiceType(): Promise<
    Array<{ serviceType: string; count: number; totalRevenue: number }>
  > {
    const result = await this.prisma.order.groupBy({
      by: ['serviceType'],
      _count: true,
      _sum: { total: true },
    });

    return result.map((item) => ({
      serviceType: item.serviceType,
      count: item._count,
      totalRevenue: Number(item._sum.total) || 0,
    }));
  }

  /**
   * Mapea una orden de la BD a OrderResponseDto
   */
  private mapOrderToResponse(order: any): OrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      serviceType: order.serviceType,
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      tipAmount: Number(order.tipAmount),
      total: Number(order.total),
      tableId: order.tableId,
      tableName: order.table?.number.toString(),
      areaId: order.table?.areaId,
      createdById: order.createdById,
      createdByName: order.createdBy?.name,
      attendedById: order.attendedById,
      attendedByName: order.attendedBy?.name,
      closedById: order.closedById,
      closedByName: order.closedBy?.name,
      items: order.items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discountAmount: Number(item.discountAmount),
        subtotal: Number(item.subtotal),
        notes: item.notes,
        addedById: item.addedById,
        addedByName: item.addedBy?.name,
        createdAt: item.createdAt,
      })),
      itemCount: order.items.length,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      closedAt: order.closedAt,
    };
  }

  /**
   * Obtiene el estado de todas las mesas con sus órdenes activas
   * Utilizado para sincronización en tiempo real del dashboard
   */
  async getAllTablesState(): Promise<any[]> {
    const tables = await this.prisma.table.findMany({
      where: { deletedAt: null },
      include: {
        area: { select: { id: true, name: true } },
        orders: {
          where: {
            status: 'BORRADOR',
            deletedAt: null,
          },
          include: {
            items: true,
            createdBy: { select: { name: true } },
          },
          take: 1, // Solo la orden activa más reciente
        },
      },
      orderBy: { number: 'asc' },
    });

    return tables.map((table) => {
      const activeOrder = table.orders[0];
      return {
        id: table.id,
        number: table.number,
        status: table.status,
        areaId: table.area?.id,
        areaName: table.area?.name,
        hasActiveOrder: !!activeOrder,
        currentOrderTotal: activeOrder ? Number(activeOrder.total) : 0,
        itemCount: activeOrder ? activeOrder.items.length : 0,
        createdByName: activeOrder?.createdBy?.name,
        createdAt: activeOrder?.createdAt,
      };
    });
  }

  /**
   * Obtiene el estado de una mesa específica
   */
  async getTableState(tableId: string): Promise<any> {
    const table = await this.prisma.table.findUnique({
      where: { id: tableId },
      include: {
        area: { select: { id: true, name: true } },
        orders: {
          where: {
            status: 'BORRADOR',
            deletedAt: null,
          },
          include: {
            items: true,
            createdBy: { select: { name: true } },
          },
          take: 1,
        },
      },
    });

    if (!table) {
      throw new NotFoundException('Mesa no encontrada');
    }

    const activeOrder = table.orders[0];
    return {
      id: table.id,
      number: table.number,
      status: table.status,
      areaId: table.area?.id,
      areaName: table.area?.name,
      hasActiveOrder: !!activeOrder,
      currentOrderTotal: activeOrder ? Number(activeOrder.total) : 0,
      itemCount: activeOrder ? activeOrder.items.length : 0,
      createdByName: activeOrder?.createdBy?.name,
      createdAt: activeOrder?.createdAt,
    };
  }

  /**
   * Obtiene el historial completo de una orden con todos los detalles
   * Incluye: quién hizo qué, cuándo, y metadata del cambio
   * Soporta paginación con page y limit
   */
  async getOrderHistory(
    orderId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<any> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        table: {
          select: {
            number: true,
            area: { select: { name: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    // Validar límites de paginación
    if (page < 1) page = 1;
    if (limit < 1 || limit > 500) limit = 50;

    const skip = (page - 1) * limit;

    // Obtener total de registros
    const total = await this.prisma.orderHistory.count({
      where: { orderId },
    });

    // Obtener registros paginados
    const history = await this.prisma.orderHistory.findMany({
      where: { orderId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      tableName: `Mesa ${order.table?.number}`,
      areaName: order.table?.area?.name,
      createdAt: order.createdAt,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      history: history.map((entry) => ({
        id: entry.id,
        action: entry.action,
        description: entry.description,
        metadata: entry.metadata,
        user: {
          id: entry.user.id,
          name: entry.user.name,
          email: entry.user.email,
        },
        createdAt: entry.createdAt,
        timestamp: new Date(entry.createdAt).toLocaleTimeString('es-BO', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      })),
    };
  }

  /**
   * Obtiene un timeline visual simplificado de la orden
   * Ideal para mostrar en UI con emojis y formato legible
   * Procesa la metadata para mostrar nombres de productos en lugar de IDs
   * Soporta paginación con page y limit
   */
  async getOrderHistoryTimeline(
    orderId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<any> {
    const orderHistory = await this.getOrderHistory(orderId, page, limit);

    // Obtener los items de la orden para poder mapear IDs a nombres
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    const timeline = orderHistory.history.map((entry: any) => {
      let emoji = '📝';
      let actionLabel = entry.action;
      let detail = entry.description;

      // Procesar según el tipo de acción
      switch (entry.action) {
        case 'CREATED':
          emoji = '📝';
          actionLabel = 'Orden creada';
          detail = `Mesa ${orderHistory.tableName?.replace('Mesa ', '')} - ${orderHistory.areaName}`;
          break;

        case 'ITEM_ADDED':
          emoji = '➕';
          actionLabel = 'Agregado';
          // Extraer nombre del producto de la metadata si existe
          if (entry.metadata && entry.metadata.productName) {
            detail = `${entry.metadata.productName} x${entry.metadata.quantity}`;
          } else {
            // Fallback: extraer del descripción
            detail = entry.description;
          }
          break;

        case 'ITEM_REMOVED':
          emoji = '➖';
          actionLabel = 'Eliminado';
          if (entry.metadata && entry.metadata.productName) {
            detail = `${entry.metadata.productName}`;
          } else {
            detail = entry.description;
          }
          break;

        case 'ITEM_QUANTITY_UPDATED':
          emoji = '✏️';
          actionLabel = 'Cantidad actualizada';
          // Mostrar: "PRODUCTO x(oldQty) → x(newQty)"
          if (entry.metadata && entry.metadata.productName) {
            const oldQty = entry.metadata.oldQuantity || '?';
            const newQty = entry.metadata.newQuantity || '?';
            detail = `${entry.metadata.productName} x${oldQty} → x${newQty}`;
          } else {
            detail = entry.description;
          }
          break;

        case 'DISCOUNT_APPLIED':
          emoji = '💰';
          actionLabel = 'Descuento';
          if (entry.metadata) {
            const amount = entry.metadata.discountAmount || 0;
            const reason = entry.metadata.reason || 'Sin descripción';
            detail = `${reason} (-${amount} Bs)`;
          } else {
            detail = entry.description;
          }
          break;

        case 'TIP_ADDED':
          emoji = '🎁';
          actionLabel = 'Propina';
          if (entry.metadata && entry.metadata.tipAmount) {
            detail = `+${entry.metadata.tipAmount} Bs`;
          } else {
            detail = entry.description;
          }
          break;

        case 'STATUS_CHANGED':
          emoji = '✅';
          actionLabel = 'Estado cambiado';
          if (entry.metadata) {
            const oldStatus = entry.metadata.oldStatus || '?';
            const newStatus = entry.metadata.newStatus || '?';
            detail = `${oldStatus} → ${newStatus}`;
          } else {
            detail = entry.description;
          }
          break;

        default:
          detail = entry.description;
      }

      return {
        id: entry.id,
        timestamp: entry.timestamp,
        time: entry.createdAt,
        user: entry.user.name,
        emoji,
        action: actionLabel,
        description: entry.description,
        detail: detail,
        metadata: entry.metadata,
      };
    });

    return {
      id: orderHistory.id,
      orderNumber: orderHistory.orderNumber,
      status: orderHistory.status,
      tableName: orderHistory.tableName,
      areaName: orderHistory.areaName,
      createdAt: orderHistory.createdAt,
      pagination: orderHistory.pagination,
      timelineCount: timeline.length,
      timeline,
    };
  }
}
