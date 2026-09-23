# Money & decimals

How Maminco handles money, end to end. Follow this whenever you touch prices,
totals, payments or discounts.

## The rule

**Never use binary floating point (`number`) for money that gets persisted.**
Use the database decimal type for storage and a decimal type for arithmetic.

| Layer | Representation |
|---|---|
| PostgreSQL | `Decimal(10,2)` (`numeric(10,2)`) |
| Prisma schema | `Decimal @db.Decimal(10, 2)` |
| Backend write paths | `Prisma.Decimal` (never float math on totals) |
| Backend → API | `number` with 2 decimals (products, orders) |
| API → frontend/mobile | parse with `parseMoney()` / `toNumber()`; format with `formatCurrency()` |

## Backend

- Product prices are `Decimal @db.Decimal(10,2)`. Create/update wrap the input in
  `new Prisma.Decimal(value)`; the response mapper returns `Number(product.price)`.
- DTOs accept up to 2 decimals:
  `@IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })`.
  Amounts (payments, discounts, tips) already use `maxDecimalPlaces: 2`.
- Persisted totals (order subtotal/discount/tip/total, payments) are recomputed and stored with
  `Prisma.Decimal` inside `$transaction`. The API never accepts a client-computed total.
- It is still a known gap that some **intermediate** item math in `orders.service.ts` goes through
  `Number(...)` before being wrapped back into `Prisma.Decimal`. For exactness these should use
  `Prisma.Decimal` arithmetic (`Decimal.mul`, `.add`, `.sub`) — tracked as a follow-up.

## Prisma quirks

- Prisma serializes `Decimal` to **string** in JSON (`"250"`, `"250.5"`), which is why the client
  must always coerce. This was the cause of the "Bs. 0,00" bug.
- `Decimal` has no `*`/`+` operators: use `new Prisma.Decimal(a).mul(b)`, `.add()`, `.sub()`,
  `.toFixed(2)`.

## Frontend / mobile

- `lib/utils/money.ts` → `parseMoney(value)` (number | string | null → number) and `roundMoney`.
- `lib/utils/currency.ts` → `formatCurrency(value)` (Bolivianos, `es-BO`, 2 decimals). It accepts
  numbers or strings.
- Use money from the API as-is for display; do client-side arithmetic only for **ephemeral**
  previews (e.g. a cart running total), and never send a client total as the source of truth.

## Decimal reference (Bs.)

- Valid: `250`, `250.5`, `250.50`, `0.99`.
- Rejected by the API: `250.555` (>2 decimals), `-1`, `"abc"`, `NaN`, `Infinity`.

## Why not integer cents?

Integer minor units (store `25050` for Bs. 250.50) are also industry-valid and avoid float issues
entirely, but they require a project-wide representation change. This codebase already uses
`Decimal(10,2)` in PostgreSQL, so we keep decimals and enforce decimal-safe arithmetic instead.
