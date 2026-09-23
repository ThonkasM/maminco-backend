# maminco-backend

NestJS 11 + Prisma 6 + PostgreSQL + socket.io. Source of truth for the Maminco POS. Port 3000.
Routes are under `/api/*` (controllers hardcode `@Controller('api/...')`; there is no global prefix).
Swagger UI at `/api/docs`.

## Commands

```bash
npm install
cp .env.example .env            # JWT_SECRET is REQUIRED (>= 32 chars); the app won't boot without it
npx prisma migrate deploy       # or `npx prisma migrate dev` when changing the schema
npx prisma db seed              # demo users (admin/gerente/cajero/mesero @maminco.test), methods, denominations
npm run start:dev
npm run lint                    # eslint --fix
npm test                        # jest unit (src/**/*.spec.ts)
npm run test:e2e                # jest e2e (needs a reachable Postgres; sets test env in test/setup-e2e.ts)
```

Build output is `dist/main.js` (`node dist/main`). `tsconfig.build.json` intentionally includes only
`src/**`.

## Conventions / invariants

- **English everywhere in code** (identifiers, enums, filenames). User-facing messages are Spanish.
- Global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform): unknown body fields → 400.
  Every body/query must be a DTO class; nested objects need `@ValidateNested` + `@Type`.
- Every route is guarded with `JwtAuthGuard` + `RolesGuard` and an explicit `@Roles(...)`.
  Use `ParseUUIDPipe` on UUID params.
- **Money:** use `Prisma.Decimal` inside `$transaction`; never do fresh float math on totals.
- **Atomic writes:** order creation, item mutations, status changes and payments run inside
  `$transaction`. Closing an order uses a conditional `updateMany({ where: { status: 'DRAFT' } })`.
- `Table.status` is persisted (`OCCUPIED` on order creation, `AVAILABLE` on close/cancel).
- Payment method behavior keys off `PaymentMethod.code` (`CASH`/`TRANSFER`/`CARD`), never `.name`.
- Prisma is provided by a single `@Global()` `PrismaModule`; do not re-provide `PrismaService` in
  feature modules.
- Socket.io gateways authenticate the handshake, verify the user is active, and emit to rooms
  (`table-<id>`, `order-<id>`, `tables:status`) — never `server.emit` globally.
- `prisma.config.ts` (new-style) drives the CLI and holds the seed command.
- **Logs:** `AppLogger` prints to stdout and forwards to `LogsService`, which persists to
  `system_logs` (buffered, non-blocking) with a 3-day retention cron. See `docs/LOGGING.md`.
  Never log secrets/tokens/headers.

## Layout

`src/<domain>/{<domain>.controller.ts,<domain>.service.ts,<domain>.module.ts,dto/,index.ts}`.
Cross-cutting pieces live in `src/common/` and `src/config/`.
