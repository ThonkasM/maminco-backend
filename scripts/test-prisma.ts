import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("🔗 Conectando a la base de datos...");

        // Test de conexión simple
        await prisma.$queryRaw`SELECT 1`;
        console.log("✅ Conexión exitosa a PostgreSQL");

        // Contar registros en cada tabla (si existen)
        try {
            const userCount = await prisma.user.count();
            console.log(`📊 Usuarios: ${userCount}`);
        } catch (e) {
            console.log("⚠️ No se pudo contar usuarios (tabla vacía o no existe)");
        }

        try {
            const categoryCount = await prisma.category.count();
            console.log(`📊 Categorías: ${categoryCount}`);
        } catch (e) {
            console.log("⚠️ No se pudo contar categorías");
        }

        try {
            const productCount = await prisma.product.count();
            console.log(`📊 Productos: ${productCount}`);
        } catch (e) {
            console.log("⚠️ No se pudo contar productos");
        }

        try {
            const orderCount = await prisma.order.count();
            console.log(`📊 Pedidos: ${orderCount}`);
        } catch (e) {
            console.log("⚠️ No se pudo contar pedidos");
        }

        try {
            const tableCount = await prisma.table.count();
            console.log(`📊 Mesas: ${tableCount}`);
        } catch (e) {
            console.log("⚠️ No se pudo contar mesas");
        }

        console.log("\n✨ Prisma Client está funcionando correctamente!");
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
