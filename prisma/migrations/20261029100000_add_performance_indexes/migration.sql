CREATE INDEX "orders_status_closedAt_idx" ON "orders"("status", "closedAt");

CREATE INDEX "orders_tableId_status_idx" ON "orders"("tableId", "status");

CREATE INDEX "payments_orderId_createdAt_idx" ON "payments"("orderId", "createdAt");
