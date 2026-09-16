# Actualización del Módulo de Reportes - Filtrado por Área

## Resumen de Cambios

Se han actualizado todos los endpoints y métodos del módulo de reportes para soportar filtrado dual por:
1. **Área específica** (`areaId`) - Seleccionar una área concreta
2. **Tipo de área** (`isVirtual`) - Filtrar por virtuales o físicas

## Cambios en la Arquitectura de Queries

### Antes (❌ INCORRECTO)
```sql
WHERE orders.serviceType = 'MESA'  -- Enum-based, INCORRECTO
```

### Ahora (✅ CORRECTO)
```sql
WHERE areas.id = '${areaId}'        -- Área específica
  AND areas.isVirtual = ${isVirtual} -- Tipo de área
```

**Estructura de joins correcta:**
```sql
JOIN tables ON orders.tableId = tables.id
JOIN areas ON tables.areaId = areas.id
```

## Endpoints Actualizados

### 1. `/reports/sales/daily`
- **Parámetros:**
  - `from` (string): Fecha inicio (YYYY-MM-DD)
  - `to` (string): Fecha fin (YYYY-MM-DD)
  - `areaId` (string, opcional): UUID del área
  - `isVirtual` (boolean, opcional): true/false para tipo

- **Ejemplos:**
  ```
  GET /reports/sales/daily?from=2025-01-01&to=2025-01-31
  GET /reports/sales/daily?from=2025-01-01&to=2025-01-31&areaId=<uuid>
  GET /reports/sales/daily?from=2025-01-01&to=2025-01-31&isVirtual=false
  GET /reports/sales/daily?from=2025-01-01&to=2025-01-31&areaId=<uuid>&isVirtual=true
  ```

### 2. `/reports/sales/weekly`
- Mismo parámetros que `/daily`

### 3. `/reports/sales/monthly`
- Mismo parámetros que `/daily`

### 4. `/reports/sales/summary`
- Mismo parámetros que `/daily`
- Incluye desglose por método de pago y tipo de área

### 5. `/reports/products/top`
- Parámetros adicionales: `limit` (1-100, default: 10)
- Soporta `areaId` e `isVirtual`

### 6. `/reports/products/by-category`
- Soporta `areaId` e `isVirtual`

### 7. `/reports/areas` (NUEVO)
- **Descripción:** Obtiene lista de áreas activas para dropdown
- **Parámetros:** Ninguno
- **Response:**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": "uuid-1",
        "name": "SALON",
        "isVirtual": false,
        "type": "FÍSICA"
      },
      {
        "id": "uuid-2",
        "name": "DELIVERY",
        "isVirtual": true,
        "type": "VIRTUAL"
      }
    ],
    "count": 4
  }
  ```

## Métodos del Service Actualizados

| Método | Firma | Cambios |
|--------|-------|---------|
| `getDailySales()` | `(from, to, areaId?, isVirtual?)` | ✅ Ambos filtros |
| `getWeeklySales()` | `(from, to, areaId?, isVirtual?)` | ✅ Ambos filtros |
| `getMonthlySales()` | `(from, to, areaId?, isVirtual?)` | ✅ Ambos filtros |
| `getSalesReport()` | `(from, to, areaId?, isVirtual?)` | ✅ 3 queries actualizadas |
| `getTopProducts()` | `(from, to, limit, areaId?, isVirtual?)` | ✅ Ambos filtros |
| `getProductsByCategory()` | `(from, to, areaId?, isVirtual?)` | ✅ Ambos filtros |
| `getDailyProductMatrix()` | Sin cambios | - |
| `getPaymentMethodBreakdown()` | Sin cambios | - |
| `getPaymentsByDate()` | Sin cambios | - |
| `getAvailableAreas()` | (NUEVO) | Obtiene áreas para dropdown |

## Formato de Respuesta

Todos los endpoints ahora incluyen información del filtro aplicado:

```json
{
  "status": "success",
  "data": [...],
  "count": 15,
  "range": { "from": "2025-01-01", "to": "2025-01-31" },
  "filter": {
    "areaId": "uuid-or-all",
    "areaType": "virtual|physical|all"
  }
}
```

## Casos de Uso

### 1. Ver ventas totales del mes (todas las áreas)
```
GET /reports/sales/daily?from=2025-01-01&to=2025-01-31
```

### 2. Ver ventas solo del SALON
```
GET /reports/sales/daily?from=2025-01-01&to=2025-01-31&areaId=<salon-uuid>
```

### 3. Ver ventas de áreas virtuales solamente
```
GET /reports/sales/daily?from=2025-01-01&to=2025-01-31&isVirtual=true
```

### 4. Ver ventas de DELIVERY virtual específicamente
```
GET /reports/sales/daily?from=2025-01-01&to=2025-01-31&areaId=<delivery-uuid>&isVirtual=true
```

### 5. Ver top 20 productos del SALON en áreas físicas
```
GET /reports/products/top?from=2025-01-01&to=2025-01-31&limit=20&areaId=<salon-uuid>&isVirtual=false
```

### 6. Obtener lista de áreas para dropdown
```
GET /reports/areas
```

## Testing

### Comando para validar compilación
```bash
npm run build
```

### Puntos clave de validación
1. ✅ Compilación sin errores
2. ✅ Todas las queries usan joins correctos: `Order → Table → Area`
3. ✅ Los filtros `areaId` e `isVirtual` son independientes
4. ✅ Los filtros pueden combinarse
5. ✅ Response incluye información de filtros aplicados
6. ✅ Nuevo endpoint `/reports/areas` funciona

## Base de Datos

**Relaciones correctas:**
- `Order.tableId` → `Table.id`
- `Table.areaId` → `Area.id`
- `Order.serviceType` = `Area.name` (string, no enum)

**Campos relevantes:**
- `Area.id` - UUID único
- `Area.name` - Nombre del área (SALON, DELIVERY, etc.)
- `Area.isVirtual` - Boolean (true=virtual, false=física)
- `Area.isActive` - Boolean para filtrar áreas activas

## Notas de Implementación

1. **Seguridad:** Todos los endpoints requieren roles `GERENTE` o `ADMINISTRADOR`
2. **Validación:** Las fechas se validan y se limita a máximo 1 año de rango
3. **Decimals:** Se usa `Decimal` de Prisma para precisión monetaria
4. **Ordenamiento:** Los resultados se ordenan por fecha (descendente)
5. **Paginación:** Los endpoints `/top` aceptan parámetro `limit`

## Estructura de Archivos

```
src/reports/
├── reports.module.ts
├── reports.service.ts       (623 líneas - 8 métodos)
├── reports.controller.ts    (330 líneas - 10 endpoints)
└── dto/
    ├── index.ts
    ├── date-range.query.dto.ts
    ├── daily-sales-report.dto.ts
    ├── weekly-sales-report.dto.ts
    ├── monthly-sales-report.dto.ts
    ├── sales-report.dto.ts
    ├── product-report.dto.ts
    ├── category-report.dto.ts
    ├── daily-product-sales.dto.ts
    ├── payment-report.dto.ts
    └── payments-by-date.dto.ts
```

---

**Status:** ✅ COMPLETADO Y COMPILANDO SIN ERRORES
**Última actualización:** $(date)
**Versión:** 2.0.0 - Dual-filter implementation
