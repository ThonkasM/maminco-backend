import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';

const execAsync = promisify(exec);

/**
 * Formatea una fecha en formato seguro para impresoras (DD/MM/YYYY HH:MM)
 */
function formatDateForPrinter(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Convierte caracteres acentuados y especiales a ASCII plain
 * Útil para impresoras que no soportan UTF-8 completamente
 */
function sanitizeForPrinter(text: string): string {
    if (!text) return '';

    const charMap: { [key: string]: string } = {
        // Vocales acentuadas
        'á': 'a',
        'à': 'a',
        'ä': 'a',
        'â': 'a',
        'ã': 'a',
        'é': 'e',
        'è': 'e',
        'ë': 'e',
        'ê': 'e',
        'í': 'i',
        'ì': 'i',
        'ï': 'i',
        'î': 'i',
        'ó': 'o',
        'ò': 'o',
        'ö': 'o',
        'ô': 'o',
        'õ': 'o',
        'ú': 'u',
        'ù': 'u',
        'ü': 'u',
        'û': 'u',
        // Mayúsculas
        'Á': 'A',
        'À': 'A',
        'Ä': 'A',
        'Â': 'A',
        'Ã': 'A',
        'É': 'E',
        'È': 'E',
        'Ë': 'E',
        'Ê': 'E',
        'Í': 'I',
        'Ì': 'I',
        'Ï': 'I',
        'Î': 'I',
        'Ó': 'O',
        'Ò': 'O',
        'Ö': 'O',
        'Ô': 'O',
        'Õ': 'O',
        'Ú': 'U',
        'Ù': 'U',
        'Ü': 'U',
        'Û': 'U',
        // Caracteres especiales
        'ñ': 'n',
        'Ñ': 'N',
        'ç': 'c',
        'Ç': 'C',
        '¿': '?',
        '¡': '!',
        'º': 'o',
        'ª': 'a',
    };

    return text
        .split('')
        .map(char => charMap[char] || char)
        .join('');
}

/**
 * Compilador de comandos ESC/POS manual
 */
class ESCPOSBuilder {
    private buffer: Buffer[] = [];

    initialize(): this {
        this.buffer.push(Buffer.from([0x1b, 0x40])); // ESC @
        return this;
    }

    align(align: 'left' | 'center' | 'right'): this {
        const alignCode = align === 'center' ? 1 : align === 'right' ? 2 : 0;
        this.buffer.push(Buffer.from([0x1b, 0x61, alignCode])); // ESC a
        return this;
    }

    bold(enable: boolean): this {
        this.buffer.push(Buffer.from([0x1b, 0x45, enable ? 1 : 0])); // ESC E
        return this;
    }

    size(width: number, height: number): this {
        const sizeCode = ((width & 0xf) << 4) | (height & 0xf);
        this.buffer.push(Buffer.from([0x1d, 0x21, sizeCode])); // GS !
        return this;
    }

    text(str: string): this {
        // Sanitizar el texto para la impresora
        const cleanText = sanitizeForPrinter(str);
        this.buffer.push(Buffer.from(cleanText, 'utf8'));
        return this;
    }

    newline(): this {
        this.buffer.push(Buffer.from('\n'));
        return this;
    }

    cut(): this {
        this.buffer.push(Buffer.from([0x1d, 0x56, 0x41, 0x03])); // GS V A n
        return this;
    }

    encode(): Buffer {
        return Buffer.concat(this.buffer);
    }
}

/**
 * Servicio para imprimir tickets en impresoras térmicas ESC/POS
 * Soporta: Bixolon, Star Micronics, Zebra, etc.
 */
@Injectable()
export class PrintingService {
    private readonly logger = new Logger(PrintingService.name);
    private readonly tmpDir = '/tmp';

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Obtener lista de impresoras disponibles
     */
    async listPrinters(): Promise<string[]> {
        try {
            const { stdout } = await execAsync('lpstat -p -d');
            const lines = stdout.split('\n').filter(line => line.includes('printer'));
            return lines
                .map(line => {
                    const match = line.match(/printer\s+(\S+)/);
                    return match ? match[1] : null;
                })
                .filter((printer): printer is string => printer !== null);
        } catch (error) {
            this.logger.error('Error listando impresoras:', error);
            return [];
        }
    }

    /**
     * Impresora por defecto
     */
    async getDefaultPrinter(): Promise<string | null> {
        try {
            const { stdout } = await execAsync('lpstat -d');
            const match = stdout.match(/device\s+for\s+(\S+)/);
            return match ? match[1] : null;
        } catch (error) {
            this.logger.error('Error obteniendo impresora por defecto:', error);
            return null;
        }
    }

    /**
     * Crear buffer ESC/POS para prueba simple
     */
    private createTestTicket(): Buffer {
        const encoder = new ESCPOSBuilder();

        const buffer = encoder
            .initialize()
            .newline()
            .align('center')
            .bold(true)
            .text('PRUEBA')
            .bold(false)
            .newline()
            .text('------------------------')
            .newline()
            .text('Restaurante Maminco')
            .newline()
            .text('------------------------')
            .newline()
            .newline()
            .align('left')
            .text('Esta es una prueba de impresion')
            .newline()
            .text('Fecha: ' + formatDateForPrinter(new Date()))
            .newline()
            .newline()
            .align('center')
            .text('Prueba completada exitosamente')
            .newline()
            .newline()
            .newline()
            .cut()
            .encode();

        return buffer;
    }

    /**
     * Imprimir ticket de prueba
     */
    async printTest(printerName?: string): Promise<{ success: boolean; message: string }> {
        try {
            // Obtener nombre de impresora
            const printer = printerName || (await this.getDefaultPrinter());

            if (!printer) {
                return {
                    success: false,
                    message: 'No se encontró impresora. Verifica la configuración.',
                };
            }

            // Crear buffer
            const buffer = this.createTestTicket();

            // Guardar en archivo temporal
            const tmpFile = `${this.tmpDir}/ticket-test-${Date.now()}.bin`;
            fs.writeFileSync(tmpFile, buffer);

            this.logger.log(`Archivo temporal creado: ${tmpFile}`);
            this.logger.log(`Imprimiendo en: ${printer}`);

            // Enviar a impresora
            const command = `lp -d ${printer} -o raw ${tmpFile}`;
            this.logger.log(`Ejecutando: ${command}`);

            await execAsync(command);

            // Limpiar archivo temporal después de 5 segundos
            setTimeout(() => {
                try {
                    fs.unlinkSync(tmpFile);
                    this.logger.log(`Archivo temporal eliminado: ${tmpFile}`);
                } catch (error) {
                    this.logger.warn(`No se pudo eliminar archivo temporal: ${error.message}`);
                }
            }, 5000);

            return {
                success: true,
                message: `Ticket de prueba enviado a impresora: ${printer}`,
            };
        } catch (error) {
            this.logger.error('Error imprimiendo prueba:', error);
            return {
                success: false,
                message: `Error al imprimir: ${error.message}`,
            };
        }
    }

    /**
     * Crear ticket de orden
     */
    private createOrderTicket(orderData: {
        orderNumber: string;
        items: Array<{ name: string; quantity: number; unitPrice: number; subtotal: number }>;
        subtotal: number;
        discount?: number;
        total: number;
        table?: string;
        customerName?: string;
        notes?: string;
    }): Buffer {
        const encoder = new ESCPOSBuilder();

        encoder
            .initialize()
            .newline()
            .align('center')
            .bold(true)
            .text('MAMINCO')
            .bold(false)
            .newline()
            .text('Restaurante Boliviano')
            .newline()
            .text('------------------------')
            .newline()
            .text(`Orden #${orderData.orderNumber}`)
            .newline();

        // Mesa o cliente
        if (orderData.table) {
            encoder.text(`Mesa: ${orderData.table}`).newline();
        }

        if (orderData.customerName) {
            encoder.text(`Cliente: ${orderData.customerName}`).newline();
        }

        encoder
            .text(`Fecha: ${formatDateForPrinter(new Date())}`)
            .newline()
            .text('------------------------')
            .newline()
            .newline();

        // Items
        encoder
            .align('left')
            .text('Descripción         Cant  PUnit   Subtotal')
            .text('------------------------')
            .newline();

        for (const item of orderData.items) {
            // Truncar nombre a 18 caracteres
            const name = item.name.substring(0, 18).padEnd(18);
            const qty = String(item.quantity).padStart(4);
            const unitPrice = item.unitPrice.toFixed(2).padStart(7);
            const subtotal = `Bs ${item.subtotal.toFixed(2)}`.padStart(9);

            encoder.text(`${name}${qty}  ${unitPrice}  ${subtotal}`).newline();
        }

        encoder
            .newline()
            .text('-----------------------')
            .align('right');

        // Subtotal
        const subtotalText = `Subtotal: Bs ${orderData.subtotal.toFixed(2)}`;
        encoder.text(subtotalText).newline();

        // Descuento (si existe)
        if (orderData.discount && orderData.discount > 0) {
            const discountText = `Descuento: -Bs ${orderData.discount.toFixed(2)}`;
            encoder.text(discountText).newline();
        }

        // Total
        encoder
            .bold(true)
            .text(`Total: Bs ${orderData.total.toFixed(2)}`)
            .bold(false)
            .newline()
            .newline();

        // Notas (si existen)
        if (orderData.notes) {
            encoder
                .align('center')
                .text('Notas:')
                .align('left')
                .text(orderData.notes)
                .newline();
        }

        encoder
            .newline()
            .newline()
            .align('center')
            .text('Gracias por su compra')
            .newline()
            .newline()
            .cut();

        return encoder.encode();
    }

    /**
     * Imprimir orden
     */
    async printOrder(
        orderData: {
            orderNumber: string;
            items: Array<{ name: string; quantity: number; unitPrice: number; subtotal: number }>;
            subtotal: number;
            discount?: number;
            total: number;
            table?: string;
            customerName?: string;
            notes?: string;
        },
        printerName?: string,
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Obtener nombre de impresora
            const printer = printerName || (await this.getDefaultPrinter());

            if (!printer) {
                return {
                    success: false,
                    message: 'No se encontró impresora. Verifica la configuración.',
                };
            }

            // Crear buffer
            const buffer = this.createOrderTicket(orderData);

            // Guardar en archivo temporal
            const tmpFile = `${this.tmpDir}/ticket-order-${orderData.orderNumber}-${Date.now()}.bin`;
            fs.writeFileSync(tmpFile, buffer);

            this.logger.log(`Archivo temporal creado: ${tmpFile}`);
            this.logger.log(`Imprimiendo orden ${orderData.orderNumber} en: ${printer}`);

            // Enviar a impresora
            const command = `lp -d ${printer} -o raw ${tmpFile}`;
            await execAsync(command);

            // Limpiar archivo temporal después de 5 segundos
            setTimeout(() => {
                try {
                    fs.unlinkSync(tmpFile);
                } catch (error) {
                    this.logger.warn(`No se pudo eliminar archivo temporal: ${error.message}`);
                }
            }, 5000);

            return {
                success: true,
                message: `Orden #${orderData.orderNumber} impresa en: ${printer}`,
            };
        } catch (error) {
            this.logger.error('Error imprimiendo orden:', error);
            return {
                success: false,
                message: `Error al imprimir: ${error.message}`,
            };
        }
    }

    /**
     * Imprimir una orden desde la base de datos usando su ID
     * Busca la orden, sus items y productos, y los imprime
     */
    async printOrderFromDatabase(
        orderId: string,
        printerName?: string,
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Buscar orden con todos sus datos
            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
                include: {
                    items: {
                        include: { product: true },
                    },
                    table: { include: { area: true } },
                },
            });

            if (!order) {
                return {
                    success: false,
                    message: `Orden con ID ${orderId} no encontrada`,
                };
            }

            if (order.items.length === 0) {
                return {
                    success: false,
                    message: `La orden #${order.orderNumber} no tiene items para imprimir`,
                };
            }

            // Formatear items para impresión
            const formattedItems = order.items.map(item => ({
                name: item.product.name,
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                subtotal: Number(item.subtotal),
            }));

            // Preparar datos para impresión
            const printData = {
                orderNumber: order.orderNumber,
                items: formattedItems,
                subtotal: Number(order.subtotal),
                discount: Number(order.discountAmount),
                total: Number(order.total),
                table: order.table?.number?.toString() || 'Sin mesa',
                customerName: undefined, // La orden actual no almacena nombre de cliente
                notes: undefined,
            };

            // Imprimir orden
            return this.printOrder(printData, printerName);
        } catch (error) {
            this.logger.error(`Error imprimiendo orden desde BD:`, error);
            return {
                success: false,
                message: `Error al imprimir: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Crear buffer ESC/POS para recibo de pago
     * Ahora soporta MÚLTIPLES PAGOS
     */
    private createPaymentReceipt(receiptData: {
        orderNumber: string;
        items: Array<{ name: string; quantity: number; unitPrice: number; subtotal: number }>;
        orderSubtotal: number;
        orderDiscount?: number;
        orderTotal: number;
        table?: string;
        // Cambio: Ahora es array de pagos
        payments: Array<{
            method: string;
            received: number;
            applied: number;
            change?: number;
            tip?: number;
        }>;
        // Totales acumulados
        totalReceived: number;
        totalApplied: number;
        totalChange: number;
        totalTip: number;
    }): Buffer {
        const encoder = new ESCPOSBuilder();

        encoder
            .initialize()
            .newline()
            .align('center')
            .bold(true)
            .text('MAMINCO')
            .bold(false)
            .newline()
            .text('Restaurante Boliviano')
            .newline()
            .text('RECIBO DE PAGO')
            .newline()
            .text('------------------------')
            .newline()
            .text(`Orden #${receiptData.orderNumber}`)
            .newline();

        if (receiptData.table) {
            encoder.text(`Mesa: ${receiptData.table}`).newline();
        }

        encoder
            .text(`Fecha: ${formatDateForPrinter(new Date())}`)
            .newline()
            .text('------------------------')
            .newline()
            .newline();

        // Resumen de items
        encoder
            .align('left')
            .text('Descripcion         Cant  PUnit   Subtotal')
            .text('------------------------')
            .newline();

        for (const item of receiptData.items) {
            const name = item.name.substring(0, 18).padEnd(18);
            const qty = String(item.quantity).padStart(4);
            const unitPrice = item.unitPrice.toFixed(2).padStart(7);
            const subtotal = `Bs ${item.subtotal.toFixed(2)}`.padStart(9);

            encoder.text(`${name}${qty}  ${unitPrice}  ${subtotal}`).newline();
        }

        encoder
            .newline()
            .text('-----------------------')
            .align('right');

        // Subtotal de orden
        encoder.text(`Subtotal: Bs ${receiptData.orderSubtotal.toFixed(2)}`).newline();

        // Descuento de orden (si existe)
        if (receiptData.orderDiscount && receiptData.orderDiscount > 0) {
            encoder.text(`Descuento: -Bs ${receiptData.orderDiscount.toFixed(2)}`).newline();
        }

        // Total de orden
        encoder
            .bold(true)
            .text(`Total Orden: Bs ${receiptData.orderTotal.toFixed(2)}`)
            .bold(false)
            .newline()
            .newline();

        // Seccion de Pagos (AHORA MÚLTIPLES)
        encoder
            .align('center')
            .text('========================')
            .text('DETALLE DE PAGO')
            .text('========================')
            .newline()
            .align('right');

        // Mostrar CADA pago registrado
        for (let i = 0; i < receiptData.payments.length; i++) {
            const payment = receiptData.payments[i];
            const paymentNum = i + 1;
            encoder.text(`Pago ${paymentNum}: ${payment.method}`).newline();
            encoder.text(`  Recibido: Bs ${payment.received.toFixed(2)}`).newline();
            encoder.text(`  Aplicado: Bs ${payment.applied.toFixed(2)}`).newline();

            if (payment.change && payment.change > 0) {
                encoder.text(`  Cambio: Bs ${payment.change.toFixed(2)}`).newline();
            }

            if (payment.tip && payment.tip > 0) {
                encoder.text(`  Propina: Bs ${payment.tip.toFixed(2)}`).newline();
            }

            if (i < receiptData.payments.length - 1) {
                encoder.newline();
            }
        }

        encoder
            .newline()
            .text('-----------------------')
            .bold(true)
            .text(`Total Recibido: Bs ${receiptData.totalReceived.toFixed(2)}`)
            .newline()
            .text(`Total Aplicado: Bs ${receiptData.totalApplied.toFixed(2)}`)
            .bold(false)
            .newline();

        // Cambio total (si aplica)
        if (receiptData.totalChange && receiptData.totalChange > 0) {
            encoder
                .bold(true)
                .text(`Cambio Total: Bs ${receiptData.totalChange.toFixed(2)}`)
                .bold(false)
                .newline();
        }

        // Propina total (si existe)
        if (receiptData.totalTip && receiptData.totalTip > 0) {
            encoder.text(`Propina Total: Bs ${receiptData.totalTip.toFixed(2)}`).newline();
        }

        encoder
            .newline()
            .newline()
            .align('center')
            .text('Gracias por su compra')
            .newline()
            .text('Visitenos pronto')
            .newline()
            .newline()
            .cut();

        return encoder.encode();
    }

    /**
     * Imprimir recibo de pago
     * Ahora acepta MÚLTIPLES PAGOS
     */
    async printPaymentReceipt(
        receiptData: {
            orderNumber: string;
            items: Array<{ name: string; quantity: number; unitPrice: number; subtotal: number }>;
            orderSubtotal: number;
            orderDiscount?: number;
            orderTotal: number;
            table?: string;
            // Cambio: Ahora es array de pagos
            payments: Array<{
                method: string;
                received: number;
                applied: number;
                change?: number;
                tip?: number;
            }>;
            // Totales acumulados
            totalReceived: number;
            totalApplied: number;
            totalChange: number;
            totalTip: number;
        },
        printerName?: string,
    ): Promise<{ success: boolean; message: string }> {
        try {
            const printer = printerName || (await this.getDefaultPrinter());

            if (!printer) {
                return {
                    success: false,
                    message: 'No se encontró impresora. Verifica la configuración.',
                };
            }

            const buffer = this.createPaymentReceipt(receiptData);

            const tmpFile = `${this.tmpDir}/receipt-payment-${receiptData.orderNumber}-${Date.now()}.bin`;
            fs.writeFileSync(tmpFile, buffer);

            this.logger.log(`Archivo temporal creado: ${tmpFile}`);
            this.logger.log(`Imprimiendo recibo de pago para orden ${receiptData.orderNumber} en: ${printer}`);

            const command = `lp -d ${printer} -o raw ${tmpFile}`;
            await execAsync(command);

            setTimeout(() => {
                try {
                    fs.unlinkSync(tmpFile);
                } catch (error) {
                    this.logger.warn(`No se pudo eliminar archivo temporal: ${error.message}`);
                }
            }, 5000);

            return {
                success: true,
                message: `Recibo de pago impreso exitosamente en: ${printer}`,
            };
        } catch (error) {
            this.logger.error('Error imprimiendo recibo de pago:', error);
            return {
                success: false,
                message: `Error al imprimir: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Imprimir recibo de pago desde la base de datos
     * Busca la orden, TODOS sus pagos y genera el recibo
     * AHORA SOPORTA MÚLTIPLES PAGOS
     */
    async printPaymentReceiptFromDatabase(
        orderId: string,
        printerName?: string,
    ): Promise<{ success: boolean; message: string }> {
        try {
            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
                include: {
                    items: {
                        include: { product: true },
                    },
                    table: { include: { area: true } },
                    // CAMBIO: Traer TODOS los pagos, no solo 1
                    payments: {
                        include: { paymentMethod: true },
                        orderBy: { createdAt: 'asc' }, // De primero a último
                        // NO incluir take: 1 para traer todos
                    },
                },
            });

            if (!order) {
                return {
                    success: false,
                    message: `Orden con ID ${orderId} no encontrada`,
                };
            }

            if (order.items.length === 0) {
                return {
                    success: false,
                    message: `La orden #${order.orderNumber} no tiene items`,
                };
            }

            if (order.payments.length === 0) {
                return {
                    success: false,
                    message: `La orden #${order.orderNumber} no tiene pagos registrados. Debes registrar los pagos ANTES de cerrar la orden. Flujo correcto: 1) Registrar pago(s) con POST /api/payments/orders/{orderId}, 2) Cerrar orden, 3) Imprimir recibo.`,
                };
            }

            // Formatear items
            const formattedItems = order.items.map(item => ({
                name: item.product.name,
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                subtotal: Number(item.subtotal),
            }));

            // NUEVO: Procesar TODOS los pagos
            const formattedPayments = order.payments.map(payment => ({
                method: payment.paymentMethod.name,
                received: Number(payment.amountReceived),
                applied: Number(payment.amountApplied),
                change: payment.changeAmount ? Number(payment.changeAmount) : undefined,
                tip: payment.tipAmount ? Number(payment.tipAmount) : undefined,
            }));

            // Calcular totales acumulados
            const totalReceived = formattedPayments.reduce((sum, p) => sum + p.received, 0);
            const totalApplied = formattedPayments.reduce((sum, p) => sum + p.applied, 0);
            const totalChange = formattedPayments.reduce((sum, p) => sum + (p.change || 0), 0);
            const totalTip = formattedPayments.reduce((sum, p) => sum + (p.tip || 0), 0);

            const receiptData = {
                orderNumber: order.orderNumber,
                items: formattedItems,
                orderSubtotal: Number(order.subtotal),
                orderDiscount: Number(order.discountAmount),
                orderTotal: Number(order.total),
                table: order.table?.number?.toString() || 'Sin mesa',
                payments: formattedPayments, // ← NUEVO: Array de pagos
                totalReceived, // ← NUEVO
                totalApplied, // ← NUEVO
                totalChange, // ← NUEVO
                totalTip, // ← NUEVO
            };

            this.logger.log(
                `Imprimiendo recibo con ${formattedPayments.length} pago(s): ${formattedPayments.map(p => p.method).join(', ')}`,
            );

            return this.printPaymentReceipt(receiptData, printerName);
        } catch (error) {
            this.logger.error(`Error imprimiendo recibo de pago desde BD:`, error);
            return {
                success: false,
                message: `Error al imprimir: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
}
