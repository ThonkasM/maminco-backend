# 🎯 Maminco POS - Quick Reference Card

**Versión:** 1.0 | **Diciembre 2025**

---

## 📋 45 CASOS DE USO - VISTA RÁPIDA

### 10 MÓDULOS FUNCIONALES

```
┌─────────────────────────────────────────────────────┐
│ 🔐 AUTENTICACIÓN (4 CU)                            │
│ └─ Login, Logout, Crear Usuario, Validar Roles    │
├─────────────────────────────────────────────────────┤
│ 🏢 CONFIGURACIÓN (4 CU)                            │
│ └─ Áreas, Mesas, Categorías, Productos            │
├─────────────────────────────────────────────────────┤
│ 🛒 ÓRDENES (8 CU)                                  │
│ └─ CRUD, Historial, Paginación, Admin Routes      │
├─────────────────────────────────────────────────────┤
│ 💳 PAGOS (8 CU)                                    │
│ └─ Único, Parcial, Múltiple, Propina, Cambio     │
├─────────────────────────────────────────────────────┤
│ 📊 REPORTES (3 CU)                                 │
│ └─ Ventas, Auditoría, Cierre de Turno            │
├─────────────────────────────────────────────────────┤
│ 🚚 ÓRDENES VIRTUALES (3 CU)                       │
│ └─ Delivery, Recoger, Catering                     │
├─────────────────────────────────────────────────────┤
│ 📦 INVENTARIO - CRÍTICO (6 CU)                    │
│ └─ Stock, Alertas, Reportes                        │
├─────────────────────────────────────────────────────┤
│ 💰 FLUJO DE CAJA - CRÍTICO (3 CU)                 │
│ └─ Movimientos, Reconciliación, Resumen           │
├─────────────────────────────────────────────────────┤
│ 🔧 ADMINISTRACIÓN (2 CU)                           │
│ └─ Usuarios, Denominaciones de Moneda             │
├─────────────────────────────────────────────────────┤
│ 📱 REAL-TIME (3 CU)                                │
│ └─ WebSocket: Mesas, Órdenes, Pagos              │
└─────────────────────────────────────────────────────┘
```

---

## 👥 ACTORES Y ROLES

```
┌─────────────┬──────────────────────────────────┐
│ ROL         │ FUNCIONES PRINCIPALES            │
├─────────────┼──────────────────────────────────┤
│ 👨‍💼 ADMIN    │ Todo (configuración, usuarios)   │
│ 👨‍💼 GERENTE  │ Supervisión, reportes, caja      │
│ 💳 CAJERO   │ Pagos, caja, impresión           │
│ 👨‍🍳 MESERO   │ Órdenes, servicios               │
│ 🔓 PÚBLICO  │ Ver productos/categorías (GET)   │
└─────────────┴──────────────────────────────────┘
```

---

## ⚡ FLUJO RÁPIDO: MESA FÍSICA

```
1. Mesero: Crea orden
   → POST /api/orders { tableId }
   
2. Mesero: Agrega productos
   → POST /api/orders/:id/items { productId, qty }
   
3. Cajero: Procesa pago
   → POST /api/payments { amount, method }
   
4. Sistema: AUTOMÁTICO
   ✓ Calcula cambio
   ✓ Desconenta stock
   ✓ Cierra orden (CERRADO)
   ✓ Libera mesa (DISPONIBLE)
   
5. Imprimir recibo
   → POST /api/payments/:id/print
```

---

## 🚀 FLUJO RÁPIDO: DELIVERY

```
1. Mesero: Crea orden DELIVERY
   → POST /api/orders { tableId: delivery_mesa }
   → Ingresa: nombre cliente, teléfono, dirección
   
2. Agrega productos
   
3. Cajero: Paga
   
4. Sistema: Notifica cocina
   ✓ "LISTO DELIVERY - [NOMBRE]"
   
5. Cliente recibe
   ✓ Orden cierra automáticamente
```

---

## 💳 FLUJO RÁPIDO: PAGO CON CAMBIO + PROPINA

```
ORDEN: 85 Bs
CLIENTE DA: 100 Bs

Sistema calcula:
├─ Cambio: 15 Bs
├─ Sugiere: 10 + 5
└─ Cliente propina: 5 Bs

RESULTADO:
├─ Pago: 100 Bs
├─ Cambio: 10 Bs
├─ Propina: 5 Bs
└─ Recibo impreso
```

---

## 📊 MATRIZ DE ACCESO RÁPIDA

```
                      ADMIN  GERENTE  CAJERO  MESERO  Público
Crear Orden            ✓      ✓        ✓       ✓       ✗
Procesar Pago          ✓      ✓        ✓       ✗       ✗
Ver Reportes           ✓      ✓        ✓       ✗       ✗
Gestionar Áreas        ✓      ✗        ✗       ✗       ✗
Ver Productos          ✓      ✓        ✓       ✓       ✓ (público)
Ver Historial Orden    ✓      ✓        ✓       ✓       ✗
Cierre de Turno        ✓      ✓        ✗       ✗       ✗
Reconciliación Caja    ✓      ✓        ✗       ✗       ✗
```

---

## 🔑 CONCEPTOS CLAVE

