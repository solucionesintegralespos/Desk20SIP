# SIP SOPORTE - Sistema de Soporte Técnico

Sistema de gestión de tickets y soporte al cliente inspirado en Zendesk, construido con Next.js, PostgreSQL y Prisma.

Incentivos (solo administradores) permite consultar cada mes de Colombia para los líderes
de Mesa de Ayuda, Cizaro y FE. Mesa de Ayuda parte de los 14 indicadores de referencia;
los otros dos cargos quedan sin reglas. Asigna a la persona responsable y revisa las
categorías, metas y bases instaladas antes de guardar. Los valores ausentes y las reglas
sin confirmar quedan pendientes y no generan incentivo. La comparación usa el porcentaje
sin redondear, y el importe se expresa en pesos colombianos enteros.
Los indicadores automáticos usan la cohorte de tickets creados en el mes y la asignación
actual del equipo. Primer contacto y urgentes del mismo día comparan la fecha colombiana
de creación y cierre; los plazos por días usan intervalos de 24 horas. El backlog incluye
todos los tickets abiertos con más de 30 días al corte, reconstruyendo estados a partir
del historial del sistema cuando existe. Las revisiones usan categorías específicas.
Las metas y cantidades de puntos instalados se configuran por mes, y las reglas se pueden
copiar del mes anterior. El seguimiento se actualiza cada minuto mientras la pantalla está
abierta. Después de terminar el mes, el cierre guarda una instantánea inmutable de reglas,
conteos, tickets contabilizados y liquidación. Los cambios requieren revisión coincidente
y quedan auditados. No requiere migración: utiliza registros de tipo `incentive-month`.
Validación: `node scripts/test-incentive-calculation.cjs`, `node scripts/test-incentives.cjs`
y `node scripts/test-incentive-api.cjs` (API aislada, sin modificar la base de datos).

Programación, debajo de Tickets, muestra una matriz semanal de agentes y administradores.
El personal de soporte puede crear, editar y eliminar eventos compartidos con cliente,
fecha, horario, descripción y estado. Incluye vacaciones, filtros, fin de semana opcional
y alertas de horarios superpuestos. Los datos se guardan como registros de programación
con control de revisión y auditoría. Validación: `node scripts/test-schedule.cjs`.

Los checklists reciben un consecutivo empresarial anual al guardarse: `26-001`,
`26-002`, etc., según el año de creación en Colombia; cada año inicia en 001.
El historial admite fecha de realización desde/hasta (inclusive) y cliente.
Para convertir identificadores antiguos conservando su referencia anterior:
`node scripts/number-checklists.cjs` (se puede ejecutar nuevamente sin renumerar los ya convertidos).

SIP SOPORTE incorpora órdenes de servicio y checklists del proyecto SIP de referencia.
El personal accede desde el menú a Órdenes de servicio y Checklists. En
Configuración, los administradores crean, activan y versionan las plantillas,
con categorías, pasos obligatorios, evidencias y controles de respaldo.
Cada checklist conserva los pasos y la versión con que fue iniciado.
Las órdenes requieren trabajo realizado, nombre de quien recibe, firma y aceptación
para completarse. Las órdenes y checklists completados quedan bloqueados.
Las nuevas órdenes y checklists se crean con el usuario de la sesión, sin elegir otro responsable.
Los agentes solo consultan y modifican las órdenes que crearon; los administradores consultan todas,
pero solo modifican las propias. En órdenes antiguas se utiliza el historial de creación y, si no
existe, el responsable registrado. Las órdenes se guardan con «Guardar y confirmar» y requieren
firma y aceptación. Al confirmar una orden vinculada a un ticket abierto o pendiente, el ticket
pasa a Cerrado en la misma transacción y se registra el cierre en su historial.
Los checklists no admiten nuevos adjuntos ni exigen evidencias; los archivos antiguos se conservan para consulta.

Después de actualizar: `npm run prisma:push` y `npm run service:seed`.
La importación de plantillas conserva los cambios que ya existan en SIP SOPORTE.
Para validar reglas y persistencia en PostgreSQL: `npm run test:service`.

Para uso diario, ejecuta `npm run build` y después `npm start` (puerto 5185).
En Windows puedes ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/keep-local-running.ps1`
para supervisar el servidor y reiniciarlo cinco segundos después de una salida.
El supervisor reutiliza la compilación existente, evita arrancar si el puerto está ocupado
y guarda registros en `.local-logs/`. Debe iniciarse nuevamente después de reiniciar Windows.
Para pruebas desde otra máquina de la misma red, configura `NEXTAUTH_URL` con
la dirección de acceso (por ejemplo `http://192.168.1.37:5185`) y
`NEXTAUTH_URL_INTERNAL=http://localhost:5185` en `.env`. Las cookies usan
`Secure` cuando la URL pública usa HTTPS. Reinicia el servidor al cambiar `.env`;
si cambia el código, vuelve a ejecutar `npm run build` antes de `npm start`.
`npm run dev` es para editar el proyecto y compila las secciones al abrirlas.
La navegación mantiene el menú compartido y muestra un estado de carga.
Los listados de órdenes y checklists descargan firmas y evidencias solo al
abrir el documento; las plantillas se cargan sin adjuntos de otros módulos.

