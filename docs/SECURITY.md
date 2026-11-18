# Security

## Authentication (JWT)

- Tokens are signed with `JWT_SECRET` (required, >= 32 chars; the app refuses to boot otherwise).
- Lifetime comes from a single source: `JWT_EXPIRES_IN` (seconds or a duration such as `15m`,
  `12h`, `7d`; default `12h`). It is validated in `src/config/env.validation.ts`, resolved by
  `resolveJwtExpiresIn` (`src/config/jwt.config.ts`) and applied by `JwtModule` in `AuthModule`.
  `AuthService` does not pass its own `expiresIn`.
- Payload: `sub`, `email`, `name`, `role`. `JwtStrategy` re-checks the user in the database, so
  deactivated users lose access immediately.
- Socket.io handshakes authenticate with the same token and verify the user is active, through the
  shared `WsAuthService` (`src/auth/ws-auth.service.ts`).

## Roles

`UserRole` = `ADMINISTRATOR | MANAGER | CASHIER | WAITER`. Every route uses `JwtAuthGuard` +
`RolesGuard` with an explicit `@Roles(...)` (`POST /api/auth/register` requires `ADMINISTRATOR`). Reports are restricted to `MANAGER` and
`ADMINISTRATOR`. The only unauthenticated routes are `POST /api/auth/login` and
`POST /api/auth/register-first-admin` (works only while there are no users).

## Throttling

A global `ThrottlerGuard` allows 120 requests/minute per client. `login`, `register` and
`register-first-admin` are limited to 5 requests/minute via `@Throttle`.

## Trust proxy

`main.ts` sets `trust proxy` to `1` (one hop: nginx). The throttler and logs therefore see the
real client IP from `X-Forwarded-For`. If more proxies sit in front, adjust the hop count;
never set it to `true` on an internet-facing instance.

## Headers and CORS

- `helmet()` with default headers.
- CORS origins come from `CORS_ORIGIN` (`resolveCorsOrigins`); credentials enabled; only
  `Content-Type`, `Authorization`, `Accept`, `Origin` are allowed.
- Global `ValidationPipe` (whitelist + forbidNonWhitelisted) rejects unknown body fields.

## Operations

- `enableShutdownHooks()` is on, so SIGTERM closes Prisma, schedulers and sockets cleanly.
- The `api/debug/verify-token` endpoint was removed; use `GET /api/auth/profile` instead.
- `INTERNAL_SERVICE_TOKEN` must equal the AI service's `AI_INTERNAL_SERVICE_TOKEN`.
- `npm run openapi:export [path]` writes `openapi.json` without a database (Nest preview mode).

## What is not logged

Passwords, password hashes, JWTs, `Authorization` headers, cookies and full request bodies are
never logged or persisted to `system_logs`. Log only identifiers (user id, order id) and
outcomes. See `docs/LOGGING.md`.
