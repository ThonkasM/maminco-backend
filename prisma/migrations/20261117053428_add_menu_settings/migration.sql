-- CreateTable
CREATE TABLE "menu_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "menu_settings" ("id", "note", "updatedAt")
VALUES ('default', 'Todos los platos vienen acompañados de arroz, yuca frita, plátano frito, ensaladas, escabeche de poroto y llajua', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
