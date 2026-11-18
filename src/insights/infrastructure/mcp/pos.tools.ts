import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../../../auth/auth-user';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrdersQueryService } from '../../../orders/application/orders-query.service';
import { AddOrderItemUseCase } from '../../../orders/application/use-cases/add-order-item.use-case';
import { CreateOrderUseCase } from '../../../orders/application/use-cases/create-order.use-case';
import { RemoveOrderItemUseCase } from '../../../orders/application/use-cases/remove-order-item.use-case';
import { UpdateOrderItemUseCase } from '../../../orders/application/use-cases/update-order-item.use-case';
import type { OrderResponseDto } from '../../../orders/dto';
import { searchMenu } from '../../domain/menu-match';
import type { PendingAction } from '../../application/ports/tool-client.port';
import { errorResult, jsonResult, messageOf } from './tool-helpers';

export interface PosDeps {
  prisma: PrismaService;
  queries: OrdersQueryService;
  createOrder: CreateOrderUseCase;
  addItem: AddOrderItemUseCase;
  updateItem: UpdateOrderItemUseCase;
  removeItem: RemoveOrderItemUseCase;
}

export interface PosContext {
  actor: AuthUser;
  areaId?: string;
  allowDestructive: boolean;
  pending: PendingAction[];
}

const tableNumber = z
  .number()
  .int()
  .min(0)
  .max(999)
  .describe('Número de mesa dicho por el usuario');