### Area.name = Service Type
```
Mesa en área "SALON"    → Order.serviceType = "SALON"
Mesa en área "DELIVERY" → Order.serviceType = "DELIVERY"
✓ Sin enum, dinámico, escalable
```

### Area.isVirtual
```
Áreas Físicas:   isVirtual = false  (SALON, EXTERIOR)
Áreas Virtuales: isVirtual = true   (DELIVERY, RECOGER)
```

### Pagos Parciales
```
ANTES: Total 200 → Pago 100 → ❌ RECHAZADO
AHORA: Total 200 → Pago 100 → ✓ PARTIAL_PAYMENT
                → Pago 100 → ✓ COMPLETED (cierra)
```

### Cambio Automático
```
Total 85, Recibe 100
→ Cambio = 15
→ Monedas sugeridas: 10 + 5
→ Denominaciones configurables
```

---

## 🔗 ENDPOINTS ESENCIALES

### Órdenes
```bash
POST   /api/orders                  # Crear orden
GET    /api/orders?status=BORRADOR  # Listar abiertas
GET    /api/orders/:id              # Detalles
POST   /api/orders/:id/items        # Agregar producto
GET    /api/orders/:id/history?page=1&limit=50  # Historial
```

### Pagos
```bash
POST   /api/payments                # Procesar pago
GET    /api/orders/:id/payments     # Pagos de orden
POST   /api/payments/:id/print      # Imprimir recibo
```

### Público (Sin Token)
```bash
GET    /api/categories/public/active     # Categorías
GET    /api/areas/public/active          # Áreas
GET    /api/products/public/available    # Productos
```

---

## 📱 REAL-TIME (WebSocket)

```
EVENTO                  DESTINATARIOS
────────────────────────────────────────
MESA_ACTUALIZADA       → Todos (actualiza grid)
ORDEN_ACTUALIZADA      → Cocina + Mesero
PAGO_COMPLETADO        → Mesero (notificación)
```

---

## ✅ ESTADO DEL PROYECTO

| Módulo | Estado | Prioridad |
|--------|--------|-----------|
| ✅ Autenticación | Hecho | - |
| ✅ Configuración | Hecho | - |
| ✅ Órdenes | Hecho | - |
| ✅ Pagos | Hecho | - |
| ⚠️ Reportes | Parcial | Media |
| ⏳ Virtual | Diseñado | Baja |
| 🔴 INVENTARIO | CRÍTICO | ALTA |
| 🔴 CAJA | CRÍTICO | ALTA |
| ✅ Admin | Hecho | - |
| ✅ Real-time | Hecho | - |

---

## 🛠️ STACK TÉCNICO

- **Backend:** NestJS (TypeScript)
- **ORM:** Prisma
- **BD:** PostgreSQL
- **Auth:** JWT + RBAC
- **Real-time:** WebSocket
- **Validación:** class-validator
- **Impresión:** PrintingService

---

## 📚 DOCUMENTACIÓN

| Documento | Tamaño | Contenido |
|-----------|--------|----------|
| CASOS_DE_USO.md | 📄📄 | 45 CU detallados |
| CASOS_DE_USO_RESUMEN.md | 📄 | Resumen visual |
| INDICE_DOCUMENTACION.md | 📄 | 31 docs indexados |
| Otros *.md | 📚 | Arquitectura, fixes, testing |

---

## 🚀 PRÓXIMOS PASOS

### CRÍTICO (Debe hacer)
- [ ] **Inventario:** Stock tracking, alertas, reportes
- [ ] **Flujo de Caja:** Movimientos, reconciliación

### IMPORTANTE (Debería hacer)
- [ ] Órdenes virtuales (Delivery/Recoger) implementación
- [ ] Reportes avanzados
- [ ] Exportar a Excel/PDF

### NICE TO HAVE (Podría hacer)
- [ ] Análisis de ventas
- [ ] Dashboards avanzados
- [ ] Integración con proveedores

---

## 🎯 MIRAR PRIMERO

1. **CASOS_DE_USO_RESUMEN.md** ← Empieza aquí (15 min)
2. **CASOS_DE_USO.md** ← Detalle completo (1 hora)
3. **Código:** `/src/orders`, `/src/payments`
4. **Schema:** `prisma/schema.prisma`

---

## 📞 INFO RÁPIDA

**¿Cómo se crea una orden?**
→ POST /api/orders { tableId }
→ Automáticamente serviceType = Area.name

**¿Cómo se procesan pagos?**
→ POST /api/payments { orderId, amount, method }
→ Soporta parciales, múltiples, propina

**¿Cómo se imprime recibo?**
→ POST /api/payments/:id/print
→ Contiene todos los pagos

**¿Puedo tener pagos parciales?**
→ ✓ SÍ. Status = PARTIAL_PAYMENT
→ Saldo pendiente se muestra
→ Puede pagar después

**¿Quién puede crear usuarios?**
→ Solo ADMINISTRADOR
→ POST /api/users

**¿Quién puede ver reportes?**
→ GERENTE y ADMINISTRADOR
→ GET /api/reports/daily-sales

**¿Cómo se manejan áreas virtuales?**
→ Areas con isVirtual = true
→ Mesas virtuales (DELIVERY, RECOGER)
→ Frontend filtra en sidebar

---

**VERSIÓN 1.0 - DICIEMBRE 2025**

Para detalles completos, referirse a CASOS_DE_USO.md

