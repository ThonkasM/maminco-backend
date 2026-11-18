-- CreateEnum
CREATE TYPE "RepositoryNodeKind" AS ENUM ('FOLDER', 'FILE');

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "businessDayStartMinute" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_closures" (
    "id" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "early" BOOLEAN NOT NULL DEFAULT false,
    "regeneratedCount" INTEGER NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(12,2) NOT NULL,
    "totalOrders" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "documentId" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,

    CONSTRAINT "day_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_nodes" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "RepositoryNodeKind" NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "mimeType" TEXT,
    "size" INTEGER,
    "storageKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "repository_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "day_closures_businessDate_key" ON "day_closures"("businessDate");

-- CreateIndex
CREATE INDEX "day_closures_closedAt_idx" ON "day_closures"("closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "repository_nodes_storageKey_key" ON "repository_nodes"("storageKey");

-- CreateIndex
CREATE INDEX "repository_nodes_parentId_idx" ON "repository_nodes"("parentId");

-- CreateIndex
CREATE INDEX "repository_nodes_deletedAt_idx" ON "repository_nodes"("deletedAt");

-- AddForeignKey
ALTER TABLE "day_closures" ADD CONSTRAINT "day_closures_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_nodes" ADD CONSTRAINT "repository_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "repository_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_nodes" ADD CONSTRAINT "repository_nodes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "business_settings" ("id", "businessDayStartMinute", "updatedAt") VALUES ('default', 0, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "shifts" ("id", "name", "startMinute", "endMinute", "sortOrder", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000001', 'Día', 360, 1080, 0, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'Noche', 1080, 360, 1, CURRENT_TIMESTAMP);
