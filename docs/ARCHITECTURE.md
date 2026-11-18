# Backend architecture

Pragmatic Clean Architecture applied to modules with business rules (`orders`, `payments`).
Simple CRUD modules (areas, categories, products, tables, users) keep the flat
controller/service layout. `printing` and `reports` are handled separately.

## Layers and dependency rule

```
presentation  ->  application  ->  domain
infrastructure -> application (implements ports) -> domain
```

| Layer | Location | May import | Must not import |
|---|---|---|---|
| domain | `*/domain` | `common/money`, `Prisma.Decimal` (value type only) | Nest, PrismaService, sockets, DTOs |
| application | `*/application` (ports, use cases, query service) | domain, DTOs, `@nestjs/common` exceptions/DI | PrismaService, gateways, concrete infrastructure |
| infrastructure | `*/infrastructure` | application ports, Prisma, gateways, other services | controllers |
| presentation | controllers, gateways, `dto/` | application (use cases, query service) | PrismaService, infrastructure |

Use cases throw Nest HTTP exceptions (pragmatic choice); domain functions return values/results.
Events are published only after the transaction commits, through a port; the socket adapter swallows
and logs emission errors so a client-side hiccup never fails a committed write.

## Orders

```
src/orders/
  domain/
    order-totals.ts            subtotal, total, discount, pending balance, order number
    order-status.machine.ts    DRAFT -> CLOSED|CANCELLED, CLOSED -> CANCELLED
    kitchen-status.machine.ts  PENDING -> PREPARING -> READY (+ READY -> PREPARING)
  application/
    ports/
      order.repository.ts          OrderRepository + OrderTransaction (token ORDER_REPOSITORY)
      order-query.repository.ts    read side (token ORDER_QUERY_REPOSITORY)
      order-events.publisher.ts    OrderEvent union (token ORDER_EVENTS_PUBLISHER)
      order-receipt.printer.ts     auto-print on close (token ORDER_RECEIPT_PRINTER)
    use-cases/                 create-order, change-order-status, change-kitchen-status,
                               add-order-item, update-order-item, remove-order-item,
                               apply-discount, add-tip
    orders-query.service.ts    reads: list, get, kitchen, tables state, history, stats
    order-timeline.ts          history -> timeline formatting
    order-guards.ts            assertEditable (DRAFT + no payments)
    testing/fakes.ts           in-memory repository and publisher for unit tests
  infrastructure/
    prisma-order.repository.ts        transactional writes, row locks
    prisma-order-query.repository.ts  reads, aggregates
    order.mapper.ts                   single ORDER_INCLUDE + typed mapOrderToResponse
    order-locks.ts                    lock order/table rows, release table if idle
    socket-order-events.publisher.ts  OrderEvent -> OrdersGateway rooms/events
    printing-order-receipt.printer.ts wraps PrintingService.printOrderFromDatabase
  orders.controller.ts, admin-orders.controller.ts, orders.gateway.ts, dto/   presentation
```

## Payments

```
src/payments/
  domain/payment-allocation.ts, overpayment-policy.ts   (Strategy by PaymentMethod.code)
  application/ports/            payment.repository.ts, payment-events.publisher.ts
  application/use-cases/        process-payment.use-case.ts
  infrastructure/               prisma-payment.repository.ts, socket-payment-events.publisher.ts
  payments.service.ts, payment-methods.service.ts, cash-denominations.service.ts   (flat CRUD/queries)
```

`ProcessPaymentUseCase` reuses the orders ports (`ORDER_REPOSITORY`, `ORDER_EVENTS_PUBLISHER`, both
exported by `OrdersModule`) to broadcast the closed order, and `orders/infrastructure/order-locks.ts`
so payments and order edits lock the same rows in the same way.

Flow of `ProcessPaymentUseCase.execute`: the payment method lookup starts before the transaction and runs
in parallel; `lockOrder` reads the order, creator and paid total in one `SELECT ... FOR UPDATE OF o`;
`allocatePayment` resolves any excess through `overpaymentPolicyFor(code)` (cash gives change, other codes
ask for tip confirmation); events go out after commit through a queue that returns immediately.

`printing/application/ticket-formatters/order-document.template.ts` is a Template Method shared by the
order ticket and the payment receipt. Diagrams live in `maminco-docs` (Annex A, sections 4.4 and 4.5).

## Adding a use case

1. Put pure rules in `domain/` first and cover them with a table-driven spec.
2. Add the needed persistence operations to the `OrderTransaction` port (and the Prisma
   implementation); reads go to `OrderQueryRepository`.
3. Create `application/use-cases/<name>.use-case.ts`: `@Injectable()`, inject ports with
   `@Inject(TOKEN)` (`import type` for the interface), do all writes inside
   `repository.transaction(tx => ...)` starting with `tx.lockOrder(id)`, then `findView` and
   `events.publish(...)` after commit. Add a new `OrderEvent` variant if clients need it and map it in
   `SocketOrderEventsPublisher`.
4. Register the provider in `orders.module.ts`, inject it in the controller; keep HTTP routes, DTOs
   and socket events as defined in `../contratos.md`.
5. Unit-test with `FakeOrderRepository`/`FakeOrderEvents` (`application/testing/fakes.ts`).

## Database support

Migration `20261029200000_order_integrity`: partial unique index `orders_tableId_open_key`
(one open order per table) and sequence `order_number_seq`. It aborts with an explicit message if
duplicate open orders already exist. Business rules: `docs/ORDER-RULES.md`.
