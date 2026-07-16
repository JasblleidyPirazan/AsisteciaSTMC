# AsisteciaSTMC — Sistema de Asistencia Academia de Tenis

## Contexto del Proyecto

Sistema completo de gestión de asistencia para una academia de tenis. Migración de Netlify + Google Sheets (lento, gratuito) a Railway + PostgreSQL (pagado, rápido). Versión 2 del sistema con motor de costos, liquidación quincenal y roles diferenciados.

**Email admin:** jasblleidy@gmail.com  
**Repositorio:** JasblleidyPirazan/AsisteciaSTMC  
**Branch de trabajo:** `claude/ecstatic-goldberg-UpKEn`  
**Deploy:** Railway → `asisteciastmc-production.up.railway.app`  
**Documento de referencia:** `SistemaAsistenciaTenis_v2.docx` (en uploads)

---

## Stack Técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 5, CSS propio mobile-first (sin Tailwind) |
| Backend | Node.js + Express 4 |
| Base de datos | PostgreSQL + Prisma ORM v5 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Seguridad | helmet, express-rate-limit |
| Deploy | Railway (un servicio Node.js + PostgreSQL addon) |
| Offline | localStorage cache + auto-sync al reconectar |

---

## Estructura del Proyecto

```
AsisteciaSTMC/
├── client/                        # React + Vite (frontend)
│   ├── src/
│   │   ├── api/client.js          # Fetch wrapper con JWT
│   │   ├── hooks/
│   │   │   ├── useAuth.jsx        # Context de autenticación
│   │   │   └── useOffline.jsx     # Detección offline + sync
│   │   ├── components/
│   │   │   ├── GroupCard.jsx
│   │   │   ├── CostSummary.jsx
│   │   │   └── OfflineBanner.jsx
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── DashboardPage.jsx         # Grupos del día
│   │   │   ├── EnrollmentPage.jsx        # Formulario público
│   │   │   ├── AttendanceFlow/           # Flujo 5 pasos
│   │   │   │   ├── index.jsx             # Orquestador
│   │   │   │   ├── Step1ClassStatus.jsx  # ¿Se realizó?
│   │   │   │   ├── Step2Teacher.jsx      # ¿Quién dictó?
│   │   │   │   ├── Step3Students.jsx     # Marcar P/A/J
│   │   │   │   └── Step4Summary.jsx      # Resumen + costo
│   │   │   ├── admin/
│   │   │   │   ├── AdminDashboard.jsx
│   │   │   │   ├── StudentsPage.jsx
│   │   │   │   ├── PayrollPage.jsx
│   │   │   │   ├── ConfigPage.jsx        # Tarifas
│   │   │   │   └── EnrollmentRequestsPage.jsx
│   │   │   └── parent/
│   │   │       └── ParentPortalPage.jsx
│   │   ├── App.jsx                # Router principal
│   │   ├── main.jsx
│   │   └── index.css              # Estilos globales mobile-first
│   └── vite.config.js
├── server/                        # Node.js + Express (backend)
│   ├── src/
│   │   ├── index.js               # Entry point
│   │   ├── prisma/schema.prisma   # Schema PostgreSQL completo
│   │   ├── lib/prisma.js          # Prisma client singleton
│   │   ├── middleware/
│   │   │   ├── auth.js            # JWT verify + requireRole()
│   │   │   └── errorHandler.js    # Manejo centralizado de errores
│   │   ├── services/
│   │   │   └── costEngine.js      # Motor de cálculo de pagos
│   │   ├── routes/
│   │   │   ├── auth.js            # POST /login, GET /me, PUT /password
│   │   │   ├── groups.js
│   │   │   ├── students.js
│   │   │   ├── professors.js
│   │   │   ├── assistants.js
│   │   │   ├── sessions.js        # Sesiones de clase
│   │   │   ├── events.js
│   │   │   ├── payroll.js         # Liquidación quincenal
│   │   │   ├── reports.js         # Reportes + dashboard stats
│   │   │   ├── config.js          # Tarifas del sistema
│   │   │   ├── enrollment.js      # Inscripción pública
│   │   │   └── parent.js          # Portal padres
│   │   └── scripts/
│   │       └── seed.js            # Crea admin + config tarifas por defecto
│   ├── start.sh                   # Script Railway: migrate → seed → start
│   └── package.json
├── railway.toml                   # Configuración de deploy Railway
├── .env.example                   # Variables de entorno necesarias
└── package.json                   # Scripts raíz (build, start, db:*)
```

---

## Variables de Entorno Railway (ya configuradas)

```
DATABASE_URL       # Auto-provisto por Railway PostgreSQL
JWT_SECRET         # Secreto aleatorio 256 bits
NODE_ENV           # production
ADMIN_EMAIL        # jasblleidy@gmail.com
ADMIN_PASSWORD     # (contraseña del admin inicial)
```

Variable opcional:
```
CORS_ORIGIN        # URL del dominio en Railway (ej: https://asisteciastmc.up.railway.app)
```

---

## Base de Datos — Modelos Principales (Prisma)

| Modelo | Descripción |
|---|---|
| `User` | Cuentas de acceso. Roles: **SUPERADMIN**, ADMIN, TEACHER, ASSISTANT, PARENT, PHYSICAL_TRAINER (mostrado como **"Coordinador"** en la UI), RECEPTION. `policiesAcceptedAt` = aceptación de políticas |
| `Professor` | Profesores (puede tener User vinculado) |
| `Assistant` | Asistentes (puede tener User vinculado) |
| `Student` | Estudiantes, vinculados a un padre (parentUserId). `classesAcquired` = clases compradas. Estado derivado `studentStatus` (ver nota 44): PRUEBA/PREINSCRITO/INSCRITO/MATRICULADO/SUSPENDIDO/INACTIVO — se calcula de pagos+asistencia+tarifas, NO del checkbox `paymentComplete` (columna legacy sin uso). Suspensión temporal con `suspendedFrom/Until/Reason` (excluido de rosters por query, sin cron) |
| `Group` | Grupos de clase: días, horario, cancha, nivel (Roja/Naranja/Verde/Amarilla/Intermedio/Avanzado) + `subLevel` A/B/C informativo (solo los 4 colores) |
| `StudentEnrollment` | Relación estudiante↔grupo (PRIMARY o SECONDARY) |
| `ClassSession` | Sesión de clase: PROGRAMADA/REALIZADA/CANCELADA/CANCELADA_MITAD(legacy). `kind` REGULAR/MAKEUP/FESTIVAL. Cancelación estructurada (`cancellationCategory` LLUVIA/SIN_ESTUDIANTES/OTRA). "No dicté la clase yo": `dictatedByOwner` + `notDictatedNote` obligatoria. Pago suspendido: `firstReportedAt` (solo primer reporte) + `paymentUnlocked*`. Triple coincidencia: `assistantConfirmedId/At` + `coordinatorValidated*`. Festivales: `festivalRate` |
| `FestivalProfessor` | Profesores participantes de un festival (M2M sessionId+professorId); cada uno cobra `festivalRate` (pago igualitario) |
| `MakeupParticipant` | Estudiantes asignados a una reposición grupal (sessionId + studentId) |
| `AttendanceRecord` | Asistencia por estudiante: PRESENTE/AUSENTE/JUSTIFICADA + tipo REGULAR/REPOSICION |
| `CostRecord` | Costos calculados por sesión (professorId XOR assistantId, payeeType). `payStatus`: PAYABLE / SUSPENDED_LATE (reporte tardío, desbloquea solo ADMIN) / PENDING_MATCH (asistente sin triple coincidencia). Liquidación y export separan habilitado vs retenido |
| `MakeupClass` | (Legacy, sin uso) — las reposiciones grupales ahora viven en `ClassSession` con `kind=MAKEUP` |
| `Event` | Torneos/clínicas con pago fijo |
| `EnrollmentRequest` | Solicitudes de inscripción (estado PENDING/APPROVED/REJECTED) |
| `SystemConfig` | Tarifas configurables: rate_2_students, rate_3_students, rate_4_students, rate_5plus_students, assistant_fixed_rate + matrícula: tuition_adult_total (2.789.000), tuition_child_total (2.425.000), tuition_plan_classes (40), tuition_adult_age (16) |
| `StudentGroupHistory` | Historial de cambios de grupo: TRANSFER, ADD_GROUP, REMOVE_GROUP |
| `Semester` | Semestres: nombre, fechas inicio/fin, activo (solo uno activo a la vez) |
| `SemesterExclusion` | Fechas excluidas de un semestre (festivos, vacaciones) |
| `SessionEditLog` | Log de ediciones de reportes de asistencia (previousState/newState en Json) |

