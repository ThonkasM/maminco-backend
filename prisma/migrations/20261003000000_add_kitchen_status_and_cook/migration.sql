-- AlterEnum: nuevo rol de cocina
ALTER TYPE "UserRole" ADD VALUE 'COOK';

-- CreateEnum: estado de preparación de cocina
CREATE TYPE "OrderKitchenStatus" AS ENUM ('PENDING', 'PREPARING', 'READY');

-- AlterTable: estado de cocina por orden
ALTER TABLE "orders" ADD COLUMN "kitchenStatus" "OrderKitchenStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "orders_kitchenStatus_idx" ON "orders"("kitchenStatus");
