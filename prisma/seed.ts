import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Seed para crear:
 * 1. Métodos de pago por defecto (EFECTIVO, TRANSFERENCIA, TARJETA)
 * 2. Denominaciones de efectivo en Bolivianos (1, 2, 5, 10, 20, 50, 100, 200)
 * 3. Usuarios de prueba (uno por rol) para navegar todas las pantallas
 */
async function main() {
    console.log('🌱 Iniciando seed de métodos de pago y denominaciones...\n');

    try {
        // ==========================================
        // 1. CREAR MÉTODOS DE PAGO
        // ==========================================
        console.log('📝 Creando métodos de pago...');

        const paymentMethods = [
            {
                name: 'EFECTIVO',
                code: 'CASH',
                description:
                    'Pago en efectivo con monedas y billetes en Bolivianos',
                isActive: true,
            },
            {
                name: 'TRANSFERENCIA BANCARIA',
                code: 'TRANSFER',
                description: 'Transferencia bancaria o código QR',
                isActive: true,
            },
            {
                name: 'TARJETA',
                code: 'CARD',
                description: 'Tarjeta de crédito o débito',
                isActive: true,
            },
        ];

        for (const method of paymentMethods) {
            // Verificar si ya existe
            const existing = await prisma.paymentMethod.findFirst({
                where: { code: method.code },
            });

            if (existing) {
                console.log(`  ✓ Método "${method.name}" ya existe`);
            } else {
                await prisma.paymentMethod.create({ data: method });
                console.log(`  ✓ Creado método "${method.name}"`);
            }
        }

        // ==========================================
        // 2. CREAR DENOMINACIONES DE EFECTIVO
        // ==========================================
        console.log('\n💰 Creando denominaciones de efectivo...');

        // Monedas bolivianas
        // Nota: Estas denominaciones ahora son totalmente administrables
        // Los administradores pueden agregar/quitar denominaciones según cambios económicos
        const denominations = [
            // MONEDAS (COINS)
            { value: 1, type: 'COIN' },
            { value: 2, type: 'COIN' },
            { value: 5, type: 'COIN' },
            { value: 10, type: 'COIN' },

            // BILLETES (BILLS)
            { value: 20, type: 'BILL' },
            { value: 50, type: 'BILL' },
            { value: 100, type: 'BILL' },
            { value: 200, type: 'BILL' },
        ];

        for (const denom of denominations) {
            // Verificar si ya existe
            const existing = await prisma.cashDenomination.findUnique({
                where: {
                    value_type: {
                        value: denom.value.toString(),
                        type: denom.type,
                    },
                },
            });

            if (existing) {
                console.log(`  ✓ Denominación Bs ${denom.value} (${denom.type}) ya existe`);
            } else {
                await prisma.cashDenomination.create({
                    data: {
                        value: denom.value,
                        type: denom.type,
                        quantity: 0, // Inicialmente vacío
                        isActive: true,
                    },
                });
                console.log(`  ✓ Creada denominación Bs ${denom.value} (${denom.type})`);
            }
        }

        // ==========================================
        // 3. CREAR USUARIOS DE PRUEBA (UNO POR ROL)
        // ==========================================
        console.log('\n👤 Creando usuarios de prueba...');

        const testUsers: Array<{
            email: string;
            name: string;
            role: UserRole;
            password: string;
        }> = [
            {
                email: 'admin@maminco.test',
                name: 'Admin de Prueba',
                role: UserRole.ADMINISTRATOR,
                password: 'Admin1234',
            },
            {
                email: 'gerente@maminco.test',
                name: 'Gerente de Prueba',
                role: UserRole.MANAGER,
                password: 'Gerente1234',
            },
            {
                email: 'cajero@maminco.test',
                name: 'Cajero de Prueba',
                role: UserRole.CASHIER,
                password: 'Cajero1234',
            },
            {
                email: 'mesero@maminco.test',
                name: 'Mesero de Prueba',
                role: UserRole.WAITER,
                password: 'Mesero1234',
            },
        ];

        for (const testUser of testUsers) {
            const hashedPassword = await bcrypt.hash(testUser.password, 10);

            await prisma.user.upsert({
                where: { email: testUser.email },
                update: {},
                create: {
                    email: testUser.email,
                    name: testUser.name,
                    role: testUser.role,
                    password: hashedPassword,
                    isActive: true,
                },
            });

            console.log(
                `  ✓ Usuario ${testUser.email} (${testUser.role}) listo`,
            );
        }

        console.log('\n┌─────────────────────────────────────────────────────────┐');
        console.log('│ Credenciales de prueba                                   │');
        console.log('├─────────────────────────────────────────────────────────┤');
        for (const testUser of testUsers) {
            console.log(
                `│ ${testUser.email.padEnd(24)} / ${testUser.password.padEnd(12)} ${testUser.role.padEnd(13)} │`,
            );
        }
        console.log('└─────────────────────────────────────────────────────────┘');

    } catch (error) {
        console.error('❌ Error durante el seed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
