# Logging & observability

## Strategy

The backend logs to **two sinks**:

1. **stdout** — captured by Docker (rotated by the `json-file` driver: `10m` × `3`). This is the
   source of truth for infra/debug and survives an app crash.
2. **PostgreSQL** (`system_logs` table) — persisted, queryable from the admin UI. Writes are
   **buffered** (flushed every `LOG_FLUSH_INTERVAL_MS`) so logging never blocks request or
   simulation paths, and a failure to persist never throws.

## Retention (industry default)

A **daily cron** (`@Cron(EVERY_DAY_AT_3AM)`, plus once on startup) applies the retention policy:

- Delete entries older than `LOG_RETENTION_DAYS` (default **3**).
- Cap the table at `LOG_MAX_ROWS` rows (default **20000**), dropping the oldest.

A manual prune is available to admins: `POST /api/system/logs/prune`.

## Levels

`LOG_LEVEL` sets the **minimum level persisted** (`verbose < debug < log < warn < error < fatal`).
Console output still follows Nest. Never log secrets, tokens, passwords or full request headers.

## Configuration

| Var | Default | Purpose |
|---|---|---|
| `LOG_DB_ENABLED` | `true` | Persist to Postgres (set `false` for in-memory only) |
| `LOG_LEVEL` | `log` | Minimum level persisted |
| `LOG_FLUSH_INTERVAL_MS` | `2000` | Buffer flush interval |
| `LOG_RETENTION_DAYS` | `3` | Delete logs older than this many days |
| `LOG_MAX_ROWS` | `20000` | Hard row cap |

## API (admin only)

- `GET /api/system/logs?limit=&level=&since=&search=` → `{ data, total, retentionDays }`
- `GET /api/system/logs/stats` → `{ count, oldest, newest, retentionDays, maxRows }`
- `POST /api/system/logs/prune` → `{ deletedByAge, deletedByCap }`

The web UI (`/settings`) and the mobile “Sistema” tab consume these.

## Implementation notes

- `AppLogger` (a `ConsoleLogger`) prints to console **and** forwards to `LogsService`.
- `LogsService` keeps a small in-memory ring buffer (fast reads / DB-down fallback) and a bounded
  flush buffer; it never routes its own errors back through the app logger.
- The `system_logs` table is indexed on `timestamp` and `level`.

## Future (cost-aware)

For longer retention, ship stdout to **CloudWatch Logs** (Docker `awslogs` driver) instead of
growing the database; keep the DB retention short (3 days) for the in-app viewer.