---

## Motor de Costos

Archivo: `server/src/services/costEngine.js`

- Se ejecuta al hacer `POST /api/sessions/:id/finalize`
- Todas las clases regulares valen `effectiveUnits = 1.0` (los grupos dobles fueron eliminados del sistema). Las reposiciones grupales sí pueden definir `effectiveUnits` = "por cuántas asistencias cuenta"
- **Profesor (tarifa por tramo)**: `tramo(presentes_totales) × units`
  - `presentes_totales` = todos los estudiantes presentes (regulares + reposición). La reposición **ya no tiene tarifa aparte**: cada estudiante en reposición cuenta como un presente más para el tramo
  - Tramos: 1-2 → `rate_2_students`, 3 → `rate_3_students`, 4 → `rate_4_students`, 5+ → `rate_5plus_students`
  - La tarifa de tramo es un monto fijo por sesión (no por estudiante), multiplicado por effectiveUnits
- **Asistente**: `tarifa_fija × units`
- Solo sesiones REALIZADA o CANCELADA_MITAD generan costo
- Función `getBracketRate(presentCount, cfg)` en costEngine.js implementa la lógica de tramos

---

## Flujo de Asistencia (5 pasos, mobile-first)

1. Dashboard → seleccionar grupo del día
2. Step1: ¿La clase se realizó? SI → sigue / NO → motivo → guarda CANCELADA → fin
3. Step2: ¿Quién dictó? (titular por defecto, selector de sustituto, selector de asistente)
4. Step3: Lista de estudiantes con botones P/A/J (44×44px); al lado de cada estudiante se muestran las **clases vistas / adquiridas** del semestre activo; agregar reposición
5. Step4: Resumen con cálculo de pago (solo visible para ADMIN y TEACHER)

---

## Roles y Accesos

| Acción | ADMIN | TEACHER | PHYSICAL_TRAINER | ASSISTANT | PARENT |
|---|---|---|---|---|---|
| CRUD estudiantes | ✅ | ❌ | ✅ | ❌ | ❌ |
| CRUD grupos | ✅ | ❌ | ✅ | ❌ | ❌ |
| CRUD eventos | ✅ | ❌ | ✅ | ❌ | ❌ |
| Ver grupos del día | ✅ | Solo los propios | Todos | Todos | Los del hijo |
| Tomar asistencia | ✅ | Solo sus grupos | Todos los grupos | ❌ | Solo su hijo |
| Marcar clases acompañadas | ✅ | ❌ | ❌ | ✅ | ❌ |
| Ver cálculo de costos | ✅ | Solo el propio | ❌ | Solo el propio | ❌ |
| Liquidación quincenal | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configurar tarifas | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gestionar profesores/asistentes | ✅ | ❌ | ❌ | ❌ | ❌ |
| Aprobar inscripciones | ✅ | ❌ | ❌ | ❌ | ❌ |
| Portal hijo/a | ✅ | ❌ | ❌ | ❌ | ✅ |

### Rol PHYSICAL_TRAINER — Preparador Físico

Creado para el preparador físico de la academia. Tiene acceso operativo y de gestión, pero **no ve información económica**.

**Puede:**
- Ver todos los grupos del día (sin filtro por profesor)
- Reportar asistencia de todos los grupos
- CRUD de estudiantes y grupos
- Programar eventos (torneos/clínicas)
- Ver reportes de asistencia
- Agregar reposiciones en el flujo de asistencia

**No puede:**
- Ver liquidación de pagos (`/admin/payroll`)
- Ver configuración de tarifas (`/admin/config`)
- Gestionar cuentas de profesores o asistentes
- Aprobar inscripciones

**En el frontend:**
- Dashboard muestra botón "Gestión" en lugar de "Admin"
- Panel de gestión muestra: Estudiantes, Grupos, Eventos, Reportes
- No ve: Liquidación, Configuración, Inscripciones, Profesores, Asistentes

**Cómo crear una cuenta PHYSICAL_TRAINER:**
Desde la base de datos o el seed, crear un `User` con `role: 'PHYSICAL_TRAINER'`. No existe aún formulario en la UI para ello — hacerlo vía SQL o añadir una opción en la página de configuración admin.

---

## API Endpoints

### Públicos (sin auth)
- `GET /api/health`
- `POST /api/enrollment` — formulario de inscripción (rate limit: 5/hora)

### Auth (rate limit: 20/15min)
- `POST /api/auth/login` → `{ token, user: { id, email, role } }`
- `GET /api/auth/me`
- `PUT /api/auth/password`

### Grupos
- `GET /api/groups?today=true` — grupos del día según rol del usuario
- `GET /api/groups/:id/students`
- `POST /api/groups` (ADMIN)
- `PUT /api/groups/:id` (ADMIN)

### Sesiones
- `GET /api/sessions/check?groupId=X&date=Y` — ¿ya existe sesión?
- `POST /api/sessions` — crear sesión
- `POST /api/sessions/:id/finalize` — **doble reporte (Fase 2):** guarda el reporte del rol que llama (`reporterType` PROFESSOR/COORDINATOR) en staging y corre la consolidación. Solo cuando profesor y coordinador coinciden se escribe el `AttendanceRecord` final y se calculan costos. Re-enviar el propio reporte es una edición (guarda `SessionEditLog`). Ver nota técnica 31
- `POST /api/sessions/:id/cancel` — cancelar con motivo (elimina cost records si existían)
- `POST /api/sessions/:id/assist` — asistente marca que acompañó
- `GET /api/sessions` excluye reposiciones por defecto (`kind=REGULAR`); pasar `?kind=MAKEUP` para incluirlas

### Reposiciones grupales
- `GET /api/makeups` — lista reposiciones (TEACHER solo las propias). Filtros: `status`, `date`, `from`, `to`
- `GET /api/makeups/:id` — detalle con participantes y asistencia
- `POST /api/makeups` (ADMIN, PHYSICAL_TRAINER) — crear: `{ date, title?, professorId, assistantId?, countsAsUnits, studentIds[] }`. Crea un `ClassSession` `kind=MAKEUP` con `effectiveUnits=countsAsUnits`
- `PUT /api/makeups/:id` (ADMIN, PF) — editar meta/participantes (recalcula costos si ya estaba reportada)
- `DELETE /api/makeups/:id` (ADMIN, PF) — eliminar (borra asistencia, costos, participantes)
- `POST /api/makeups/:id/finalize` — reportar asistencia (ADMIN/PF cualquiera, TEACHER solo si es el profesor asignado/sustituto). Reemplaza registros, recalcula costos, guarda `SessionEditLog` en ediciones
- `POST /api/makeups/:id/cancel` — cancelar con motivo
- Los asistentes acompañan reposiciones vía el mismo `POST /api/sessions/:id/assist`

