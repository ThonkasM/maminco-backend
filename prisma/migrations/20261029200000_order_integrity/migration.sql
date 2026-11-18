DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "orders"
    WHERE "status" = 'DRAFT' AND "deletedAt" IS NULL
    GROUP BY "tableId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existen mesas con mas de una orden DRAFT abierta. Cierre o cancele los duplicados antes de migrar.';
  END IF;
END $$;

CREATE UNIQUE INDEX "orders_tableId_open_key"
  ON "orders" ("tableId")
  WHERE "status" = 'DRAFT' AND "deletedAt" IS NULL;

CREATE SEQUENCE IF NOT EXISTS "order_number_seq";

SELECT setval(
  'order_number_seq',
  COALESCE(
    (SELECT MAX(CAST("orderNumber" AS BIGINT)) FROM "orders" WHERE "orderNumber" ~ '^[0-9]+$'),
    0
  ) + 1,
  false
);