## 🚀 Características

- ✅ **Gestión de Tickets**: Crea, asigna y gestiona tickets de soporte
- 💬 **Sistema de Mensajes**: Conversaciones en tiempo real con clientes
- 👥 **Multi-usuario**: Soporte para agentes, administradores y clientes
- 📊 **Dashboard Analytics**: Estadísticas y métricas de rendimiento
- 🏷️ **Etiquetas y Prioridades**: Organiza tickets por prioridad y categorías
- 📝 **Notas Internas**: Comunicación interna del equipo
- 🔒 **Autenticación**: Sistema seguro con NextAuth
- 📱 **Responsive**: Interfaz adaptable a todos los dispositivos

## 🛠️ Tecnologías

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Base de Datos**: PostgreSQL con Prisma ORM
- **Autenticación**: NextAuth.js
- **UI**: Lucide Icons, date-fns

## 📋 Prerequisitos

- Node.js 18+ 
- PostgreSQL 14+
- npm o yarn

## 🔧 Instalación

1. **Clonar e instalar dependencias**:
```bash
npm install
```

2. **Configurar variables de entorno**:
```bash
cp .env.example .env
```

Edita `.env` y configura:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/desk20?schema=public"
NEXTAUTH_SECRET="tu-secreto-aqui"
NEXTAUTH_URL="http://localhost:5185"
```

3. **Configurar la base de datos**:
```bash
# Generar cliente de Prisma
npm run prisma:generate

# Aplicar migraciones
npm run prisma:push

# (Opcional) Abrir Prisma Studio
npm run prisma:studio
```

4. **Configurar el almacenamiento de archivos locales**:
```bash
# 1. Asegúrate de que la carpeta exista
mkdir -p public/uploads

# 2. Dale permisos de lectura y escritura a la carpeta
chmod -R 777 public/uploads
```

5. **Iniciar el servidor de desarrollo**:
```bash
npm run dev
```

Abre [http://localhost:5185](http://localhost:5185) en tu navegador.

## 📁 Estructura del Proyecto

```
desk20.com/
├── app/
│   ├── api/              # API Routes
│   │   ├── auth/         # Autenticación
│   │   ├── tickets/      # Gestión de tickets
│   │   ├── messages/     # Mensajes
│   │   └── users/        # Usuarios
│   ├── dashboard/        # Dashboard principal
│   │   └── tickets/      # Vista de tickets
│   ├── login/            # Página de login
│   ├── register/         # Página de registro
│   └── page.tsx          # Landing page
├── components/
│   ├── dashboard/        # Componentes del dashboard
│   ├── tickets/          # Componentes de tickets
│   └── ui/               # Componentes UI reutilizables
├── lib/
│   ├── prisma.ts         # Cliente de Prisma
│   └── utils.ts          # Utilidades
├── prisma/
│   └── schema.prisma     # Esquema de base de datos
└── types/                # Tipos de TypeScript
```

## 💾 Modelos de Base de Datos

### User
- Usuarios del sistema (Admin, Agent, Customer)
- Autenticación y perfiles

### Ticket
- Tickets de soporte con estados y prioridades
- Relación con clientes y agentes

### Message
- Mensajes en conversaciones
- Soporte para notas internas

### Interaction
- Historial de interacciones del cliente
- Registros de actividad

### Organization
- Organizaciones de clientes
- Gestión multi-tenant

## 🔐 Autenticación

El sistema usa NextAuth con autenticación por credenciales. Los usuarios pueden:

- Registrarse con email y contraseña
- Iniciar sesión
- Gestionar sesiones seguras

## 📱 Páginas Principales

- `/` - Landing page pública
- `/login` - Inicio de sesión
- `/register` - Registro de usuarios
- `/dashboard` - Panel principal con estadísticas
- `/dashboard/tickets/[id]` - Vista detallada de ticket

## 🎨 Personalización

Los colores y estilos se pueden personalizar en:
- [tailwind.config.js](tailwind.config.js) - Tema y colores
- [app/globals.css](app/globals.css) - Estilos globales

## 📝 Scripts Disponibles

```bash
npm run dev          # Desarrollo
npm run build        # Build de producción
npm run start        # Iniciar servidor de producción
npm run lint         # Ejecutar linter
npm run prisma:generate   # Generar cliente Prisma
npm run prisma:push       # Aplicar cambios a la BD
npm run prisma:studio     # Abrir Prisma Studio
```

## 🚀 Próximas Funcionalidades

- [ ] Sistema de notificaciones en tiempo real
- [ ] Integración con WhatsApp y Email
- [ ] Base de conocimiento (KB)
- [ ] Automatización de tickets
- [ ] Reportes avanzados
- [ ] SLA y métricas de tiempo
- [ ] Integración con Slack/Teams

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## 👨‍💻 Autor

Desarrollado con ❤️ para la gestión de soporte técnico moderno.