### Estudiantes — gestión de grupos
- `POST /api/students/:id/transfer` — cambiar grupo (registra historial). Body: `{ fromGroupId?, toGroupId, reason? }`
- `POST /api/students/:id/enrollments` — agregar a grupo adicional
- `DELETE /api/students/:id/enrollments/:groupId` — quitar de un grupo
- `DELETE /api/students/:id` — desactivar; **requiere `reason` en el body**

### Grupos
- `DELETE /api/groups/:id` — desactivar; **requiere `reason` en el body**

### Admin
- CRUD: `/api/students`, `/api/groups`, `/api/professors`, `/api/assistants`, `/api/events`
- `GET /api/enrollment/requests?status=PENDING`
- `POST /api/enrollment/requests/:id/approve`
- `GET /api/payroll?period=2025-06-1`
- `GET /api/payroll/summary?period=2025-06-1`
- `GET /api/search?q=` — buscador global ⌘K (ADMIN/SUPERADMIN/Coordinador/Recepción): estudiantes + grupos activos que coinciden
- `GET /api/reports/dashboard`
- `GET /api/reports/strategy` — Visión Estratégica (solo ADMIN/SUPERADMIN): KPIs del semestre + contadores por grupo
- `GET /api/reports/group/:id`
- `GET /api/reports/student/:id`
- `GET /api/reports/assistant/:id`
- `GET /api/reports/professor/:id`
- `GET /api/reports/class/:sessionId`
- `GET/PUT /api/config`
- `GET /api/payroll/export?period=X` — descarga Excel. ADMIN: 3 hojas (Profesores, Asistentes, Resumen). TEACHER/ASSISTANT: una sola hoja "Mi liquidación" con solo sus registros
- `GET /api/accounting/summary?from=Y-M-D&to=Y-M-D` — módulo Contabilidad (solo ADMIN/SUPERADMIN): ingresos + gastos por quincena + balance mensual + `studentsTuition` (ingresos y deudas por estudiante)
- `PATCH /api/accounting/payments/:id/verified` — marcar/desmarcar pago de estudiante como verificado (conciliado)
- `GET /api/accounting/export?from&to` — Excel de 4 hojas (Ingresos, Gastos, Balance, Pagos Estudiantes)
- `GET /api/semesters` — lista semestres
- `GET /api/semesters/active` — semestre activo
- `POST /api/semesters` — crear semestre (ADMIN)
- `PUT /api/semesters/:id` — editar / activar semestre (ADMIN)
- `DELETE /api/semesters/:id` — eliminar semestre (ADMIN)
- `POST /api/semesters/:id/exclusions` — agregar fecha excluida (ADMIN)
- `DELETE /api/semesters/:id/exclusions/:exclId` — eliminar fecha excluida (ADMIN)

### Portal padres
- `GET /api/parent/children`
- `GET /api/parent/attendance/:studentId`

---

## Deploy en Railway — Pasos Completados

1. ✅ Variables de entorno configuradas en Railway
2. ⚠️ **PENDIENTE:** Cambiar branch en Railway de `main` a `claude/ecstatic-goldberg-UpKEn`
   - Settings → Source → Branch → `claude/ecstatic-goldberg-UpKEn`
3. El `start.sh` ejecuta automáticamente al iniciar:
   - `prisma migrate deploy` (aplica las migraciones versionadas pendientes — ver **Flujo de migraciones**)
   - `node src/scripts/seed.js` (crea admin + tarifas por defecto)
   - `node src/index.js` (inicia el servidor)

---

## Flujo de Migraciones (Prisma Migrate)

El sistema usa **migraciones versionadas** (`prisma migrate`), no `prisma db push`.
`db push` con `--accept-data-loss` podía **borrar columnas/tablas en producción
sin aviso** ante un cambio incompatible de schema — inaceptable con datos reales
de pagos. `migrate deploy` solo aplica los archivos SQL revisados que estén en
`server/src/prisma/migrations/`, en orden, y nunca borra nada por su cuenta.

- Las migraciones viven en `server/src/prisma/migrations/<nombre>/migration.sql`.
- La baseline inicial es `0_init/` (generada del schema completo con
  `prisma migrate diff --from-empty --to-schema-datamodel`).
- `migration_lock.toml` fija el provider (`postgresql`).
- `start.sh` corre `node src/scripts/ensure-baseline.js` y luego `prisma migrate deploy` en cada deploy.

### Baselining de producción — AUTOMÁTICO

La BD de producción se creó originalmente con `db push`, así que ya tiene todas
las tablas pero **no** la tabla de control `_prisma_migrations`. Si se corriera
`migrate deploy` tal cual, intentaría aplicar `0_init` (que hace `CREATE TABLE …`)
y fallaría porque las tablas ya existen.

`start.sh` resuelve esto solo con `src/scripts/ensure-baseline.js`: si detecta que
el esquema ya existe (tabla `users`) pero **no** hay historial (`_prisma_migrations`),
marca `0_init` como aplicada (`migrate resolve --applied 0_init`) y luego
`migrate deploy` aplica solo las migraciones **nuevas**. Es idempotente:

- **BD de prod existente** (esquema sin historial) → baseline `0_init`, luego aplica las nuevas.
- **BD nueva/vacía** → no baselinea; `migrate deploy` crea todo desde `0_init`.
- **BD ya baselineada** → no hace nada; aplica solo lo pendiente.

No hay que correr nada a mano (útil cuando la BD de Railway es solo red interna
y no se puede conectar desde fuera).

### Cambios de schema a futuro

1. Editar `src/prisma/schema.prisma`.
2. Generar la migración (en dev, contra una BD de desarrollo):
   `npx prisma migrate dev --name <descripcion_corta>`
   — crea el `.sql`, lo aplica en dev y regenera el client.
3. Revisar el SQL generado (¿hay `DROP`? ¿pérdida de datos? → ajustar a mano).
4. Commit del nuevo folder de migración.
5. Deploy: `start.sh` corre `migrate deploy` y aplica la nueva migración en prod.

**Nunca** volver a `db push` en producción. `db push` queda solo para prototipado
local rápido sobre una BD desechable.

---

## Pruebas Automatizadas (vitest)

Backend probado con **vitest** (`server/`). `npm test` corre todo una vez;
`npm run test:watch` en modo watch. **No requieren base de datos** — la lógica
pura se prueba directo y las rutas usan un Prisma mockeado.

- `tests/unit/` — lógica pura, sin I/O:
  - `costEngine` → tramos de `getBracketRate`, quincenas de `getPeriodForDate`/`getCurrentPeriod`
  - `dates` → conversión a America/Bogota (`bogotaDateStr`, `dbDateStr`, `bogotaToday`)
  - `schedule` → `expectedDatesForGroup` (días de la semana, exclusiones, floor/until)
  - `attendanceStats` → regla P/A/J (`isSeenRecord`, `seenAttendanceFilter`)
