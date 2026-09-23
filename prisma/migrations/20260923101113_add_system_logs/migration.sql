-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "context" TEXT,
    "message" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_logs_timestamp_idx" ON "system_logs"("timestamp");

-- CreateIndex
CREATE INDEX "system_logs_level_idx" ON "system_logs"("level");
