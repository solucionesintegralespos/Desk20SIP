# Órdenes de servicio: consecutivos y fecha

Antes de desplegar esta versión en Supabase/Vercel, aplicar `supabase/migrations/202609180002_service_order_numbers.sql` después de la migración de técnicos múltiples y ejecutar `npm run prisma:generate` durante la compilación.

La migración convierte las referencias de las órdenes existentes a `OS-000001`, `OS-000002`, etc., ordenadas por fecha de creación y por identificador en caso de empate. Conserva la referencia anterior en `ServiceRecord.previousNumber`. No cambia los identificadores internos, relaciones, firmas ni la fecha del servicio. Se puede volver a ejecutar sin renumerar las órdenes ya migradas.

PostgreSQL genera el siguiente consecutivo en la misma transacción del guardado. Las solicitudes simultáneas reciben números diferentes y consecutivos; los guardados fallidos no consumen el contador. El número se conserva al editar una orden. El borrado de una orden no reutiliza su número.

Las tarjetas muestran técnico, fecha y hora del servicio en la zona `America/Bogota` y el número del ticket relacionado (`TK-…`) cuando existe. La fecha y hora del servicio puede ajustarse en el formulario mientras la orden está en proceso; las órdenes completadas mantienen sus restricciones de edición.

El número se asigna al guardar por primera vez. Los UUID siguen usándose exclusivamente como identificadores internos de las órdenes. Los tickets ya cuentan con su consecutivo numérico propio.

`npm run test:service` comprueba los consecutivos con solicitudes simultáneas, su estabilidad al editar, la fecha del servicio y las reglas de firmas/checklists.