- `tests/integration/` — rutas con **supertest**:
  - `auth.middleware` → `authMiddleware` (401 sin/mal token, usuario inactivo) + `requireRole` (403)
  - `sessions.guards` → guard `canReportGroup()` de `POST /sessions` por cada rol
- `tests/helpers/mockPrisma.js` — el server es CommonJS, así que los `require('../lib/prisma')`
  anidados van por el `require.cache` de Node, que **vitest no intercepta** con `vi.mock`. El
  helper inyecta un mock de Prisma en `require.cache` **antes** de importar cualquier router
  (por eso debe importarse primero en el archivo de test). Los tests configuran
  `prismaMock.<modelo>.<método>` por caso.

Si un test revela un bug real de la lógica de negocio, reportarlo antes de corregirlo.

---

## Rutas del Frontend (React Router)

| Ruta | Componente | Roles |
|---|---|---|
| `/login` | LoginPage | Público |
| `/enrollment` | EnrollmentPage | Público |
| `/` | DashboardPage | ADMIN, TEACHER, ASSISTANT |
| `/attendance/:groupId` | AttendanceFlow | ADMIN, TEACHER, PARENT |
| `/makeups/:id/attendance` | MakeupAttendancePage | ADMIN, TEACHER, PHYSICAL_TRAINER |
| `/admin/makeups` | MakeupsPage | ADMIN, PHYSICAL_TRAINER |
| `/parent` | ParentPortalPage | PARENT, ADMIN |
| `/admin` | AdminDashboard | ADMIN |
| `/admin/students` | StudentsPage | ADMIN |
| `/admin/payroll` | PayrollPage | ADMIN |
| `/admin/accounting` | AccountingPage | ADMIN (SUPERADMIN por superset) |
| `/admin/strategy` | StrategyPage — Visión Estratégica | ADMIN (SUPERADMIN por superset) |
| `/admin/config` | ConfigPage | ADMIN |
| `/admin/enrollment` | EnrollmentRequestsPage | ADMIN |
| `/my-payroll` | MyPayrollPage | TEACHER, ASSISTANT — quincena propia + descarga Excel |

---

## Seguridad Implementada

- `helmet` — headers HTTP de seguridad (X-Frame-Options, HSTS, etc.)
- Rate limiting en auth (20 req/15min) y enrollment (5 req/hora)
- CORS restringido en producción
- JWT tokens de 7 días; **el middleware revalida `user.active` en BD en cada request**, así un usuario desactivado pierde acceso de inmediato (no espera a que expire el token)
- Passwords con bcrypt (12 rounds en cambio de contraseña, 10 en creación); mínimo 8 caracteres también al crear cuenta de padre en aprobación de inscripción
- Protección contra timing attacks en login
- Validación de inputs con longitudes máximas; estados de asistencia validados contra whitelist en `/sessions/:id/finalize`
- Error handler no expone detalles internos en producción
- Soft delete (campo `active`) en lugar de borrado permanente
- `UNIQUE([groupId, date])` en ClassSession previene duplicados a nivel BD

### Autorización por recurso (server-side)

- **Sesiones (crear/finalizar/cancelar):** guard `canReportGroup()` en `sessions.js` — ADMIN/PF cualquier grupo; TEACHER solo grupos donde es titular; PARENT solo grupos con un hijo inscrito; ASSISTANT denegado (usa `/assist`)
- **Reportes:** grupo/clase → ADMIN, PF, TEACHER; estudiante → + PARENT (solo su hijo); asistente → ASSISTANT solo el propio; profesor → TEACHER solo el propio, PF lo ve **sin montos de pago**
- **Reporte de clase:** `totalCost` solo para ADMIN o el profesor que dictó (titular o sustituto); para el resto va `null`
- **Dashboard:** `totalPayableThisPeriod` (pago de la quincena actual, agregado por `period`) solo se envía a ADMIN (`null` para los demás — no solo oculto en UI). Reemplazó al total mensual
- **`GET /config/rates`:** tarifas legibles por ADMIN y TEACHER (para el preview de pago en el flujo de asistencia); `GET/PUT /config` completo sigue siendo solo ADMIN
- **`GET /groups/:id/students`:** PARENT solo si tiene un hijo inscrito en ese grupo

### Nota sobre `npm audit` (xlsx)

`xlsx` reporta 2 advisories (prototype pollution y ReDoS) que aplican **solo al parsear** archivos xlsx no confiables (`XLSX.read`). Este sistema solo **genera** archivos Excel desde datos de la BD (`XLSX.write`) y nunca parsea archivos subidos, por lo que las rutas vulnerables no son alcanzables. No hay fix disponible upstream.

---

## Páginas Admin Pendientes de Construir

Las siguientes páginas admin están en el menú pero aún no tienen implementación completa:

- `GroupsPage.jsx` — CRUD de grupos (crear con horario, días, cancha, nivel)
- `ProfessorsPage.jsx` — CRUD profesores con creación de usuario
- `AssistantsPage.jsx` — CRUD asistentes con creación de usuario
- `EventsPage.jsx` — Torneos/clínicas
- `ReportsPage.jsx` — Reportes exportables PDF/Excel

---

## Comandos Útiles

```bash
# Desarrollo local
cd server && npm run dev       # Backend en :3000
cd client && npm run dev       # Frontend en :5173 (con proxy a :3000)

# Base de datos (dev)
cd server && npm run db:migrate      # aplica migraciones (prisma migrate deploy)
cd server && node src/scripts/seed.js

# Tests backend (vitest — no requieren BD, usan mocks)
cd server && npm test                # corre todo una vez
cd server && npm run test:watch      # modo watch

# Build producción
cd client && npm run build
```

> La ruta del schema (`src/prisma/schema.prisma`) está declarada en
> `server/package.json` (`prisma.schema`), así que **ningún** comando de Prisma
> necesita `--schema`.

---

## Notas Técnicas Importantes

1. **CostRecord FK:** `professorId` y `assistantId` son ambos nullable. Solo uno tiene valor según `payeeType`. No usar `payeeId` genérico (causaba error en PostgreSQL).

2. **classUnits:** Los grupos dobles fueron eliminados. Todo grupo se crea con `classUnits = 1.0` y toda sesión regular finaliza con `effectiveUnits = 1.0`. La columna `classUnits`/`effectiveUnits` y el estado `CANCELADA_MITAD` se conservan en el schema solo por compatibilidad con datos históricos; ya no se generan. Las reposiciones grupales siguen usando `effectiveUnits` como "por cuántas asistencias cuenta".

3. **Quincenas:** `period` se almacena como `"2025-06-1"` (primera) o `"2025-06-2"` (segunda). Función `getPeriodForDate()` en costEngine.js.

4. **Offline:** localStorage key `stmc_pending_sessions`. Auto-sync cuando `navigator.onLine` vuelve a true.

5. **useAuth.jsx** tiene JSX (usa `<AuthContext.Provider>`), debe tener extensión `.jsx` no `.js`.

6. **Token JWT:** almacenado en `localStorage` con key `stmc_token`. El cliente (`api/client.js`) lo agrega automáticamente en cada request como `Authorization: Bearer ...`.

7. **Motor de costos — tarifa por tramo:** El pago al profesor ya no es por estudiante individual sino por tramo (2, 3, 4, 5+). La función `getBracketRate(count, cfg)` en costEngine.js retorna la tarifa plana para ese tramo. El campo `CostRecord.rate` almacena esta tarifa de tramo (no es por estudiante).

