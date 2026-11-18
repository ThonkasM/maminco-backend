# Order and payment rules

Single source of truth for the invariants enforced by `orders/` and `payments/`.
Pure rules live in `src/orders/domain/` and `src/payments/domain/`; use cases apply them
inside a `$transaction` holding a row lock on the order (`SELECT ... FOR UPDATE`).

## Order status (`OrderStatus`)

| From \ To | DRAFT | CLOSED | CANCELLED |
|---|---|---|---|
| DRAFT | no | yes | yes |
| CLOSED | no | no | yes |
| CANCELLED | no | no | no |

Invalid transition: 400. The update is `updateMany({ where: { id, status: <from> } })`; if it
matches no row the use case answers 409 (another operation changed the order first).

## Closing rules

- `PATCH /api/orders/:id/status` with `CLOSED` requires at least one item and
  `Σ Payment.amountApplied >= total` (L2). Otherwise 409 with a Spanish message.
- Decision: there is **no role override**. MANAGER/ADMINISTRATOR cannot force-close an unpaid order;
  they can cancel it (`CANCELLED`) or register the payment. This keeps reports and cash close
  consistent and avoids an unaudited bypass. An override would need an explicit DTO field plus an
  `OrderHistory`/`AuditLog` entry and is intentionally not implemented.
- Closing by payment (`POST /api/payments/orders/:orderId`) closes the order automatically on the
  payment that settles the balance.
- Zero-total orders (100% discount) with items can be closed without payments.

## Table state

- One open (`DRAFT`, not deleted) order per table. Enforced twice: row lock on `tables` plus an
  existence check inside the creation transaction, and the partial unique index
  `orders_tableId_open_key` (migration `20261029200000_order_integrity`). Violation: 409.
- Table becomes `OCCUPIED` when an order is created.
- On `CLOSED` or `CANCELLED` the table is set `AVAILABLE` only if no other open order exists for it
  (the table row is locked while checking).
- `orderNumber` comes from the Postgres sequence `order_number_seq` (zero-padded to 6 digits).
  Gaps are possible after rollbacks.

## Editing rules

- `addItem`, `removeItem`, `updateItemQuantity`, `applyDiscount`: order must be `DRAFT` (403
  otherwise) and must have **no payments** (409). Item mutations run in a single transaction.
- `addTip`: order must be `DRAFT` (403) and the resulting total must not fall below what was already
  paid (409) (L4/L5).
- `DELETE /api/orders/:id/items/:itemId` (and `PATCH` with `quantity < 1`, which is a removal) by a
  `WAITER` returns 403 when feature flag `waiter_can_remove_products` is `false`. A missing flag is
  treated as enabled (RF-ORD-04).
- Discounts are stored as a fixed amount; changing items afterwards does not recompute it, the total
  is clamped at 0.

## Kitchen status (`OrderKitchenStatus`)

Matches `maminco-docs/docs/diagramas/plantuml/estados-cocina.puml`.

| API transition | Allowed |
|---|---|
| PENDING -> PREPARING | yes |
| PREPARING -> READY | yes |
| READY -> PREPARING (correction) | yes |
| any other (including skipping steps) | 400 |
| same status | no-op, no event |

`READY -> PENDING` happens only automatically when an item is added. Only `DRAFT` orders accept
kitchen changes.

## Payments (`allocatePayment`)

Inputs: pending balance (`total - Σ amountApplied`), amount received, `PaymentMethod.code`, `isExtraTip`.

- Pending balance `<= 0`: 409, nothing written (L3/L4).
- Amount `<= 0`: 200 with `status: "ERROR"`, `error: "INVALID_AMOUNT"` (existing contract).
- Amount `< pending`: partial payment, order stays `DRAFT`.
- Amount `>= pending`: final payment, order closes, `amountApplied = pending`.
  - `CASH`: excess is `changeAmount`.
  - other codes: excess without `isExtraTip` returns `PENDING_CONFIRMATION`; with `isExtraTip` the
    excess is stored as `tipAmount`.
- All amounts are `Prisma.Decimal`, rounded `ROUND_HALF_UP` to 2 decimals.
- Order lookup, balance read, payment insert, order close and table release happen in one
  transaction after locking the order row; a concurrent payment waits and sees the new balance.
