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
  `$transaction` after locking the order row (`SELECT ... FOR UPDATE`). Status changes use a
  conditional `updateMany({ where: { id, status: <from> } })`.
- **Order/payment rules** live in `docs/ORDER-RULES.md` (one DRAFT per table, no item edits once
  payments exist, manual close requires full payment, kitchen state machine, waiter removal flag).
- `Table.status` is persisted (`OCCUPIED` on order creation, `AVAILABLE` on close/cancel only when no
  other DRAFT order remains).
- Payment method behavior keys off `PaymentMethod.code` (`CASH`/`TRANSFER`/`CARD`), never `.name`.
- Prisma is provided by a single `@Global()` `PrismaModule`; do not re-provide `PrismaService` in
  feature modules.
- Socket.io gateways authenticate the handshake through the shared `WsAuthService` (never `PrismaService`
  directly), verify the user is active, and emit to rooms
  (`table-<id>`, `order-<id>`, `tables:status`) — never `server.emit` globally.
- `prisma.config.ts` (new-style) drives the CLI and holds the seed command.
- **Logs:** `AppLogger` prints to stdout and forwards to `LogsService`, which persists to
  `system_logs` (buffered, non-blocking) with a 3-day retention cron. See `docs/LOGGING.md`.
  Never log secrets/tokens/headers.

## Layout

Modules with business rules (`orders`, `payments`) follow Clean Architecture; see
`docs/ARCHITECTURE.md`:

```
src/<module>/{domain/, application/{ports/,use-cases/}, infrastructure/, <module>.controller.ts,
              <module>.gateway.ts, <module>.module.ts, dto/, index.ts}
```

- `domain/`: pure functions/state machines, no Nest/Prisma services (unit-tested without DB).
- `application/`: use cases depend on ports (`ORDER_REPOSITORY`, `ORDER_EVENTS_PUBLISHER`, ...),
  never on `PrismaService` or gateways. Events are published after commit.
- `infrastructure/`: Prisma repositories, socket publishers, adapters. Controllers inject use cases.
- `src/architecture.spec.ts` enforces the dependency rule: `domain/` must not import `@nestjs/*`, DTOs,
  infrastructure, gateways, controllers or `PrismaService`; `application/` must not import
  infrastructure, gateways, controllers or `PrismaService`.
- **Patterns:** payment overpayment is a Strategy (`payments/domain/overpayment-policy.ts`, keyed by
  `PaymentMethod.code`; register new methods there, do not branch in `allocatePayment`). ESC/POS documents
  extend `OrderDocumentTemplate` (Template Method). Keep `OrderEventsPublisher.publish` non-blocking: it
  queues and returns, snapshots are coalesced.
- **Insights (`src/insights`):** LLMs never touch the DB; they only call MCP tools (`infrastructure/mcp`)
  that reuse existing services. Models sit behind `LlmPort`; add a provider by registering a factory in
  `llm.providers.ts` (OpenAI-compatible ones need only env vars). Charts are built deterministically from
  tool datasets (`buildChartSpec`); alert rules are pure domain code. Voice is gated by flag
  `voice_interaction`; destructive actions need a single-use confirmation token. See
  `maminco-docs/docs/anexo-c-insights-mcp-voz.md`.
- **Notifications (`src/notifications`):** `NotificationsService.publish` fans out one receipt per user
  and pushes through `PushChannel` implementations (`WebPushChannel` with VAPID, `ExpoPushChannel`);
  add a channel by implementing the port and registering it in `PUSH_CHANNELS`. System events call
  `publishAutomatic(type, content)`, which honors the `notification_rules` row (defaults in
  `domain/notification-rules.ts`). Producers: `ProductsService` (price/availability), `MenuService`,
  `AlertNotifier` (critical monitoring alerts, every 5 min). Public menu: `GET /api/public/menu`.
- **Latency:** inside a `$transaction` holding a row lock, keep round trips minimal; do static lookups
  (payment method) outside it.

Simple CRUD modules keep `src/<domain>/{<domain>.controller.ts,<domain>.service.ts,<domain>.module.ts,dto/,index.ts}`.
Cross-cutting pieces live in `src/common/` and `src/config/`.