8. **Desactivación con motivo:** `DELETE /api/students/:id` y `DELETE /api/groups/:id` ahora **requieren** `{ reason: "..." }` en el body. La UI muestra un modal. Los modelos tienen `deactivationReason` y `deactivatedAt`.

9. **Modal CSS:** Las clases `.modal-overlay` y `.modal-content` están en `index.css`. El modal se cierra al hacer clic fuera del contenido (stopPropagation en el contenido).

10. **Export Excel:** `GET /api/payroll/export?period=X` retorna un `.xlsx` binario. El frontend usa `fetch` raw (no `api.get`) para obtener el blob y disparar la descarga con `URL.createObjectURL`.

11. **Semestres:** Solo puede haber un semestre activo a la vez. Al activar uno, los demás se desactivan automáticamente. Los reportes no filtran aún por semestre automáticamente — se puede pasar `from`/`to` manualmente.

12. **StudentGroupHistory:** Se registra automáticamente en los endpoints de `/transfer`, `/enrollments` (POST y DELETE). actionType: `TRANSFER` | `ADD_GROUP` | `REMOVE_GROUP`.

13. **Edición de reportes de asistencia:** Re-finalizar una sesión REALIZADA/CANCELADA_MITAD es una edición. El flujo de asistencia detecta la sesión existente (vía `/sessions/check`), precarga el reporte y salta al paso 3 con banner "Editando reporte". El backend reemplaza **todos** los AttendanceRecord (deleteMany + createMany) para que el último reporte sea la única fuente de verdad, guarda `SessionEditLog` y recalcula costos. El historial de ediciones se ve en Reportes → Clase.

14. **Botones P/A/J:** las clases CSS de estado son en inglés (`.present/.absent/.justified`) — el mapeo está en `STATUS_CLASS` de Step3Students.jsx. La opción seleccionada lleva además `.selected` (escala + sombra) y las no seleccionadas `.dim`.

15. **Reposiciones grupales (módulo):** Una reposición es un `ClassSession` con `kind=MAKEUP` y `groupId=null`. El admin o PF la crea en `/admin/makeups` asignando fecha, profesor, asistente (opcional), estudiantes (`MakeupParticipant`) y **"por cuántas asistencias cuenta"** (`effectiveUnits`). Luego se reporta su asistencia con el mismo motor de costos (`MakeupAttendancePage` → `POST /makeups/:id/finalize`). El pago al profesor = `getBracketRate(presentes) × effectiveUnits` (todos los participantes cuentan como REGULAR, no reposición). Como genera `CostRecord`, aparece automáticamente en liquidación quincenal y en el reporte de profesor (que ahora incluye sesiones con `makeupProfessorId`/`substituteProfessorId`). Aparecen en el Dashboard de profesor/PF como "Reposiciones pendientes". El `GET /sessions` normal las **excluye** (filtra `kind=REGULAR`).

16. **Pago en Dashboard admin:** muestra el **pago de la quincena actual** (`totalPayableThisPeriod`, agregado por `period` = `getCurrentPeriod()`), no el total mensual. La liquidación es quincenal en todo el sistema.

17. **Gestión de profesores (`ProfessorsPage`):** además de crear/desactivar, el admin puede **editar** el nombre y **gestionar la cuenta de acceso** de un profesor existente. `PUT /api/professors/:id` acepta `{ name?, active?, email?, password? }`: si el profesor no tiene `User`, crea uno (`role: TEACHER`); si ya lo tiene, actualiza email y/o contraseña (bcrypt 10 rounds, mín. 8 caracteres, valida email único). `GET /api/professors` incluye `user.email` para mostrar el estado de la cuenta.

18. **Clases vistas / adquiridas:** `Student.classesAcquired` (Int, lo fija el admin en `StudentsPage`) = clases compradas. En el flujo de asistencia (Step3), `GET /groups/:id/students` devuelve además `classesSeen` (asistencias `PRESENTE` del estudiante dentro del **semestre activo**, o histórico total si no hay semestre activo) y `classesAcquired`, y se muestran como `vistas/adquiridas` al lado de cada estudiante.

19. **Sin grupos dobles:** El sistema ya no maneja clases dobles. Grupos se crean con `classUnits = 1.0`, las sesiones regulares finalizan con `effectiveUnits = 1.0` y ya no se genera el estado `CANCELADA_MITAD` ni el toggle "¿se canceló a la mitad?". Las columnas/enum se conservan solo para datos históricos.

20. **Responsive:** El layout es mobile-first pero la columna de contenido (`--page-max` en `index.css`) se ensancha por breakpoints: 480px (móvil) → 680px (≥768px) → 820px (≥1024px). `.action-bar` y `.modal-content` usan la misma variable. `.module-grid` (dashboard admin) y `.card-grid` (grupos del día) aumentan columnas en pantallas anchas.

21. **Roles Coordinador y Recepción:** El rol `PHYSICAL_TRAINER` se muestra como **"Coordinador"** en la UI (`ROLE_LABELS` en `client/src/utils/roles.js`); el valor del enum no cambió. Rol nuevo `RECEPTION`: entra directo a `/admin/students`, crea/edita estudiantes y gestiona el registro de pagos (el antiguo `PATCH /students/:id/payment-status` fue **eliminado**: el estado de pago ahora se deriva de los pagos, ver nota 44). Cuentas de ambos se crean en `/admin/users` (`/api/users`, solo ADMIN).

22. **Estados de estudiante:** `studentStatus` derivado server-side (`services/studentStatus.js`, ver nota 44): INACTIVO / SUSPENDIDO / PRUEBA / MATRICULADO / INSCRITO / PREINSCRITO. Suspensión (`POST /students/:id/suspend`, ADMIN/Coordinador): fechas+razón obligatorias, mín. 15 días, no excede el semestre; el suspendido desaparece de rosters vía `notSuspended()` (`lib/filters.js`) y reaparece al vencer. `POST /:id/unsuspend` levanta antes.

23. **Pago suspendido por reporte tardío:** una clase no reportada el mismo día (America/Bogota, `lib/dates.js`) genera CostRecord `SUSPENDED_LATE`. `firstReportedAt` se estampa SOLO en el primer finalize (editar no re-suspende). Desbloqueo: `POST /sessions/:id/unlock-payment` (solo ADMIN, botón en PayrollPage). Alerta in-app: `GET /alerts/pending-reports` + banner rojo en Dashboard. Histórico protegido (`firstReportedAt` null → nunca tardía).

24. **Triple coincidencia asistentes (con auto-validación):** el pago del asistente queda PAYABLE solo cuando coincide la información del asistente, el profesor y el coordinador. **Todo lo que coincide se valida automáticamente**: en clase REGULAR consolidada (`consolidationStatus=MATCHED`, doble reporte) profesor y coordinador ya coincidieron en el asistente, así que basta `assistantConfirmedId == assistantId` (regla en costEngine, unit-testeada). En reposiciones, si quien reporta es ADMIN/PF/SUPERADMIN se estampa `coordinatorValidated*` automáticamente (su reporte ES la info del coordinador); si reporta el TEACHER y cambia el asistente, la validación previa se limpia. `POST /sessions/:id/validate-assistant` queda como vía manual (reposiciones reportadas por profesor, sesiones legadas, override); la cola `/admin/validation` marca "Validada automáticamente" (`autoValidated` en `/sessions/validation-queue`). Corte `assistant_match_start_date` (SystemConfig, seed): sesiones anteriores siguen PAYABLE.

