# Tickets con varios técnicos

Este entorno usa Next.js, NextAuth y Prisma sobre PostgreSQL local. No se ha aplicado la migración a Supabase remoto.

## Supabase y Vercel

1. Antes de desplegar, ejecutar `supabase/migrations/202609180001_ticket_assignees.sql` en la base de Supabase desde el editor SQL con permisos de propietario o mediante el flujo de migraciones existente. El script incluye su propia transacción y se puede volver a ejecutar.
2. Conservar `DATABASE_URL` y `DIRECT_URL` configuradas para esa base. Las credenciales deben permanecer exclusivamente en el servidor.
3. Ejecutar `npm run prisma:generate` y `npm run build` en Vercel. Conservar `NEXTAUTH_URL` con el dominio HTTPS del despliegue.
4. Verificar creación con dos técnicos, filtrado por ambos y rechazo de la eliminación del último técnico.

La migración agrega `TicketAssignee`, copia las asignaciones anteriores y conserva `assigneeId` como técnico principal por compatibilidad. No inventa categorías ni asignaciones para tickets históricos incompletos. Las nuevas creaciones requieren tipo, categoría y al menos un técnico. La API también valida la selección explícita de prioridad. La actualización del equipo es atómica.

La tabla nueva tiene RLS habilitado sin políticas para el navegador. Prisma debe usar la conexión del servidor con permisos sobre las tablas y los triggers, nunca los roles `anon` o `authenticated`.

El formulario público conserva el enlace por token y solicita los mismos campos obligatorios. La API valida ese token para identificar al cliente.

`npm run test:tickets` ejecuta pruebas de integración con datos temporales y los elimina al terminar.