export function registerPosTools(
  server: McpServer,
  deps: PosDeps,
  ctx: PosContext,
): void {
  const actor = { id: ctx.actor.sub, role: ctx.actor.role };

  const findTable = async (number: number) => {
    const all = await deps.prisma.table.findMany({
      where: { number, deletedAt: null, isActive: true },
      include: { area: { select: { name: true } } },
    });
    if (all.length === 0)
      throw new NotFoundException(`No existe la mesa ${number}.`);
    const preferred = ctx.areaId
      ? all.filter((table) => table.areaId === ctx.areaId)
      : [];
    const tables = preferred.length > 0 ? preferred : all;
    if (tables.length > 1) {
      throw new NotFoundException(
        `Hay varias mesas ${number} (${tables.map((t) => t.area?.name ?? 'sin área').join(', ')}). Indica el área.`,
      );
    }
    return tables[0];
  };

  const activeOrder = async (number: number) => {
    const table = await findTable(number);
    return { table, order: await deps.queries.getActiveOrderByTable(table.id) };
  };

  const view = (order: OrderResponseDto | null) =>
    order
      ? {
          id: order.id,
          orderNumber: order.orderNumber,
          total: order.total,
          items: order.items.map((i) => ({
            productId: i.productId,
            name: i.productName,
            quantity: i.quantity,
            subtotal: i.subtotal,
          })),
        }
      : null;

  const write = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
  const guard = <T>(work: () => Promise<T>) =>
    work().then(
      (payload) => jsonResult(payload as Record<string, unknown>),
      (error: unknown) => errorResult(messageOf(error)),
    );

  server.registerTool(
    'search_menu',
    {
      title: 'Buscar en el menú',
      description:
        'Busca productos por nombre hablado (tolera plurales y tildes). Devuelve coincidencias con id, precio y puntuación.',
      inputSchema: { query: z.string().min(1).max(80) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ query }) =>
      guard(async () => {
        const products = await deps.prisma.product.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true, price: true, isAvailable: true },
        });
        const matches = searchMenu(
          products.map((p) => ({
            id: p.id,
            name: p.name,
            price: Number(p.price),
            available: p.isAvailable,
          })),
          query,
        );
        return { datasets: [], facts: { query, matches } };
      }),
  );

  server.registerTool(
    'get_table_order',
    {
      title: 'Ver la orden de una mesa',
      description:
        'Devuelve la orden abierta de la mesa (productos, cantidades y total) o null si no hay.',
      inputSchema: { tableNumber },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ tableNumber: number }) =>
      guard(async () => {
        const { order } = await activeOrder(number);
        return {
          datasets: [],
          facts: { tableNumber: number, order: view(order) },
        };
      }),
  );

  server.registerTool(
    'open_table_order',
    {
      title: 'Abrir mesa',
      description:
        'Abre una orden en la mesa. Si ya hay una orden abierta, la reutiliza.',
      inputSchema: { tableNumber },
      annotations: { ...write, idempotentHint: true },
    },
    ({ tableNumber: number }) =>
      guard(async () => {
        const { table, order } = await activeOrder(number);
        if (order) {
          return {
            ok: true,
            summary: `La mesa ${number} ya tenía la orden ${order.orderNumber}`,
            order: view(order),
          };
        }
        const created = await deps.createOrder.execute(
          { tableId: table.id },
          ctx.actor.sub,
        );
        return {
          ok: true,
          summary: `Abrí la mesa ${number}`,
          order: view(created),
        };
      }),
  );

  server.registerTool(
    'add_item',
    {
      title: 'Agregar producto',
      description:
        'Agrega un producto (por id de search_menu) a la orden abierta de la mesa.',
      inputSchema: {
        tableNumber,
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().max(200).optional(),
      },
      annotations: write,
    },
    ({ tableNumber: number, productId, quantity, notes }) =>
      guard(async () => {
        const { order } = await activeOrder(number);
        if (!order)
          throw new NotFoundException(
            `La mesa ${number} no tiene una orden abierta. Ábrela primero.`,
          );
        const updated = await deps.addItem.execute(
          order.id,
          { productId, quantity, notes },
          ctx.actor.sub,
        );
        const line = updated.items.find((i) => i.productId === productId);
        return {
          ok: true,
          summary: `Agregué ${quantity}× ${line?.productName ?? 'producto'} a la mesa ${number}`,
          order: view(updated),
        };
      }),
  );

  server.registerTool(
    'set_item_quantity',
    {
      title: 'Cambiar cantidad',
      description:
        'Fija la cantidad de un producto ya pedido. Con cantidad 0 equivale a quitarlo y pide confirmación.',
      inputSchema: {
        tableNumber,
        productId: z.string().uuid(),
        quantity: z.number().int().min(0).max(100),
      },
      annotations: { ...write, idempotentHint: true },
    },
    ({ tableNumber: number, productId, quantity }) =>
      guard(async () => {
        const { order } = await activeOrder(number);
        if (!order)
          throw new NotFoundException(
            `La mesa ${number} no tiene una orden abierta.`,
          );
        const item = order.items.find((i) => i.productId === productId);
        if (!item)
          throw new NotFoundException(
            `Ese producto no está en la orden de la mesa ${number}.`,
          );
        if (quantity === 0) {
          const summary = `Quitar ${item.productName} de la mesa ${number}`;
          if (!ctx.allowDestructive) {
            ctx.pending.push({
              tool: 'set_item_quantity',
              args: { tableNumber: number, productId, quantity },
              summary,
            });
            return { pending: true, summary };
          }
          const updated = await deps.removeItem.execute(
            order.id,
            item.id,
            actor,
          );
          return {
            ok: true,
            summary: `Quité ${item.productName} de la mesa ${number}`,
            order: view(updated),
          };
        }
        if (quantity === item.quantity) {
          return {
            ok: true,
            summary: `${item.productName} ya estaba en ${quantity}`,
            order: view(order),
          };
        }
        const updated = await deps.updateItem.execute(
          order.id,
          item.id,
          { quantity },
          actor,
        );
        return {
          ok: true,
          summary: `${item.productName} ahora está en ${quantity} en la mesa ${number}`,
          order: view(updated),
        };
      }),
  );

  server.registerTool(
    'remove_item',
    {
      title: 'Quitar producto',
      description:
        'Quita un producto de la orden de la mesa. Siempre pide confirmación al usuario.',
      inputSchema: { tableNumber, productId: z.string().uuid() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ tableNumber: number, productId }) =>
      guard(async () => {
        const { order } = await activeOrder(number);
        if (!order)
          throw new NotFoundException(
            `La mesa ${number} no tiene una orden abierta.`,
          );
        const item = order.items.find((i) => i.productId === productId);
        if (!item)
          throw new NotFoundException(
            `Ese producto no está en la orden de la mesa ${number}.`,
          );
        const summary = `Quitar ${item.productName} de la mesa ${number}`;
        if (!ctx.allowDestructive) {
          ctx.pending.push({
            tool: 'remove_item',
            args: { tableNumber: number, productId },
            summary,
          });
          return { pending: true, summary };
        }
        const updated = await deps.removeItem.execute(order.id, item.id, actor);
        return {
          ok: true,
          summary: `Quité ${item.productName} de la mesa ${number}`,
          order: view(updated),
        };
      }),
  );
}