25. **Festivales:** `ClassSession kind=FESTIVAL` (`/api/festivals`, UI `/admin/festivals` + `/festivals/:id/attendance`). Multi-profesor vía `FestivalProfessor`; pago igualitario = `festivalRate` para cada participante (costEngine branch, siempre PAYABLE). Participantes en `MakeupParticipant`. **P y A cuentan como clase vista; J no** — regla centralizada en `services/attendanceStats.js` y aplicada en groups/reports/parent. TEACHER solo reporta festivales donde participa.

26. **Alertas de asistencia:** `GET /alerts/attendance` (ADMIN/Coordinador; UI `/admin/alerts`): desviación = esperadas − vistas, donde esperadas = fechas del calendario de los grupos del estudiante en el semestre activo (menos exclusiones, piso en `enrolledAt`; `services/schedule.js` + `services/attendanceAlerts.js`). Amarilla >2, roja >4. `GET /alerts/rain`: grupos con ≥`rain_alert_threshold` (SystemConfig, default 3) canceladas por LLUVIA. El padre ve la alerta del hijo en `GET /parent/children` (`attendanceAlert`).

27. **Políticas:** texto único en `client/src/utils/policies.js`. Primer ingreso del PARENT al portal → `PoliciesModal` bloqueante (checkbox + aceptar) → `POST /auth/accept-policies` fija `User.policiesAcceptedAt`. `/auth/login` y `/me` exponen el campo.

28. **Cancelación estructurada:** `/cancel` de sesiones/reposiciones/festivales exige `cancellationCategory` (LLUVIA/SIN_ESTUDIANTES/OTRA; texto libre solo OTRA). "No dicté la clase yo" (toggle en Step2): exige quién dictó + observación obligatoria (`dictatedByOwner/notDictatedNote`), visible en Reportes → Clase y en la cola de validación.

29. **Rol SUPERADMIN (Liquidación v2, Fase 1):** rol nuevo, **superset de ADMIN**. En el backend, `requireRole()` (`middleware/auth.js`) lo deja pasar por cualquier gate automáticamente; en el frontend, `RequireAuth` (App.jsx) y la nav de `AppShell` lo tratan igual. Solo un SUPERADMIN puede crear/gestionar cuentas ADMIN/SUPERADMIN en `/admin/users` (`manageableRoles()` en `routes/users.js` — un ADMIN no puede escalar). El **seed** asegura que exista: crea la cuenta raíz (`ADMIN_EMAIL`) como SUPERADMIN, y si ya existía como ADMIN la asciende. La separación "ADMIN solo-lectura de reportes / SUPERADMIN edita" se completa en la Fase 2 (junto con las vistas de solo-lectura); en la Fase 1 SUPERADMIN ya puede editar todo lo que editaba ADMIN.

30. **Profesor sin festivales (Liquidación v2, Fase 1):** el profesor **no reporta festivales** (ni ve la tarjeta "Festivales pendientes" ni la ruta `/festivals/:id/attendance` ni `GET /festivals`). El coordinador/admin los reporta. El profesor que **participa** en un festival igual cobra: su `CostRecord` sale en la quincena, independiente de quién reportó. El profesor **conserva** el reporte de **reposiciones asignadas** a él.

31. **Doble reporte + consolidación (Liquidación v2, Fase 2):** cada clase regular tiene **dos reportes independientes en staging** — `ClassReport` (`reporterType` PROFESSOR|COORDINATOR, `@@unique[sessionId, reporterType]`) + `ClassReportAttendance` (P/A/J por estudiante). `POST /sessions/:id/finalize` ya **no** escribe directo al `AttendanceRecord`: escribe el reporte del rol que llama (TEACHER→PROFESSOR, PHYSICAL_TRAINER→COORDINATOR, SUPERADMIN debe mandar `reporterType`) y luego corre `services/consolidation.js` → `consolidateSession()`:
    - **PENDING** (falta uno): sin `AttendanceRecord` ni costo; `ClassSession.status` queda PROGRAMADA.
    - **MATCHED** (coinciden P/A/J por estudiante + quién-dictó + asistente; la **justificación no se compara**): escribe el `AttendanceRecord` consolidado (fuente de verdad), pone `status=REALIZADA`, corre `costEngine` → **pago habilitado**.
    - **MISMATCH**: guarda `ClassSession.consolidationDiff` (Json con el detalle por estudiante), borra `AttendanceRecord`/`CostRecord`, y genera **alerta de conflicto** (`GET /alerts/report-conflicts`, banner en Dashboard + página `/admin/conflicts`). Ambos ajustan su reporte hasta coincidir.
    `ClassSession.consolidationStatus` (PENDING/MATCHED/MISMATCH) + `consolidatedAt`. `firstReportedAt` se estampa en el **primer** reporte (cualquier rol) para la regla de pago tardío. La función pura `diffReports()` está unit-testeada; el flujo se validó contra Postgres real.

32. **ADMIN solo-lectura de reportes (Fase 2):** `canReportGroup()` ya **no** admite ADMIN ni PARENT — solo TEACHER (su grupo, reporte PROFESSOR), PHYSICAL_TRAINER (reporte COORDINATOR) y SUPERADMIN. ADMIN ve los reportes en Reportes → Clase (que ahora incluye ambos `reports` + `consolidationStatus`/`diff`) pero no edita; el home de ADMIN redirige a `/admin` (no al dashboard de asistencia). La ruta `/attendance/:groupId` ahora es `['TEACHER','PHYSICAL_TRAINER']` (SUPERADMIN por superset).

39. **Borrado permanente + wipe de clases (limpieza para datos reales):** `DELETE /students/:id/permanent` y `DELETE /groups/:id/permanent` (solo ADMIN/SUPERADMIN, body `{confirm:true}`) borran de verdad al estudiante/grupo con **todos** sus registros dependientes en una transacción (el grupo también borra sus sesiones y la actividad asociada; el historial de grupo se desvincula, no se borra). En la UI son botones rojos "Eliminar definitivamente" que exigen escribir el nombre/código. La lógica del wipe de clases se extrajo a `services/wipeClassData.js` (compartida por el script y el endpoint `POST /system/wipe-classes`, **solo SUPERADMIN**, body `{confirm:"BORRAR CLASES"}`); UI: "Zona de peligro" en `/admin/config` (solo Superadmin). Todo verificado contra Postgres real (sin huérfanos; catálogo intacto).

33. **Script de limpieza de clases (Fase 2):** `node src/scripts/wipe-class-data.js` (requiere `CONFIRM_WIPE=YES` o `--yes`) vacía `ClassSession`, `ClassReport(+Attendance)`, `AttendanceRecord`, `CostRecord`, `SessionEditLog`, `FestivalProfessor`, `MakeupParticipant`, `PayrollApproval`, **conservando** usuarios, estudiantes, grupos, profesores, asistentes, semestres y config. Para el arranque limpio de semestre. **Hacer backup antes** (ver Backups de BD).

