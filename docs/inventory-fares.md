# Inventario, préstamos de equipos y pasajes

## Despliegue

1. Aplicar `supabase/migrations/202611090001_inventory_loans.sql` y `supabase/migrations/202611090002_product_loanable.sql` (aditivas e idempotentes): columna `stock` en `Product`, tablas `InventoryMovement` y `EquipmentLoan`, enums `InventoryMovementType` y `LoanStatus`. En desarrollo también sirve `npm run prisma:push`.
2. `npm run prisma:generate` y `npm run build`.
3. Los pasajes no requieren migración: viven en el payload de los eventos de programación (`fareCents`, `fareReason`, `fareStatus`, `farePaidAt`) y la fecha "pagados hasta" se guarda en `Setting` con la clave `fares_paid_until`.

## Inventario (personal: agentes, contabilidad y administradores)

- Menú **Inventario** (`/dashboard/inventory`). Usa el catálogo de productos; desde aquí también se pueden crear productos nuevos.
- Movimientos: **Compra** y **Entrada** suman; **Baja** resta; **Conteo** registra las unidades encontradas y el sistema guarda la diferencia como ajuste. Cada movimiento queda en el **Kardex** con cantidad firmada, saldo resultante, costo unitario, referencia, notas y usuario.
- La existencia nunca queda negativa: el producto se bloquea por fila dentro de la transacción (`lib/inventory/stock.ts`, `applyMovement`), así que movimientos simultáneos se serializan y el que exceda el saldo se rechaza.

## Préstamos de equipos

- Solo los productos marcados como **Equipo de préstamo** en el Catálogo (casilla del formulario de producto) aparecen en Préstamos y en el reporte de Equipos.
- **Salida de equipo**: producto, cantidad, cliente, técnico encargado, notas y fotos (subidas con el mismo almacenamiento de adjuntos, hasta 10). Descuenta existencias (movimiento `LOAN_OUT`) y crea la orden `PR-0001`.
- **Entrada de equipo**: se elige la orden de salida abierta, con notas y fotos; restaura existencias (`LOAN_IN`) y cierra la orden. Una orden no puede devolverse dos veces.
- **Equipos**: reporte de disponibles en bodega y prestados por producto, con cada préstamo abierto, su cliente, técnico y el tiempo transcurrido (resaltado a partir de 30 y 90 días).

## Pasajes en el cronograma

- El formulario de evento tiene **Pasajes (valor)** en formato moneda y **Motivo del pasaje** (obligatorio cuando hay valor). Al guardarse, el pasaje queda **Pendiente**.
- Menú **Pasajes** (`/dashboard/fares`, todo el personal): reporte por rango de fechas (por defecto el mes actual), con totales (pendientes, aceptados, pagados) y exportación a Excel (`.xlsx` generado sin dependencias en `lib/xlsx.ts`). Contabilidad y Administración ven a todos los ingenieros y pueden filtrar por uno; los agentes solo ven (y exportan) sus propios pasajes, en modo lectura: la API ignora el filtro de ingeniero y responde 403 a aceptar, eliminar o pagar.
- Administración y Contabilidad pueden **Aceptar** o **Eliminar** un pasaje y **Marcar como pagados hasta** una fecha: todos los pasajes pendientes o aceptados hasta esa fecha pasan a **Pagado** y la fecha queda registrada. Desde esa fecha hacia atrás, el campo de pasajes del formulario de evento queda bloqueado (el servidor también lo rechaza); el resto del evento sigue siendo editable. La fecha de corte nunca retrocede.

## Conteo masivo

Inventario › Conteos: se eligen los productos a contar con casillas, se registra la cantidad física de cada uno y, al guardar, el sistema aplica un movimiento de conteo por producto (ajuste = físico − teórico) en una sola transacción. El resultado queda archivado y genera un PDF con teórico, físico y diferencia por producto y totales; el historial permite volver a descargarlo.

## Pruebas

- `npm run test:inventory` — contra PostgreSQL real: compras/entradas/bajas/conteos con saldo, 10 bajas simultáneas sin saldo negativo, préstamo que descuenta y devolución que restaura, doble devolución rechazada.
- `npm run test:accounting` — incluye las reglas de bloqueo de pasajes (`fareLocked`) y el escritor de Excel.