34. **Ciclo de pago y cierre de quincena (Liquidación v2, Fase 3):**
    - **"Pago realizado"**: `CostRecord.paidAt/paidById`. `PATCH /payroll/records/:id/paid` (ADMIN) marca/desmarca un costo pagado (bloqueado si la quincena está cerrada). "pago realizado" = `paidAt` fijado.
    - **Coherencia Liquidación ↔ Validación:** `GET /payroll` y `/payroll/summary` corren `refreshAssistantPayStatus(period)` (ADMIN), que re-sincroniza el `payStatus` de los pagos de asistente con la regla vigente de triple coincidencia (misma que la cola de Validación, `assistantMissing`), corrigiendo `CostRecord` que quedaron `PENDING_MATCH` de antes de la auto-validación **sin borrarlos** (conserva approvedAt/paidAt; si vuelve a PENDING limpia la aprobación). No toca SUSPENDED_LATE ni quincenas cerradas. Así ambas vistas cuentan lo mismo. La página `/admin/validation` se titula "Validación Asistentes".
    - **Vista de calendario (Liquidación):** toggle Lista/Calendario en `/admin/payroll`. `GET /payroll/calendar?from&to` (ADMIN) devuelve las clases del rango con código, profesor, presentes, costo del profesor, estado, cancelación, `dictatedByOwner` y reposiciones. `PayrollCalendar.jsx` las agrupa en malla **semana × horario × día** con tarjetas de color (verde realizada, rojo lluvia, gris otra cancelación); al tocar una abre el detalle de la clase (`GET /reports/class/:sessionId`).
    - **Aprobación por clase (Liquidación v3):** flujo secuencial **Pendiente → Aprobado → Pagado** para profesores Y asistentes. `CostRecord.approvedAt/approvedById` (Validar) y `heldAt/heldById` (Retener, excluye el pago). Solo se aprueba un PAYABLE (verde = coincidencia total; rojo = conflicto PENDING_MATCH/SUSPENDED_LATE, no aprobable). No se puede pagar sin aprobar. Endpoints: `PATCH /payroll/records/:id/approved`, `.../held`, `POST /payroll/records/bulk {ids, action: approve|unapprove|hold}` (para "Validar todo" por beneficiario y selección masiva). `/summary` devuelve `progress {total, validated, approved, paid, held, conflict, pending}` (barra) y `pendingApprovalCount` por beneficiario. `POST /payroll/close` exige que no queden PAYABLE sin decidir (aprobar/retener). Migración `20260716010000_cost_record_approval` (defensiva).
    - **Arrastre de suspendidos**: al **cerrar**, los `CostRecord` `SUSPENDED_LATE` mueven su `period` a la siguiente quincena (`getNextPeriod()` en costEngine) con `carriedFromPeriod` para trazabilidad → reaparecen en la nómina siguiente.
    - **Cierre de quincena**: `POST /payroll/close` (ADMIN). Exige que no queden pagos `PENDING_MATCH`. Congela una foto por profe/asistente en `PayrollClosureLine` (clases, pagado, arrastrado), arrastra los suspendidos, y crea `PayrollClosure(locked=true)` + `PayrollLog(CLOSE/CARRY_OVER)`. Mientras `locked`, **no se puede editar** reportes/costos de ese período (guard `isSessionPeriodLocked` en `lib/payrollLock.js`, aplicado en `/sessions/:id/finalize|cancel|unlock-payment` → 409). `POST /payroll/reopen` (ADMIN) desbloquea (log `REOPEN`; no revierte arrastres). `GET /payroll/closure?period=` da el estado. Todo en `PayrollPage` (botón por clase "Marcar pago realizado", "Cerrar/Reabrir quincena", badges de pagado/arrastrada). La vieja "Aprobar liquidación" (`PayrollApproval`) quedó reemplazada por el cierre en la UI.
    - **Migraciones defensivas**: por el `db push` heredado en prod, las migraciones usan `ADD COLUMN/CREATE ... IF NOT EXISTS` y `ensure-baseline.js` auto-revierte migraciones fallidas para que `migrate deploy` las reintente. Escribir migraciones futuras igual de defensivas.

35. **Autoservicio profesor/asistente:** en **Reporte** (`/reporte`, `ReportePage`) al tocar una clase se abre un modal con el detalle P/A/J por estudiante de esa sesión (`GET /reports/class/:sessionId`); el listado ya venía filtrado a los grupos del profesor. **Mi Quincena** (`MyPayrollPage`, TEACHER/ASSISTANT) muestra las clases separadas en pendientes por pago / ya pagadas / retenidas, navega quincenas y añade una fila de KPIs del **acumulado del semestre** (`GET /payroll/my-semester`: suma los `CostRecord` propios cuya sesión cae dentro del semestre activo, separando pagado/pendiente/retenido).

36. **Registro de pagos del estudiante:** modelo `StudentPayment` (`studentId`, `paymentDate`, `method` enum `PaymentMethod` TRANSFERENCIA/EFECTIVO/WOMPI/BOLD, `amount`, `receivedById/receivedByName` = usuario logueado que registra, `note?`). Un estudiante tiene 0..N pagos. **Historial independiente** del estado Inscrito/Matriculado (no lo modifica). Endpoints en `students.js`: `GET/POST /students/:id/payments` (ADMIN/SUPERADMIN/RECEPTION), `DELETE /students/:id/payments/:paymentId` (solo ADMIN/SUPERADMIN). UI: sección "Registro de pagos" en la ficha del estudiante (`StudentsPage`), visible solo a Recepción/Admin/Superadmin. Migración `20260712050000_student_payments` (defensiva).

43. **Visión Estratégica (`/admin/strategy`, solo ADMIN/SUPERADMIN):** tablero gerencial de una pantalla sobre `GET /reports/strategy`, agregado server-side para el **semestre activo** (o últimos 90 días sin semestre). KPIs: estudiantes activos/nuevos, **ocupación global y por grupo** (inscritos/cupo con semáforo), asistencia promedio (P vs A, J no penaliza), conversión de matrícula (matriculados vs inscritos; excluye `isTrial`), cumplimiento de clases (realizadas vs canceladas, lluvia aparte), riesgo de deserción (alertas roja/amarilla de `attendanceAlerts`), clases de prueba pendientes, y finanzas (ingresos = **todos** los `StudentPayment` del sistema sin filtro de fecha — decisión del cliente: los pagos pertenecen al semestre en curso aunque se reciban antes de su inicio — menos gasto causado `CostRecord` PAYABLE por fecha de clase del período; retenidos aparte — criterio de causación de Contabilidad). Tabla **"Contadores por grupo"**: código+nivel, profesor, inscritos/cupo, barras de ocupación y asistencia, realizadas y canceladas; orden alfanumérico.

42. **Clase de prueba:** `Student.isTrial` (migración `20260715010000` defensiva). En el paso 3 del flujo de asistencia, el menú "Agregar estudiante de reposición" ofrece **"🧪 Clase de prueba (estudiante nuevo)"** → campo de texto con el nombre → `POST /students/trial` (TEACHER/PF/ADMIN/SUPERADMIN; crea `{name, isTrial:true, classesStartDate:hoy}`, sin grupos) y se agrega a la lista como REPOSICION con badge "🧪 prueba". **Anti-duplicados**: si ya existe una prueba ACTIVA con el mismo nombre normalizado (minúsculas/sin tildes/espacios colapsados) el endpoint la **reutiliza** (`reusedExisting: true`, 200) en vez de crear otra; además, mientras se escribe el nombre (≥3 letras) el formulario sugiere estudiantes existentes (de prueba o regulares) para tocarlos y usarlos en lugar de duplicar. Duplicados históricos se depuran a mano ("Eliminar definitivamente" en la ficha). Al ser un Student real, la doble consolidación y el motor de costos lo tratan como un presente más. En `StudentsPage` se ve con badge "🧪 Prueba" (lista y ficha) y el modal de edición permite desmarcar `isTrial` para convertirlo en estudiante regular. Export incluye columna "Clase de prueba".

41. **Fecha de inicio de clases + orden alfanumérico de grupos:** `Student.classesStartDate` (@db.Date, migración `20260714020000` defensiva) se pregunta en el formulario de creación (default: hoy en Bogotá; también editable) y actúa como **piso adicional** de las clases esperadas en las alertas de asistencia (`attendanceAlerts.js`: max(enrolledAt, group.createdAt, classesStartDate)). Los listados de grupos que alimentan desplegables se ordenan **alfanuméricamente por código** ("G2" < "G10") con `lib/sort.js` (`compareCodes`, locale es + numeric): `GET /groups`, `/groups/export`, `/groups/schedule`, `/enrollment/groups` y las opciones de ReportePage. El Dashboard reagrupa por horario en el cliente, así que no le afecta.

40. **Módulo de Contabilidad (`/admin/accounting`, solo ADMIN/SUPERADMIN):** cuatro pestañas sobre datos que el sistema ya produce (la cuarta, **Pagos Estudiantes**, en la nota 44). **Ingresos** = `StudentPayment` del rango, con KPI de total/verificado/sin verificar, desglose por medio de pago (conciliación bancaria y arqueo de efectivo) y checkbox **"Verificado"** por pago (`StudentPayment.verifiedAt/verifiedById/verifiedByName`, `PATCH /accounting/payments/:id/verified`, con auditoría de quién/cuándo). **Gastos** = `CostRecord` agrupado por quincena: causado (PAYABLE), pagado (`paidAt`), pendiente de pago, retenido (SUSPENDED_LATE/PENDING_MATCH) y estado del cierre. **Balance** = ingresos vs gastos por mes calendario con resultado neto acumulado y margen. **Criterio contable:** gastos por *causación* (todo PAYABLE es compromiso, pagado o no); los retenidos NO entran al balance; el flujo de caja (pagado) se muestra aparte. Lógica pura en `services/accounting.js` (unit-testeada); ruta `routes/accounting.js` con `requireRole('ADMIN')` a nivel de router. Export Excel de 3 hojas (`GET /accounting/export`). Rango por defecto: el semestre activo (presets Este mes / Mes anterior / Semestre + fechas libres). Migración `20260714010000_payment_verification` (defensiva).

38. **Validación de datos + aceptación de políticas (flujo público):** reemplaza el módulo "Inscripciones". Página pública `/validar` (`ValidationPage`, sin shell): el acudiente entra con el **documento del estudiante** (`POST /validation/lookup`, sin auth, rate-limit), ve al estudiante **y sus hermanos** (mismo acudiente o teléfono), corrige **solo contacto** (email/WhatsApp/acudiente/fecha nac.; nombre y documento bloqueados) y acepta las políticas (`POST /validation/submit`). El submit re-deriva la familia en el servidor y solo actualiza esos ids; estampa `Student.validatedAt` + `policiesAcceptedAt`. Control para la Escuela: `/admin/enrollment` ahora es `ValidationAdminPage` (ADMIN/Coordinador/Recepción) con el enlace para compartir, KPIs y lista validados/pendientes (`GET /validation/status`). Migración `20260712060000_student_validation` (defensiva). Nota: sin segundo factor (solo el documento) por decisión del usuario. `routes/validation.js` va montado **sin** `authMiddleware` global (público); `/status` aplica auth inline.

37. **Rol Recepción (ampliado):** Recepción **crea y edita** estudiantes (`POST /students`, `PUT /students/:id` — pero **nunca** activa/desactiva: el PUT ignora `active` para RECEPTION; suspender/desactivar/cambiar grupo siguen siendo ADMIN/Coordinador) y gestiona el **registro de pagos**. Además **ve** Horarios y Grupos (`/admin/groups` en modo lectura: `canEdit` la excluye, así que no ve botones de mutación). No accede a nada más. En `StudentsPage`: `canManage` (ADMIN/SUPERADMIN/Coordinador) para acciones avanzadas vs `canEdit` (= `canManage` + Recepción) para crear/editar.

44. **Estados de estudiante v2 + Pagos Estudiantes (rediseño):** el estado ya **no** sale del checkbox manual `paymentComplete` (columna legacy, sin uso) sino que se **deriva** en `services/studentStatus.js` de los datos reales: **PRUEBA** (isTrial), **PREINSCRITO** (registrado, sin asistencia ni pagos), **INSCRITO** (alguna asistencia PRESENTE y/o algún pago), **MATRICULADO** (pago completo: `StudentPayment` acumulado ≥ valor esperado), más SUSPENDIDO/INACTIVO que ganan prioridad. **Valor esperado** = `classesAcquired × (tarifa_plan / tuition_plan_classes)` según categoría por edad: **ADULTO** (≥ `tuition_adult_age`, **16** — decisión del cliente; migración `20260716020000` corrige el 18 sembrado antes) → `tuition_adult_total` (2.789.000 por 40 clases); **PEQUEÑO** → `tuition_child_total` (2.425.000 por 40 clases). Tarifas en SystemConfig (seed + `/admin/config`, sección "Matrícula de estudiantes"). `attachStudentStatus(students)` decora listas con `studentStatus`, `missingBirthDate` y `tuition {category, expectedTotal, totalPaid, balance}` en 2 queries agregadas; `stripTuition(list, role)` quita los montos para roles sin acceso económico (solo ADMIN/SUPERADMIN/RECEPTION los ven; PARENT solo los de su hijo). Aplica en `/students`, `/groups/:id/students`, `/groups/schedule`, `/search`, `/parent/children`, `/makeups/:id`, `/festivals/:id` y la Visión Estratégica. **Íconos únicos en todo el sistema** (`client/src/utils/studentStatus.jsx`): ✅ Matriculado · 🔵 Inscrito · 📝 Preinscrito · 🧪 Prueba · ⏸️ Suspendido · ⛔ Inactivo — siempre junto al nombre (lista/ficha de estudiantes, roster de asistencia, reposiciones, festivales, malla de horarios, buscador ⌘K, portal padres). **Error de fecha de nacimiento**: un estudiante regular activo sin `birthDate` no tiene tarifa → `missingBirthDate` con ⚠️ en todas las vistas, contador+filtro "Sin fecha de nacimiento" en StudentsPage, y `POST /students` la exige (400); `/students/trial` no. **Pagos Estudiantes**: 4.ª pestaña de `/admin/accounting` y 4.ª hoja del export — por estudiante activo: estado, categoría, clases adquiridas, valor esperado, pagado y **saldo pendiente** (deuda contra el plan completo, no depende del rango). El export de estudiantes incluye las mismas columnas solo para roles con dinero (Coordinador exporta sin montos). Sin migración de schema (todo derivado). Unit tests en `tests/unit/studentStatus.test.js`. **Backfill de fechas de nacimiento**: si el Excel subido a Importar **no** trae la hoja "Consolidado Matrícula" pero alguna hoja tiene columnas NOMBRE COMPLETO + FECHA DE NACIMIENTO (p. ej. la hoja PRE-INSCRITOS del archivo de inscripciones), `importFromBuffer` entra en modo `birthdates` (`parseBirthDates`/`importBirthDates` en `enrollmentImport.js`): empareja por documento (o nombre normalizado) y rellena **solo** las fechas faltantes, nunca pisa una existente; dryRun previsualiza y lista los no encontrados (unit tests en `tests/unit/birthdateImport.test.js`).
