# AsisteciaSTMC — Sistema de Asistencia Academia de Tenis

## Contexto del Proyecto

Sistema completo de gestión de asistencia para una academia de tenis. Migración de Netlify + Google Sheets (lento, gratuito) a Railway + PostgreSQL (pagado, rápido). Versión 2 del sistema con motor de costos, liquidación quincenal y roles diferenciados.

**Email admin:** jasblleidy@gmail.com  
**Repositorio:** JasblleidyPirazan/AsisteciaSTMC  
**Branch de trabajo:** el que indique la sesión; el trabajo terminado se integra a `main`  
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
| `Student` | Estudiantes, vinculados a un padre (parentUserId). `classesAcquired` = clases compradas. Estado derivado `studentStatus` (ver notas 44 y 55): PRUEBA/PREINSCRITO/INSCRITO/MATRICULADO/**GRADUADO**/SUSPENDIDO/INACTIVO — se calcula de pagos+tarifas (la asistencia ya no cambia el estado: D7) y de si consumió su paquete (GRADUADO), NO del checkbox `paymentComplete` (columna legacy sin uso). Suspensión temporal con `suspendedFrom/Until/Reason` (excluido de rosters por query, sin cron) |
| `Group` | Grupos de clase: días, horario, cancha, nivel (Roja/Naranja/Verde/Amarilla/Intermedio/Avanzado) + `subLevel` A/B/C informativo (solo los 4 colores) |
| `StudentEnrollment` | Relación estudiante↔grupo (PRIMARY o SECONDARY). `weekdays` (`Int[]`, 0 = domingo … 6 = sábado) = días que el estudiante toma en ese grupo; `null`/vacío = todos los días del grupo (D9, nota 56) |
| `ClassSession` | Sesión de clase: PROGRAMADA/REALIZADA/CANCELADA/CANCELADA_MITAD(legacy). `kind` REGULAR/MAKEUP/FESTIVAL. Cancelación estructurada (`cancellationCategory` LLUVIA/SIN_ESTUDIANTES/OTRA). "No dicté la clase yo": `dictatedByOwner` + `notDictatedNote` obligatoria. Pago suspendido: `firstReportedAt` (solo primer reporte) + `paymentUnlocked*`. Triple coincidencia: `assistantConfirmedId/At` + `coordinatorValidated*`. Festivales: `festivalRate` |
| `FestivalProfessor` | Profesores participantes de un festival (M2M sessionId+professorId); cada uno cobra `festivalRate` (pago igualitario) |
| `MakeupParticipant` | Estudiantes asignados a una reposición grupal (sessionId + studentId). `bookedAt` = lo reservó el acudiente desde su enlace (nota 53) |
| `MakeupBookingSuggestion` | Horarios alternativos que sugiere el acudiente desde el enlace de agendamiento cuando ningún turno le sirve (`resolvedAt` = atendida) |
| `AttendanceRecord` | Asistencia por estudiante: PRESENTE/AUSENTE/JUSTIFICADA/NO_APLICA + tipo REGULAR/REPOSICION |
| `CostRecord` | Costos calculados por sesión (professorId XOR assistantId, payeeType). `payStatus`: PAYABLE / SUSPENDED_LATE (reporte tardío, desbloquea solo ADMIN) / PENDING_MATCH (asistente sin triple coincidencia). Liquidación y export separan habilitado vs retenido |
| `MakeupClass` | (Legacy, sin uso) — las reposiciones grupales ahora viven en `ClassSession` con `kind=MAKEUP` |
| `Event` | Torneos/clínicas con pago fijo |
| `EnrollmentRequest` | Solicitudes de inscripción (estado PENDING/APPROVED/REJECTED) |
| `OperatingExpense` | Gastos operativos de la academia que **no** salen de la liquidación de clases (arriendo, servicios, implementos, nómina administrativa). `kind` FIJO (monto **por quincena**, vigente entre `startDate` y `endDate`; sin fin = indefinido) / VARIABLE (una sola vez, cargado a `period`). `category` (9 valores), `provider`, `note`, `active` (archivar) |
| `OperatingExpensePayment` | Marca de pago de **una** quincena de un gasto operativo (`@@unique[expenseId, period]`): un gasto fijo se paga quincena por quincena |
| `SystemConfig` | Tarifas configurables: rate_2_students, rate_3_students, rate_4_students, rate_5plus_students, assistant_fixed_rate + matrícula: tuition_adult_total (2.789.000), tuition_child_total (2.425.000), tuition_plan_classes (40), tuition_adult_age (16) |
| `StudentGroupHistory` | Historial de cambios de grupo: TRANSFER, ADD_GROUP, REMOVE_GROUP |
| `Semester` | Semestres: nombre, fechas inicio/fin, activo (solo uno activo a la vez) |
| `SemesterExclusion` | Fechas excluidas de un semestre (festivos, vacaciones) |
| `SessionEditLog` | Log de ediciones de reportes de asistencia (previousState/newState en Json) |

---

## Motor de Costos

Archivo: `server/src/services/costEngine.js`

- Se ejecuta al hacer `POST /api/sessions/:id/finalize`
- Todas las clases regulares valen `effectiveUnits = 1.0` (los grupos dobles fueron eliminados del sistema). Las reposiciones grupales sí pueden definir `effectiveUnits` = "por cuántas asistencias cuenta" (sencilla = 1, doble = 2; ver nota 49)
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
4. Step3: Lista de estudiantes con botones P/A/J/N-A (44×44px); al lado de cada estudiante se muestran las **clases vistas / adquiridas** del semestre activo; agregar reposición
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
- `GET /api/makeups` — lista reposiciones (TEACHER solo las propias; **ASSISTANT todas**, para marcar acompañamiento — sin la ficha de los estudiantes). Filtros: `status`, `date`, `from`, `to`
- `GET /api/makeups/:id` — detalle con participantes y asistencia
- `POST /api/makeups` (ADMIN, PHYSICAL_TRAINER) — crear: `{ date, title?, professorId, assistantId?, countsAsUnits, studentIds[] }`. Crea un `ClassSession` `kind=MAKEUP` con `effectiveUnits=countsAsUnits`
- `PUT /api/makeups/:id` (ADMIN, PF) — editar meta/participantes (recalcula costos si ya estaba reportada)
- `DELETE /api/makeups/:id` (ADMIN, PF) — eliminar (borra asistencia, costos, participantes)
- `POST /api/makeups/:id/finalize` — reportar asistencia (ADMIN/PF cualquiera, TEACHER solo si es el profesor asignado/sustituto). Reemplaza registros, recalcula costos, guarda `SessionEditLog` en ediciones
- `POST /api/makeups/:id/cancel` — cancelar con motivo
- `PUT /api/makeups/:id` con `studentIds` solo quita/agrega los que cambian (conserva el `bookedAt` de los que siguen)
- Los asistentes acompañan reposiciones vía el mismo `POST /api/sessions/:id/assist` (que ahora rechaza pisar la confirmación de otro asistente, 409, igual que la variante por grupo+fecha)
- `finalize`/`cancel`/`PUT`/`DELETE` respetan el cierre de quincena (`isSessionPeriodLocked` → 409), igual que las clases regulares

### Agendamiento público de reposiciones (nota 53)
- `GET /api/makeup-booking/:token` — **público**, sin login: estudiante, deuda de reposiciones, turnos y sus reservas
- `POST /api/makeup-booking/:token/book` — reservar `{ date, slotKey }`
- `DELETE /api/makeup-booking/:token/book/:sessionId` — cancelar una reserva propia (hasta 24 h antes)
- `POST /api/makeup-booking/:token/suggestions` — sugerir otro horario `{ text }`
- `GET /api/makeup-booking/admin/overview` (ADMIN/Coordinador) — agenda, estudiantes por reponer con su enlace, sugerencias
- `POST /api/makeup-booking/admin/students/:id/link` (ADMIN/Coordinador) — crea el enlace (o lo rota con `{ regenerate: true }`)
- `PATCH /api/makeup-booking/admin/suggestions/:id` (ADMIN/Coordinador) — `{ resolved }`

### Estudiantes — gestión de grupos
- `POST /api/students/:id/transfer` — cambiar grupo (registra historial). Body: `{ fromGroupId?, toGroupId, reason?, weekdays? }`
- `POST /api/students/:id/enrollments` — agregar a grupo adicional. Body: `{ groupId, enrollmentType?, weekdays? }`
- `PATCH /api/students/:id/enrollments/:groupId` — cambia solo los días que toma en ese grupo: `{ weekdays }` (`null` = todos) (ADMIN/SUPERADMIN/Coordinador)
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
- `GET /api/reports/students-tracking` — Seguimiento de Estudiantes (ADMIN/SUPERADMIN/Coordinador): una fila por estudiante activo con el consumo de su paquete en el semestre
- `GET /api/reports/students-tracking/export?countAbsences=` — Excel de la misma tabla
- `GET /api/reports/assistant/:id`
- `GET /api/reports/professor/:id`
- `GET /api/reports/class/:sessionId`
- `GET/PUT /api/config`
- `GET /api/payroll/export?period=X` — descarga Excel. ADMIN: 3 hojas (Profesores, Asistentes, Resumen). TEACHER/ASSISTANT: una sola hoja "Mi liquidación" con solo sus registros
- `GET /api/accounting/summary?from=Y-M-D&to=Y-M-D` — módulo Contabilidad (solo ADMIN/SUPERADMIN): ingresos + gastos por quincena + balance mensual + `studentsTuition` (ingresos y deudas por estudiante)
- `PATCH /api/accounting/payments/:id/verified` — marcar/desmarcar pago de estudiante como verificado (conciliado)
- `GET /api/accounting/export?from&to` — Excel de 5 hojas (Ingresos, Gastos, Gastos Operativos, Balance, Pagos Estudiantes)
- `GET /api/accounting/expenses?includeInactive=` — gastos fijos y variables registrados (con sus quincenas pagadas)
- `POST /api/accounting/expenses` — crear: `{ kind: FIJO|VARIABLE, category, concept, amount, provider?, note?, startDate+endDate? (FIJO), expenseDate (VARIABLE) }`
- `PUT /api/accounting/expenses/:id` — editar
- `DELETE /api/accounting/expenses/:id[?permanent=true]` — archivar (`active=false`) o borrar de verdad
- `PATCH /api/accounting/expenses/:id/paid` — marcar/desmarcar pagada **una** quincena: `{ period, paid }`
- `POST /api/system/import-attendance` — importar asistencia desde Excel (solo SUPERADMIN), `{ fileBase64, dryRun }` (dryRun por defecto). Ver nota 51
- `GET /api/system/export/database?format=xlsx|json` — export completo de la base de datos (ADMIN/SUPERADMIN): una hoja por tabla + diccionario de datos; contraseñas redactadas
- `GET /api/semesters` — lista semestres
- `GET /api/semesters/active` — semestre activo
- `POST /api/semesters` — crear semestre (ADMIN)
- `PUT /api/semesters/:id` — editar / activar semestre (ADMIN)
- `DELETE /api/semesters/:id` — eliminar semestre (ADMIN)
- `POST /api/semesters/:id/exclusions` — agregar fecha excluida (ADMIN)
- `DELETE /api/semesters/:id/exclusions/:exclId` — eliminar fecha excluida (ADMIN)

### Ledger del paquete (nota 59)
- `GET /api/ledger` (ADMIN/SUPERADMIN/Coordinador/Recepción) — `{ semester, window, today, summary, ledgers }`; filtros `groupId`, `semaforo` (VERDE/AMBAR/ROJO/GRIS), `q` (nombre o documento, sin tildes). Ordenado por urgencia (déficit → por agendar → sin consolidar)
- `GET /api/ledger/groups` (ADMIN/SUPERADMIN/Coordinador) — por grupo: plan, dadas, festivos (con fecha y motivo), lluvia, fin planeado/estimado y agregados de sus estudiantes
- `GET /api/ledger/:studentId` — un ledger (+ Profesor solo de sus grupos, Padre solo su hijo)

### Portal padres
- `GET /api/parent/children`
- `GET /api/parent/attendance/:studentId`

---

## Deploy en Railway — Pasos Completados

1. ✅ Variables de entorno configuradas en Railway
2. **Deploy automático al hacer push.** Railway reconstruye sola cuando llega un
   push a la rama que tiene configurada en Settings → Source → Branch.
   ⚠️ La instrucción anterior de apuntar Railway a `claude/ecstatic-goldberg-UpKEn`
   quedó **obsoleta**: esa rama se quedó en 2026-07-12, casi 100 commits atrás,
   mientras producción corre funcionalidad muy posterior. **No apuntar Railway a
   ella** — sería devolver el sistema meses atrás. El trabajo terminado va a `main`,
   que es lo que se despliega; si la rama configurada en Railway fuera otra,
   confirmarlo en el panel antes de asumir que un push llegó a producción.
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
  - `attendanceStats` → `absenceCounts`, `attendanceUnits`, `consumedUnits`, `roundUnits`
- `tests/integration/` — rutas con **supertest**:
  - `auth.middleware` → `authMiddleware` (401 sin/mal token, usuario inactivo) + `requireRole` (403)
  - `sessions.guards` → permisos de `POST /sessions` por cada rol (`lib/permissions.js`); `permissions`/`semesterWindow` (unit) y `makeups.flow` cubren el resto
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
| `/admin/makeup-booking` | MakeupBookingAdminPage — Agendar reposiciones | ADMIN, PHYSICAL_TRAINER |
| `/reponer/:token` | MakeupBookingPage — agendamiento del acudiente | Público (enlace personal) |
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

- **Reportar / cancelar (clases regulares, reposiciones y festivales):** una sola función, `canReport(user, session, professorId)` en `server/src/lib/permissions.js` (reemplaza a los antiguos `canReportGroup`, `canReportMakeup` y `canReportFestival`, que no coincidían entre sí) — SUPERADMIN y Coordinador siempre; ADMIN solo MAKEUP y FESTIVAL (en clases regulares es solo-lectura); TEACHER en REGULAR si es el titular del grupo, en MAKEUP si es el profesor asignado o el sustituto, en FESTIVAL nunca; PARENT, ASSISTANT y Recepción nunca (el asistente acompaña por `/assist`). `professorIdOf(user)` resuelve el `Professor` vinculado al usuario
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

## Reglas de negocio del paquete

> **Fuente de verdad.** Estas reglas son decisiones cerradas del cliente y **prevalecen** sobre cualquier nota técnica de abajo que las contradiga. El detalle completo, los casos de prueba y el plan de implementación (tareas T1–T10) están en `docs/brief-implementacion.md`. `buildLedger` (T4, nota 58), su cargador `loadLedgers` y los endpoints `/api/ledger` (T5, nota 59) son **la única definición** de estado, consumo, reposición, calendario y déficit: desde T6 (nota 60) todas las pantallas y rutas leen de ahí y los motores anteriores se borraron.

### 0. Decisiones de negocio (cerradas)

| # | Tema | Regla |
|---|---|---|
| D1 | Cancelación OTRA | Causa de la Escuela. Cada estudiante del grupo al que le tocaba ese día gana una reposición (cuenta en `reposicion.otras`). No consume paquete. |
| D2 | Cancelación SIN_ESTUDIANTES | Causa del alumno. Consume una clase a cada estudiante del grupo al que le tocaba ese día (cuenta en `consumidas.ausentes`), sin crear registros: es derivado. No genera reposición. |
| D3 | JUSTIFICADA en FESTIVAL | No consume y no genera reposición. |
| D4 | Ventana del semestre | Una clase o reposición cuenta para el semestre si su fecha está en `[semester.startDate, siguienteSemestre.startDate)`. Si no hay semestre posterior, no hay límite superior. `Semester.endDate` se usa solo para proyecciones ("alcanza antes del cierre"). |
| D5 | Suspensión | Congela el paquete. Entre `suspendedFrom` y `suspendedUntil` (inclusive): una AUSENTE no consume, no se le esperan clases, y lluvia, OTRA, SIN_ESTUDIANTES y festivos de ese período no le aplican. Un PRESENTE sí consume siempre (asistió de verdad). |
| D6 | % de asistencia | `presentes / (presentes + ausentes)`. JUSTIFICADA y N/A fuera del denominador. Es un indicador de comportamiento, no del paquete. |
| D7 | Estado por pago | PREINSCRITO = sin pagos. INSCRITO = pago parcial (0 < pagado < valor del plan). MATRICULADO = pagado ≥ valor del plan. La asistencia no cambia el estado. GRADUADO, SUSPENDIDO, PRUEBA e INACTIVO se mantienen con su prioridad actual. |
| D8 | Alertas individuales | Eliminadas en T6 (`/alerts/attendance`, `services/attendanceAlerts.js`, pestaña "Individuales"). Las reemplaza la pantalla del ledger. |
| D9 | Días que toma el estudiante | Se registran en la matrícula: `StudentEnrollment.weekdays`. N/A deja de ser la fuente; queda como excepción puntual. |
| D10 | Quién entra al Cumplimiento | Todo estudiante activo, no de prueba, con paquete > 0, sin importar su estado de pago. |

**Reglas que no cambian y se mantienen tal como están:** la falta sin justificar consume la clase; N/A no cuenta para nada; festivos y recesos no se reponen (se reprograma el calendario); una reposición doble vale 2; las faltas solo cuentan desde `classesStartDate`.

### 1. Especificación del ledger (`server/src/services/studentLedger.js`)

#### 1.1 Entradas de la función pura `buildLedger(input)`

```js
{
  student:     { id, name, isTrial, active, classesAcquired, previousClasses,
                 classesStartDate, suspendedFrom, suspendedUntil },
  enrollments: [{ groupId, enrolledAt, weekdays /* [0..6] | null */,
                  group: { id, code, active, createdAt,
                           lunes, martes, miercoles, jueves, viernes, sabado, domingo } }],
  records:     [{ status, attendanceType, justification,
                  session: { id, date, kind, status, effectiveUnits, groupId } }],
  sessions:    [{ id, groupId, date, kind, status, cancellationCategory, consolidationStatus }],
               // sesiones REGULAR de SUS grupos dentro de la ventana
  scheduled:   [{ sessionId, date, effectiveUnits }],
               // MakeupParticipant en sesiones kind=MAKEUP status=PROGRAMADA
  exclusions:  ['YYYY-MM-DD', ...],
  window:      { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' | null },   // D4
  semesterEnd: 'YYYY-MM-DD',
  today:       'YYYY-MM-DD',
  tuition:     { totalPaid, expectedTotal }                        // para D7
}
```

Todas las fechas se comparan como cadenas `YYYY-MM-DD` (hora de Bogotá, helpers de `lib/dates.js`).

#### 1.2 Predicados internos (una sola definición cada uno)

| Nombre | Definición |
|---|---|
| `inWindow(date)` | `window.from ≤ date` y (`window.to` nulo o `date < window.to`) |
| `suspended(date)` | `suspendedFrom` y `suspendedUntil` existen y `suspendedFrom ≤ date ≤ suspendedUntil` |
| `absenceCounts(date)` | (`classesStartDate` nulo o `date ≥ classesStartDate`) y `!suspended(date)` |
| `floor(enrollment)` | máximo de `enrolledAt`, `group.createdAt`, `classesStartDate` (como fecha) |
| `takesDay(enrollment, date)` | `enrollment.weekdays` nulo → el grupo tiene ese día; si no → `weekday(date) ∈ weekdays` |
| `isMine(enrollment, date)` | `group.active` y `takesDay` y `date ≥ floor(enrollment)` y `!suspended(date)` y `date ∉ exclusions` |
| `units(session)` | `effectiveUnits > 0 ? effectiveUnits : 1` |
| `isMakeup(record)` | `attendanceType === 'REPOSICION'` o `session.kind === 'MAKEUP'` |
| `heldOn(groupId, date)` | existe sesión de ese grupo y fecha con `status` REALIZADA o CANCELADA (cualquier categoría) |
| `round1(n)` | redondeo a un decimal (`roundUnits` actual) |

Solo se consideran `records` y `sessions` con `inWindow(date)`.

#### 1.3 Campos de salida y fórmula de cada uno

**paquete**
- `adquiridas = classesAcquired`
- `previas = previousClasses`
- `total = adquiridas + previas`

**consumidas**
- `presentes` = Σ `units(session)` de registros PRESENTE con `!isMakeup` (kind REGULAR o FESTIVAL)
- `ausentes` = Σ `units(session)` de registros AUSENTE con `!isMakeup` y `absenceCounts(date)` **+ 1 por cada sesión CANCELADA · SIN_ESTUDIANTES** de sus grupos con `isMine(enrollment, date)` y sin registro del estudiante en esa sesión (D2)
- `reposicionesVistas` = Σ `units(session)` de registros con `isMakeup` y (PRESENTE, o AUSENTE con `absenceCounts`)
- `total = round1(presentes + ausentes + reposicionesVistas)`
- `excedente = max(0, total − paquete.total)`

**noConsumen**
- `justificadas` = número de registros JUSTIFICADA (cualquier sesión)
- `na` = número de registros NO_APLICA

**reposicion** (derecho que la Escuela debe ofrecer)
- `lluvia` = número de sesiones CANCELADA · LLUVIA, kind REGULAR, de sus grupos, `date ≤ today`, `isMine`
- `otras` = igual con categoría OTRA (D1)
- `justificadas` = número de registros JUSTIFICADA con `session.kind === 'REGULAR'`, `attendanceType === 'REGULAR'` y `absenceCounts(date)` (una J en festival o en reposición no suma: D3 y C2)
- `derecho = lluvia + otras + justificadas`
- `repuestas = consumidas.reposicionesVistas` (una falta a la reposición la pierde y salda la deuda)
- `pendientes = round1(min(max(0, derecho − repuestas), pendientes.total))`
- `agendadas` = Σ `effectiveUnits` de `scheduled`
- `porAgendar = max(0, pendientes − agendadas)`
- `items` = lista de origen `{ type: 'RAIN'|'OTHER'|'JUSTIFIED', date, groupCode }` y `repuestasItems` = `{ date, label, units, absent }` (mismo formato que usaba el antiguo `computeMakeupDebt`, ya eliminado)

**calendario** (reprogramación)
- `festivos` = número de fechas en `exclusions` con `date ≤ today`, `isMine` ignorando la condición `date ∉ exclusions`, y `!heldOn(groupId, date)`. Un estudiante en dos grupos el mismo día suma por cada grupo.
- `sobranteReposicion = max(0, repuestas − derecho)`
- `recuperables = round1(min(max(0, festivos − sobranteReposicion), max(0, pendientes.total − reposicion.pendientes)))`
- `items` = `{ date, groupCode, reason }`

**pendientes** (necesidad: lo que hace falta para llegar a pagadas = vistas; siempre suma)
- `total = max(0, round1(paquete.total − consumidas.total))`
- `from` = `today` si no tiene registro con fecha `today`; si lo tiene, el día siguiente
- `restantesEnSemestre` = número de fechas `d` con `from ≤ d ≤ semesterEnd`, para algún enrollment `isMine(enrollment, d)`, sin repetir fecha por grupo
- `cubreCalendario = min(total, restantesEnSemestre)`
- `resto1 = total − cubreCalendario`
- `agendadasAplicadas = min(resto1, reposicion.agendadas)`
- `resto2 = resto1 − agendadasAplicadas`
- `porAgendar = min(resto2, max(0, reposicion.pendientes − agendadasAplicadas))`
- `deficit = resto2 − porAgendar`
- **Invariante:** `total === cubreCalendario + agendadasAplicadas + porAgendar + deficit`

**sinConsolidar**
- `clases` = número de fechas esperadas (`isMine`, `date ≤ today`) para las que no existe sesión de ese grupo con `status === 'REALIZADA'` ni `status === 'CANCELADA'`
- `conflictos` = número de sesiones de sus grupos con `consolidationStatus === 'MISMATCH'` y `isMine`

**proyeccion**
- `n = ceil(max(0, pendientes.total − reposicion.agendadas))`
- `fin` = la n-ésima fecha `isMine` a partir de `from`, buscando hasta 400 días; `null` si `n = 0` o no alcanza
- `excedeSemestre = fin > semesterEnd`

**asistencia** (comportamiento, D6)
- `presentes` = número de registros PRESENTE (todas las sesiones)
- `faltas` = número de registros AUSENTE con `absenceCounts(date)`
- `justificadas = noConsumen.justificadas`
- `tasa = presentes + faltas > 0 ? round((presentes / (presentes + faltas)) × 100) : null`

**status** (prioridad de arriba hacia abajo)
1. INACTIVO si `!active`
2. SUSPENDIDO si `suspended(today)`
3. PRUEBA si `isTrial`
4. GRADUADO si `paquete.total > 0` y `pendientes.total === 0`; `graduadoEl` = fecha del registro con el que `consumidas.total` alcanzó `paquete.total` (recorrido cronológico)
5. MATRICULADO si `tuition.expectedTotal` no es nulo y `totalPaid ≥ expectedTotal`
6. INSCRITO si `totalPaid > 0`
7. PREINSCRITO

`tuitionStatus` = el mismo cálculo sin el paso 4 (para Contabilidad y Visión Estratégica, como hoy).

**semaforo** (para la UI; se calcula en el servidor para que haya uno solo)
- GRIS si `status ∈ {GRADUADO, PRUEBA, SUSPENDIDO, INACTIVO}`
- ROJO si `paquete.total === 0`, o `pendientes.deficit > 0`, o `sinConsolidar.clases ≥ 3`
- AMBAR si `reposicion.porAgendar > 0` o `sinConsolidar.clases > 0`
- VERDE en otro caso

#### 1.4 Cargador `loadLedgers({ studentIds?, groupIds?, semester })`

Una sola pasada: estudiantes activos con `enrollments.group`, registros con sesión dentro de la ventana, sesiones REGULAR de sus grupos en la ventana, participaciones PROGRAMADA, exclusiones, semestres (para calcular `window.to`), sumas de pago y tarifas (`getTuitionConfig`). Devuelve `{ semester, window, ledgers: [...] }`. Sin semestre activo devuelve `ledgers: []`.

#### 1.5 Endpoints nuevos

| Método y ruta | Roles | Devuelve |
|---|---|---|
| `GET /api/ledger` | ADMIN, SUPERADMIN, PHYSICAL_TRAINER, RECEPTION | `{ semester, summary, ledgers }` con filtros `groupId`, `semaforo`, `q` |
| `GET /api/ledger/:studentId` | los anteriores + TEACHER (solo sus grupos) + PARENT (solo su hijo) | un ledger |
| `GET /api/ledger/groups` | ADMIN, SUPERADMIN, PHYSICAL_TRAINER | por grupo: plan, dadas, festivos, lluvia, fin estimado, y agregados de sus estudiantes (`deficit`, `porAgendar`, `sinConsolidar`) |

`summary` = sumas de `paquete.total`, `consumidas.total` (topadas en el paquete), `pendientes.*` y conteo por semáforo, sobre estudiantes con `paquete.total > 0` (D10). RECEPTION y TEACHER reciben el ledger sin `tuition`.

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

13. **Edición de reportes de asistencia:** Re-finalizar una sesión REALIZADA/CANCELADA_MITAD es una edición. El flujo de asistencia detecta la sesión existente (vía `/sessions/check`), precarga el reporte propio **completo** — asistencia, y también **asistente y quién dictó** desde el `ClassReport` del rol (no de la sesión: `ClassSession.assistantId` solo se llena al consolidar MATCHED; `/check` resuelve los nombres de esos ids sueltos) — y salta al paso 3 con banner "Editando reporte" + tarjeta "🤝 Asistente: X · ✏️ Editar" que regresa al paso 2. El backend reemplaza **todos** los AttendanceRecord (deleteMany + createMany) para que el último reporte sea la única fuente de verdad, guarda `SessionEditLog` y recalcula costos. El historial de ediciones se ve en Reportes → Clase.

14. **Botones P/A/J:** las clases CSS de estado son en inglés (`.present/.absent/.justified`) — el mapeo está en `STATUS_CLASS` de Step3Students.jsx. La opción seleccionada lleva además `.selected` (escala + sombra) y las no seleccionadas `.dim`.

15. **Reposiciones grupales (módulo):** Una reposición es un `ClassSession` con `kind=MAKEUP` y `groupId=null`. El admin o PF la crea en `/admin/makeups` asignando fecha, profesor, asistente (opcional), estudiantes (`MakeupParticipant`) y **"por cuántas asistencias cuenta"** (`effectiveUnits`). Luego se reporta su asistencia con el mismo motor de costos (`MakeupAttendancePage` → `POST /makeups/:id/finalize`). El pago al profesor = `getBracketRate(presentes) × effectiveUnits` (todos los participantes cuentan como REGULAR, no reposición). Como genera `CostRecord`, aparece automáticamente en liquidación quincenal y en el reporte de profesor (que ahora incluye sesiones con `makeupProfessorId`/`substituteProfessorId`). El `GET /sessions` normal las **excluye** (filtra `kind=REGULAR`). **Flujo completo (como una clase normal):** el **coordinador** la crea → le aparece al **profesor titular** en su Dashboard, separada en "Reposiciones por reportar" (fecha ≤ hoy, con aviso de pago suspendido por reporte tardío) y "Próximas reposiciones" (informativas) → le aparece al **asistente** en su vista del día, en la sección "🔁 Reposiciones del día" con el mismo toggle de acompañamiento (badge "Asignada a ti" si el coordinador lo asignó; visible también en días excluidos del semestre, donde no hay clases regulares) → el profesor la reporta y corre el motor de costos. **Auto-validación del asistente:** al asignarlo en la creación/edición, el coordinador ya declaró su parte de la triple coincidencia, así que se estampa `coordinatorValidated*` desde ahí; si el profesor reporta ese mismo asistente el pago queda PAYABLE en cuanto el asistente confirme, y si lo cambia la validación se limpia y vuelve a la cola de Validación.

16. **Pago en Dashboard admin:** muestra el **pago de la quincena actual** (`totalPayableThisPeriod`, agregado por `period` = `getCurrentPeriod()`), no el total mensual. La liquidación es quincenal en todo el sistema.

17. **Gestión de profesores (`ProfessorsPage`):** además de crear/desactivar, el admin puede **editar** el nombre y **gestionar la cuenta de acceso** de un profesor existente. `PUT /api/professors/:id` acepta `{ name?, active?, email?, password? }`: si el profesor no tiene `User`, crea uno (`role: TEACHER`); si ya lo tiene, actualiza email y/o contraseña (bcrypt 10 rounds, mín. 8 caracteres, valida email único). `GET /api/professors` incluye `user.email` para mostrar el estado de la cuenta.

18. **Clases vistas / adquiridas:** `Student.classesAcquired` (Int, lo fija el admin en `StudentsPage`) = clases compradas. En el flujo de asistencia (Step3), `GET /groups/:id/students` devuelve además `classesSeen` (asistencias `PRESENTE` del estudiante dentro del **semestre activo**, o histórico total si no hay semestre activo) y `classesAcquired`, y se muestran como `vistas/adquiridas` al lado de cada estudiante. El estado `NO_APLICA` no cuenta como clase vista (ver nota 45).

19. **Sin grupos dobles:** El sistema ya no maneja clases dobles. Grupos se crean con `classUnits = 1.0`, las sesiones regulares finalizan con `effectiveUnits = 1.0` y ya no se genera el estado `CANCELADA_MITAD` ni el toggle "¿se canceló a la mitad?". Las columnas/enum se conservan solo para datos históricos.

20. **Responsive:** El layout es mobile-first pero la columna de contenido (`--page-max` en `index.css`) se ensancha por breakpoints: 480px (móvil) → 680px (≥768px) → 820px (≥1024px). `.action-bar` y `.modal-content` usan la misma variable. `.module-grid` (dashboard admin) y `.card-grid` (grupos del día) aumentan columnas en pantallas anchas.

21. **Roles Coordinador y Recepción:** El rol `PHYSICAL_TRAINER` se muestra como **"Coordinador"** en la UI (`ROLE_LABELS` en `client/src/utils/roles.js`); el valor del enum no cambió. Rol nuevo `RECEPTION`: entra directo a `/admin/students`, crea/edita estudiantes y gestiona el registro de pagos (el antiguo `PATCH /students/:id/payment-status` fue **eliminado**: el estado de pago ahora se deriva de los pagos, ver nota 44). Cuentas de ambos se crean en `/admin/users` (`/api/users`, solo ADMIN).

22. **Estados de estudiante:** `studentStatus` derivado server-side (`services/studentStatus.js`, ver nota 44): INACTIVO / SUSPENDIDO / PRUEBA / MATRICULADO / INSCRITO / PREINSCRITO. Suspensión (`POST /students/:id/suspend`, ADMIN/Coordinador): fechas+razón obligatorias, mín. 15 días, no excede el semestre; el suspendido desaparece de rosters vía `notSuspended()` (`lib/filters.js`) y reaparece al vencer. `POST /:id/unsuspend` levanta antes.

23. **Pago suspendido por reporte tardío:** una clase no reportada el mismo día (America/Bogota, `lib/dates.js`) genera CostRecord `SUSPENDED_LATE`. `firstReportedAt` se estampa SOLO en el primer finalize (editar no re-suspende). Desbloqueo: `POST /sessions/:id/unlock-payment` (solo ADMIN, botón en PayrollPage). Alerta in-app: `GET /alerts/pending-reports` + banner rojo en Dashboard. Histórico protegido (`firstReportedAt` null → nunca tardía).

24. **Triple coincidencia asistentes (con auto-validación):** el pago del asistente queda PAYABLE solo cuando coincide la información del asistente, el profesor y el coordinador. **Todo lo que coincide se valida automáticamente**: en clase REGULAR consolidada (`consolidationStatus=MATCHED`, doble reporte) profesor y coordinador ya coincidieron en el asistente, así que basta `assistantConfirmedId == assistantId` (regla en costEngine, unit-testeada). En reposiciones, si quien reporta es ADMIN/PF/SUPERADMIN se estampa `coordinatorValidated*` automáticamente (su reporte ES la info del coordinador); si reporta el TEACHER y cambia el asistente, la validación previa se limpia. `POST /sessions/:id/validate-assistant` queda como vía manual (reposiciones reportadas por profesor, sesiones legadas, override); la cola `/admin/validation` ("Validación Asistentes") marca "Validada automáticamente" (`autoValidated` en `/sessions/validation-queue`). Corte `assistant_match_start_date` (SystemConfig, seed): sesiones anteriores siguen PAYABLE.

25. **Festivales:** `ClassSession kind=FESTIVAL` (`/api/festivals`, UI `/admin/festivals` + `/festivals/:id/attendance`). Multi-profesor vía `FestivalProfessor`; pago igualitario = `festivalRate` para cada participante (costEngine branch, siempre PAYABLE). Participantes en `MakeupParticipant`. **P y A cuentan como clase vista; J no** — regla centralizada en `services/attendanceStats.js` y aplicada en groups/reports/parent. TEACHER solo reporta festivales donde participa.

26. **Alertas de lluvia y preinscritos:** `GET /alerts/rain`: grupos con ≥`rain_alert_threshold` (SystemConfig, default 3) canceladas por LLUVIA. `GET /alerts/preinscritos`: grupos con estudiantes 📝 PREINSCRITOS (estado derivado); alerta con 2 o más en el grupo (pestaña "Preinscritos" en `/admin/alerts`). Las alertas individuales de asistencia (`/alerts/attendance`, `services/attendanceAlerts.js`, pestaña "Individuales") **se eliminaron (D8, T6)**: las reemplazan el ledger y el semáforo (`/parent/children` ahora trae `semaforo` y `ledger`).

27. **Políticas:** texto único en `client/src/utils/policies.js`. Primer ingreso del PARENT al portal → `PoliciesModal` bloqueante (checkbox + aceptar) → `POST /auth/accept-policies` fija `User.policiesAcceptedAt`. `/auth/login` y `/me` exponen el campo.

28. **Cancelación estructurada:** `/cancel` de sesiones/reposiciones/festivales exige `cancellationCategory` (LLUVIA/SIN_ESTUDIANTES/OTRA; texto libre solo OTRA). "No dicté la clase yo" (toggle en Step2): exige quién dictó + observación obligatoria (`dictatedByOwner/notDictatedNote`), visible en Reportes → Clase y en la cola de validación.

29. **Rol SUPERADMIN (Liquidación v2, Fase 1):** rol nuevo, **superset de ADMIN**. En el backend, `requireRole()` (`middleware/auth.js`) lo deja pasar por cualquier gate automáticamente; en el frontend, `RequireAuth` (App.jsx) y la nav de `AppShell` lo tratan igual. Solo un SUPERADMIN puede crear/gestionar cuentas ADMIN/SUPERADMIN en `/admin/users` (`manageableRoles()` en `routes/users.js` — un ADMIN no puede escalar). El **seed** asegura que exista: crea la cuenta raíz (`ADMIN_EMAIL`) como SUPERADMIN, y si ya existía como ADMIN la asciende. La separación "ADMIN solo-lectura de reportes / SUPERADMIN edita" se completa en la Fase 2 (junto con las vistas de solo-lectura); en la Fase 1 SUPERADMIN ya puede editar todo lo que editaba ADMIN.

30. **Profesor sin festivales (Liquidación v2, Fase 1):** el profesor **no reporta festivales** (ni ve la tarjeta "Festivales pendientes" ni la ruta `/festivals/:id/attendance` ni `GET /festivals`). El coordinador/admin los reporta. El profesor que **participa** en un festival igual cobra: su `CostRecord` sale en la quincena, independiente de quién reportó. El profesor **conserva** el reporte de **reposiciones asignadas** a él.

31. **Doble reporte + consolidación (Liquidación v2, Fase 2):** cada clase regular tiene **dos reportes independientes en staging** — `ClassReport` (`reporterType` PROFESSOR|COORDINATOR, `@@unique[sessionId, reporterType]`) + `ClassReportAttendance` (P/A/J por estudiante). `POST /sessions/:id/finalize` ya **no** escribe directo al `AttendanceRecord`: escribe el reporte del rol que llama (TEACHER→PROFESSOR, PHYSICAL_TRAINER→COORDINATOR, SUPERADMIN debe mandar `reporterType`) y luego corre `services/consolidation.js` → `consolidateSession()`:
    - **PENDING** (falta uno): sin `AttendanceRecord` ni costo; `ClassSession.status` queda PROGRAMADA.
    - **MATCHED** (coinciden P/A/J por estudiante + quién-dictó + asistente; la **justificación no se compara**): escribe el `AttendanceRecord` consolidado (fuente de verdad), pone `status=REALIZADA`, corre `costEngine` → **pago habilitado**.
    - **MISMATCH**: guarda `ClassSession.consolidationDiff` (Json con el detalle por estudiante), borra `AttendanceRecord`/`CostRecord`, y genera **alerta de conflicto** (`GET /alerts/report-conflicts`, banner en Dashboard + página `/admin/conflicts`). Ambos ajustan su reporte hasta coincidir. **Caso de tiempos** (traslado entre los dos reportes): si un estudiante divergente ya no está inscrito en el grupo, `/report-conflicts` anota `leftGroup {actionType, changedAt}` (leído de `StudentGroupHistory`, respuesta no persistida) y la página de Conflictos muestra "📤 ya no en el grupo (fecha)" + sugerencia; en el flujo de asistencia (Step3) esa fila sale con badge y botón **✕ quitar** (antes exclusivo de reposiciones) para que quien la tenga en su reporte pueda converger. No cambia ninguna regla: la comparación y el roster-presente siguen igual.
    `ClassSession.consolidationStatus` (PENDING/MATCHED/MISMATCH) + `consolidatedAt`. `firstReportedAt` se estampa en el **primer** reporte (cualquier rol) para la regla de pago tardío. La función pura `diffReports()` está unit-testeada; el flujo se validó contra Postgres real.

32. **ADMIN solo-lectura de reportes (Fase 2):** `canReportGroup()` ya **no** admite ADMIN ni PARENT — solo TEACHER (su grupo, reporte PROFESSOR), PHYSICAL_TRAINER (reporte COORDINATOR) y SUPERADMIN. ADMIN ve los reportes en Reportes → Clase (que ahora incluye ambos `reports` + `consolidationStatus`/`diff`) pero no edita; el home de ADMIN redirige a `/admin` (no al dashboard de asistencia). La ruta `/attendance/:groupId` ahora es `['TEACHER','PHYSICAL_TRAINER']` (SUPERADMIN por superset).

39. **Borrado permanente + wipe de clases (limpieza para datos reales):** `DELETE /students/:id/permanent` y `DELETE /groups/:id/permanent` (solo ADMIN/SUPERADMIN, body `{confirm:true}`) borran de verdad al estudiante/grupo con **todos** sus registros dependientes en una transacción (el grupo también borra sus sesiones y la actividad asociada; el historial de grupo se desvincula, no se borra). En la UI son botones rojos "Eliminar definitivamente" que exigen escribir el nombre/código. La lógica del wipe de clases se extrajo a `services/wipeClassData.js` (compartida por el script y el endpoint `POST /system/wipe-classes`, **solo SUPERADMIN**, body `{confirm:"BORRAR CLASES"}`); UI: "Zona de peligro" en `/admin/config` (solo Superadmin). Todo verificado contra Postgres real (sin huérfanos; catálogo intacto).

33. **Script de limpieza de clases (Fase 2):** `node src/scripts/wipe-class-data.js` (requiere `CONFIRM_WIPE=YES` o `--yes`) vacía `ClassSession`, `ClassReport(+Attendance)`, `AttendanceRecord`, `CostRecord`, `SessionEditLog`, `FestivalProfessor`, `MakeupParticipant`, `PayrollApproval`, **conservando** usuarios, estudiantes, grupos, profesores, asistentes, semestres y config. Para el arranque limpio de semestre. **Hacer backup antes** (ver Backups de BD).

34. **Ciclo de pago y cierre de quincena (Liquidación v2, Fase 3):**
    - **"Pago realizado"**: `CostRecord.paidAt/paidById`. `PATCH /payroll/records/:id/paid` (ADMIN) marca/desmarca un costo pagado (bloqueado si la quincena está cerrada). "pago realizado" = `paidAt` fijado.
    - **Coherencia Liquidación ↔ Validación:** `GET /payroll` y `/payroll/summary` corren `refreshAssistantPayStatus(period)` (ADMIN), que re-sincroniza el `payStatus` de los pagos de asistente con la regla vigente de triple coincidencia (misma que la cola de Validación, `assistantMissing`), corrigiendo `CostRecord` que quedaron `PENDING_MATCH` de antes de la auto-validación **sin borrarlos** (conserva approvedAt/paidAt; si vuelve a PENDING limpia la aprobación). No toca SUSPENDED_LATE ni quincenas cerradas. Así ambas vistas cuentan lo mismo. La página `/admin/validation` se titula "Validación Asistentes".
    - **Vista de calendario (Liquidación):** toggle Lista/Calendario en `/admin/payroll`. `GET /payroll/calendar?from&to` (ADMIN) devuelve las clases del rango con código, profesor, presentes, costo del profesor, estado, cancelación, `dictatedByOwner` y reposiciones. `PayrollCalendar.jsx` las agrupa en malla **semana × horario × día** con tarjetas de color (verde realizada, rojo lluvia, gris otra cancelación) y filtros client-side por profesor/nivel/grupo; al tocar una abre el detalle de la clase (`GET /reports/class/:sessionId`, `ClassDetailModal` exportado — la vista Lista también lo abre al tocar una clase del detalle). Los selectores de quincena muestran las fechas de inicio y fin (`periodLabel` en `utils/periods.js`) y preseleccionan la quincena en curso. El enum `PayrollLogAction` incluye APPROVE/UNAPPROVE/HOLD/UNHOLD/BULK_* (migración `20260717010000` defensiva) — antes el log fallaba tras aprobar con un falso "Datos inválidos".
    - **Aprobación por clase (Liquidación v3):** flujo secuencial **Pendiente → Aprobado → Pagado** para profesores Y asistentes. `CostRecord.approvedAt/approvedById` (Validar) y `heldAt/heldById` (Retener, excluye el pago). Solo se aprueba un PAYABLE (verde = coincidencia total; rojo = conflicto PENDING_MATCH/SUSPENDED_LATE, no aprobable). No se puede pagar sin aprobar. Endpoints: `PATCH /payroll/records/:id/approved`, `.../held`, `POST /payroll/records/bulk {ids, action: approve|unapprove|hold}` (para "Validar todo" por beneficiario y selección masiva). `/summary` devuelve `progress {total, validated, approved, paid, held, conflict, pending}` (barra) y `pendingApprovalCount` por beneficiario. `POST /payroll/close` exige que no queden PAYABLE sin decidir (aprobar/retener). Migración `20260716010000_cost_record_approval` (defensiva).
    - **Arrastre de suspendidos**: al **cerrar**, los `CostRecord` `SUSPENDED_LATE` mueven su `period` a la siguiente quincena (`getNextPeriod()` en costEngine) con `carriedFromPeriod` para trazabilidad → reaparecen en la nómina siguiente.
    - **Cierre de quincena**: `POST /payroll/close` (ADMIN). Exige que no queden pagos `PENDING_MATCH`. **El cierre es el último paso del ciclo y certifica el desembolso** (decisión del cliente: primero se paga, después se cierra), así que estampa `paidAt/paidById` en todo lo `PAYABLE` aprobado que aún no lo tenga (log `BULK_PAY` con `reason: 'cierre de quincena'`); los **retenidos** (`heldAt`) quedan fuera a propósito y ya no se cuentan como pagados en la foto (`totalHeld` en el Json `snapshot`). Sin esto los registros quedaban aprobados-pero-no-pagados **para siempre** —la quincena cerrada ya no admite marcarlos (`loadEditableRecord` → 409)— y `GET /payroll/my-semester` los seguía mostrando al profesor/asistente como "Pendiente (semestre) · habilitado, sin pagar" mientras el admin los daba por listos. Congela una foto por profe/asistente en `PayrollClosureLine` (clases, pagado, arrastrado), arrastra los suspendidos, y crea `PayrollClosure(locked=true)` + `PayrollLog(CLOSE/CARRY_OVER)`. Mientras `locked`, **no se puede editar** reportes/costos de ese período (guard `isSessionPeriodLocked` en `lib/payrollLock.js`, aplicado en `/sessions/:id/finalize|cancel|unlock-payment` → 409). `POST /payroll/reopen` (ADMIN) desbloquea (log `REOPEN`; no revierte arrastres). `GET /payroll/closure?period=` da el estado. Todo en `PayrollPage` (botón por clase "Marcar pago realizado", "Cerrar/Reabrir quincena", badges de pagado/arrastrada). La vieja "Aprobar liquidación" (`PayrollApproval`) quedó reemplazada por el cierre en la UI.
    - **Migraciones defensivas**: por el `db push` heredado en prod, las migraciones usan `ADD COLUMN/CREATE ... IF NOT EXISTS` y `ensure-baseline.js` auto-revierte migraciones fallidas para que `migrate deploy` las reintente. Escribir migraciones futuras igual de defensivas.

35. **Autoservicio profesor/asistente:** en **Reporte** (`/reporte`, `ReportePage`) al tocar una clase se abre un modal con el detalle P/A/J por estudiante de esa sesión (`GET /reports/class/:sessionId`); el listado ya venía filtrado a los grupos del profesor. **Mi Quincena** (`MyPayrollPage`, TEACHER/ASSISTANT) muestra las clases separadas en pendientes por pago / ya pagadas / retenidas, navega quincenas y añade una fila de KPIs del **acumulado del semestre** (`GET /payroll/my-semester`: suma los `CostRecord` propios cuya sesión cae dentro del semestre activo, separando pagado/pendiente/retenido).

36. **Registro de pagos del estudiante:** modelo `StudentPayment` (`studentId`, `paymentDate`, `method` enum `PaymentMethod` TRANSFERENCIA/EFECTIVO/WOMPI/BOLD, `amount`, `receivedById/receivedByName` = usuario logueado que registra, `note?`). Un estudiante tiene 0..N pagos. **Historial independiente** del estado Inscrito/Matriculado (no lo modifica). Endpoints en `students.js`: `GET/POST /students/:id/payments` (ADMIN/SUPERADMIN/RECEPTION), `DELETE /students/:id/payments/:paymentId` (solo ADMIN/SUPERADMIN). UI: sección "Registro de pagos" en la ficha del estudiante (`StudentsPage`), visible solo a Recepción/Admin/Superadmin. Migración `20260712050000_student_payments` (defensiva).

43. **Visión Estratégica (`/admin/strategy`, solo ADMIN/SUPERADMIN):** tablero gerencial de una pantalla sobre `GET /reports/strategy`, agregado server-side para el **semestre activo** (o últimos 90 días sin semestre). KPIs: estudiantes activos/nuevos, **ocupación global y por grupo** (base: ✅ matriculados + 🔵 inscritos frente al cupo; los 📝 preinscritos se reportan aparte y NO ocupan cupo — mismo criterio de "activos" que Grupos/Horarios: los conteos `_count.enrollments` de `/groups` y `/groups/export` filtran `student.active`), asistencia promedio (P vs A, J no penaliza), conversión de matrícula (matriculados vs inscritos; excluye `isTrial`), cumplimiento de clases (realizadas vs canceladas, lluvia aparte), riesgo de deserción (alertas roja/amarilla de `attendanceAlerts`), clases de prueba pendientes, y finanzas (ingresos = **todos** los `StudentPayment` del sistema sin filtro de fecha — decisión del cliente: los pagos pertenecen al semestre en curso aunque se reciban antes de su inicio — menos gasto causado = `CostRecord` PAYABLE por fecha de clase del período **+ gastos operativos** de las quincenas del período (`payrollAccrued`/`operatingAccrued` en la respuesta, para que la cifra no contradiga a Contabilidad); retenidos aparte — criterio de causación de Contabilidad). Tabla **"Contadores por grupo"**: código+nivel, profesor, inscritos/cupo, barras de ocupación y asistencia, realizadas y canceladas; orden alfanumérico.

42. **Clase de prueba:** `Student.isTrial` (migración `20260715010000` defensiva). En el paso 3 del flujo de asistencia, el menú "Agregar estudiante de reposición" ofrece **"🧪 Clase de prueba (estudiante nuevo)"** → campo de texto con el nombre → `POST /students/trial` (TEACHER/PF/ADMIN/SUPERADMIN; crea `{name, isTrial:true, classesStartDate:hoy}`, sin grupos) y se agrega a la lista como REPOSICION con badge "🧪 prueba". **Anti-duplicados**: si ya existe una prueba ACTIVA con el mismo nombre normalizado (minúsculas/sin tildes/espacios colapsados) el endpoint la **reutiliza** (`reusedExisting: true`, 200) en vez de crear otra; además, mientras se escribe el nombre (≥3 letras) el formulario sugiere estudiantes existentes (de prueba o regulares) para tocarlos y usarlos en lugar de duplicar. Duplicados históricos se depuran a mano ("Eliminar definitivamente" en la ficha). Al ser un Student real, la doble consolidación y el motor de costos lo tratan como un presente más. En `StudentsPage` se ve con badge "🧪 Prueba" (lista y ficha) y el modal de edición permite desmarcar `isTrial` para convertirlo en estudiante regular. Export incluye columna "Clase de prueba".

41. **Fecha de inicio de clases + orden alfanumérico de grupos:** `Student.classesStartDate` (@db.Date, migración `20260714020000` defensiva) se pregunta en el formulario de creación (default: hoy en Bogotá; también editable) y actúa como **piso adicional** de las clases esperadas en las alertas de asistencia (`attendanceAlerts.js`: max(enrolledAt, group.createdAt, classesStartDate)). Los listados de grupos que alimentan desplegables se ordenan **alfanuméricamente por código** ("G2" < "G10") con `lib/sort.js` (`compareCodes`, locale es + numeric): `GET /groups`, `/groups/export`, `/groups/schedule`, `/enrollment/groups` y las opciones de ReportePage. El Dashboard reagrupa por horario en el cliente, así que no le afecta.

40. **Módulo de Contabilidad (`/admin/accounting`, solo ADMIN/SUPERADMIN):** cinco pestañas (la de **Pagos Estudiantes** en la nota 44; la de **Fijos y variables** en la nota 50). **Ingresos** = `StudentPayment` del rango, con KPI de total/verificado/sin verificar, desglose por medio de pago (conciliación bancaria y arqueo de efectivo) y checkbox **"Verificado"** por pago (`StudentPayment.verifiedAt/verifiedById/verifiedByName`, `PATCH /accounting/payments/:id/verified`, con auditoría de quién/cuándo). **Gastos** = `CostRecord` agrupado por quincena: causado (PAYABLE), pagado (`paidAt`), pendiente de pago, retenido (SUSPENDED_LATE/PENDING_MATCH) y estado del cierre. **Balance** = ingresos vs gastos por mes calendario con resultado neto acumulado y margen, con el gasto desglosado en **nómina de clases + gastos operativos** (`payrollAccrued`/`operatingAccrued`; `expensesAccrued` sigue siendo la suma). **Criterio contable:** gastos por *causación* (todo PAYABLE es compromiso, pagado o no); los retenidos NO entran al balance; el flujo de caja (pagado) se muestra aparte. Lógica pura en `services/accounting.js` (unit-testeada); ruta `routes/accounting.js` con `requireRole('ADMIN')` a nivel de router. Export Excel de 5 hojas (`GET /accounting/export`). Rango por defecto: el semestre activo (presets Este mes / Mes anterior / Semestre + fechas libres). Migración `20260714010000_payment_verification` (defensiva).

38. **Validación de datos + aceptación de políticas (flujo público):** reemplaza el módulo "Inscripciones". Página pública `/validar` (`ValidationPage`, sin shell): el acudiente entra con el **documento del estudiante** (`POST /validation/lookup`, sin auth, rate-limit), ve al estudiante **y sus hermanos** (mismo acudiente o teléfono), corrige **solo contacto** (email/WhatsApp/acudiente/fecha nac.; nombre y documento bloqueados) y acepta las políticas (`POST /validation/submit`). El submit re-deriva la familia en el servidor y solo actualiza esos ids; estampa `Student.validatedAt` + `policiesAcceptedAt`. Control para la Escuela: `/admin/enrollment` ahora es `ValidationAdminPage` (ADMIN/Coordinador/Recepción) con el enlace para compartir, KPIs y lista validados/pendientes (`GET /validation/status`). Migración `20260712060000_student_validation` (defensiva). Nota: sin segundo factor (solo el documento) por decisión del usuario. `routes/validation.js` va montado **sin** `authMiddleware` global (público); `/status` aplica auth inline.

37. **Rol Recepción (ampliado):** Recepción **crea y edita** estudiantes (`POST /students`, `PUT /students/:id` — pero **nunca** activa/desactiva: el PUT ignora `active` para RECEPTION; suspender/desactivar/cambiar grupo siguen siendo ADMIN/Coordinador) y gestiona el **registro de pagos**. Además **ve** Horarios y Grupos (`/admin/groups` en modo lectura: `canEdit` la excluye, así que no ve botones de mutación). No accede a nada más. En `StudentsPage`: `canManage` (ADMIN/SUPERADMIN/Coordinador) para acciones avanzadas vs `canEdit` (= `canManage` + Recepción) para crear/editar.

44. **Estados de estudiante v2 + Pagos Estudiantes (rediseño):** el estado ya **no** sale del checkbox manual `paymentComplete` (columna legacy, sin uso) sino que se **deriva** en `services/studentStatus.js` de los datos reales: **PRUEBA** (isTrial), **PREINSCRITO** (registrado, sin pagos), **INSCRITO** (pago parcial: 0 < pagado < valor del plan — regla D7 de "Reglas de negocio del paquete"; la asistencia ya no cambia el estado), **MATRICULADO** (pago completo: `StudentPayment` acumulado ≥ valor esperado), más SUSPENDIDO/INACTIVO que ganan prioridad. **Valor esperado** = `classesAcquired × (tarifa_plan / tuition_plan_classes)` según categoría por edad: **ADULTO** (≥ `tuition_adult_age`, **16** — decisión del cliente; migración `20260716020000` corrige el 18 sembrado antes) → `tuition_adult_total` (2.789.000 por 40 clases); **PEQUEÑO** → `tuition_child_total` (2.425.000 por 40 clases). Tarifas en SystemConfig (seed + `/admin/config`, sección "Matrícula de estudiantes"). `attachStudentStatus(students)` decora listas con `studentStatus`, `missingBirthDate` y `tuition {category, expectedTotal, totalPaid, balance}` en 2 queries agregadas; `stripTuition(list, role)` quita los montos para roles sin acceso económico (solo ADMIN/SUPERADMIN/RECEPTION los ven; PARENT solo los de su hijo). Aplica en `/students`, `/groups/:id/students`, `/groups/schedule`, `/search`, `/parent/children`, `/makeups/:id`, `/festivals/:id` y la Visión Estratégica. **Íconos únicos en todo el sistema** (`client/src/utils/studentStatus.jsx`): ✅ Matriculado · 🔵 Inscrito · 📝 Preinscrito · 🧪 Prueba · ⏸️ Suspendido · ⛔ Inactivo — siempre junto al nombre (lista/ficha de estudiantes, roster de asistencia, reposiciones, festivales, malla de horarios, buscador ⌘K, portal padres). **Error de fecha de nacimiento**: un estudiante regular activo sin `birthDate` no tiene tarifa → `missingBirthDate` con ⚠️ en todas las vistas, contador+filtro "Sin fecha de nacimiento" en StudentsPage, y `POST /students` la exige (400); `/students/trial` no. **Pagos Estudiantes**: 4.ª pestaña de `/admin/accounting` y 4.ª hoja del export — por estudiante activo: estado, categoría, clases adquiridas, valor esperado, pagado y **saldo pendiente** (deuda contra el plan completo, no depende del rango). El export de estudiantes incluye las mismas columnas solo para roles con dinero (Coordinador exporta sin montos). Sin migración de schema (todo derivado). Unit tests en `tests/unit/studentStatus.test.js`. **Backfill de fechas de nacimiento**: si el Excel subido a Importar **no** trae la hoja "Consolidado Matrícula" pero alguna hoja tiene columnas NOMBRE COMPLETO + FECHA DE NACIMIENTO (p. ej. la hoja PRE-INSCRITOS del archivo de inscripciones), `importFromBuffer` entra en modo `birthdates` (`parseBirthDates`/`importBirthDates` en `enrollmentImport.js`): empareja por documento (o nombre normalizado) y rellena **solo** las fechas faltantes, nunca pisa una existente; dryRun previsualiza y lista los no encontrados (unit tests en `tests/unit/birthdateImport.test.js`).

46. **Clases del semestre anterior + faltas desde el inicio de clases:**
    - **`Student.previousClasses`** ("clases pendientes del semestre pasado", columna `previous_classes`, migración `20260712025850`): las fija **solo ADMIN/SUPERADMIN** vía `POST /students/:id/previous-classes` (`{amount}` incrementa; acepta negativos para corregir) — el Coordinador ya no puede. **Suman al total de adquiridas** en: la ficha (`/students/:id/report` → `summary.classesAcquired`), el roster del flujo de asistencia (`GET /groups/:id/students` devuelve `classesAcquired` ya sumado, así Step3 muestra `vistas/(actuales+previas)`), el KPI "Asistencias adquiridas" del panel de gestión (`/reports/home`) y el export de estudiantes (columnas "Clases semestre anterior" y "Total clases"). NO entran al valor de matrícula (`tuition.expectedTotal` sigue usando solo `classesAcquired`: las previas ya se pagaron el semestre pasado).
    - **Las inasistencias solo cuentan desde `classesStartDate`**: regla central `absenceCounts(sessionDate, classesStartDate)` en `services/attendanceStats.js` — una AUSENTE anterior a la fecha de inicio de clases del estudiante no es falta real: no suma faltas, sale del denominador del % de asistencia y **no consume paquete** (la AUSENTE de festival solo cuenta como "clase vista" desde el inicio; `isSeenRecord` acepta ahora `sessionDate/classesStartDate` opcionales). Aplicada en: `/students/attendance-summary` (lista), `/students/:id/report` (ficha), `/reports/student|group|professor`, `/reports/home` (asistencias efectivas + distribución), `/reports/strategy`, `/parent/attendance/:studentId`, `GET /groups/:id/students` (`classesSeen`), `attachStudentStatus` (un festival previo al inicio ya no convierte a un PREINSCRITO en INSCRITO) y las alertas de asistencia (el conteo de "vistas"; las clases esperadas ya tenían el piso en `classesStartDate`, nota 41). PRESENTE siempre cuenta aunque sea anterior al inicio (asistió de verdad). Sin `classesStartDate` todo cuenta como antes. Unit tests en `attendanceStats`, `studentStatus` y `attendanceAlerts`.

52. **Semestre completado, panel del coordinador y desvío por festivos:** todo derivado, sin migración (`services/semesterProgress.js`, unit-testeado).
    - **Semestre completado** (desde la nota 55: estado **🎓 GRADUADO**, y cuenta lo **consumido** = vistas + faltas, no solo lo visto) = clases vistas (regla canónica de `attendanceStats`, con unidades) ≥ `classesAcquired + previousClasses` (paquete > 0, no prueba). `GET /groups/:id/students` **oculta** a esos estudiantes del roster (flag `semesterCompleted`; `?includeCompleted=true` los devuelve). Step3 manda `?date=` de la clase que se reporta: solo cuentan las sesiones **anteriores**, así quien terminó justo en esa clase sigue visible al editar su reporte. Badge "🎓 Semestre completado" en `StudentsPage` (lista y ficha) y 🎓 en el Seguimiento de Estudiantes, vía `GET /alerts/semester-completed` (ADMIN/Coordinador/Recepción).
    - **Criterio de reposición:** definido en "Reglas de negocio del paquete" (`reposicion` = lluvia + OTRA + justificadas; los festivos son `calendario`, no reposición). Esta nota ya no lo repite.
    - **Panel del coordinador** (`components/CoordinatorStudentsPanel`; desde la nota 54 vive **solo** en el Panel de gestión `/admin`, ya no en el inicio "Grupos del día") sobre `GET /alerts/coordinator`: `makeups` = clases de **reposición** por agendar **≥ 3** (lluvia + justificadas − repuestas; los festivos no cuentan aquí; los que ya completaron no entran) y `nearEnd` = les faltan **1 a 3** clases para completar el paquete, con fecha estimada de su última clase (`projectEndDate`: n-ésima clase programada de sus grupos saltando festivos, **sigue más allá del fin del semestre** y marca `endsBeyondSemester`). Umbrales en `MAKEUP_ALERT_THRESHOLD` / `SEMESTER_END_THRESHOLD`. (Las alertas individuales de `/admin/alerts` están obsoletas y se eliminan: D8, nota 26.)
    - **Plan de 40 clases por grupo (20 si es de un solo día):** el plan de cada grupo es de `tuition_plan_classes` clases (SystemConfig, 40), contadas desde el inicio del semestre — no "las que alcancen en el calendario". Los grupos con **un solo día a la semana** tienen la mitad (20; `planForGroup` en `semesterProgress.js`), así que `plan` por grupo puede diferir del `plan` base de la respuesta. `plannedEnd` = clase 40 sin festivos ni pérdidas; `estimatedEnd` = faltan `plan − dadas` clases desde hoy (mañana si la de hoy ya está dada), saltando fechas excluidas — esto recupera automáticamente lluvia y cualquier clase no dictada; `delayDays` = estimada − plan. Función `holidayDeviationForGroup` (opciones `plan/given/rain/givenToday/todayStr`).
    - **Calendario por grupo** (`/admin/alerts` → pestaña "Calendario", `GET /alerts/holidays`, ADMIN/Coordinador): cada grupo contra su plan de 40: festivos / fechas excluidas que caen en sus días dentro del plan (con fecha y motivo), lluvia, `extraVsBest` (cuánto más pierde que el grupo menos afectado) y fecha final estimada.
    - **Avance de grupos** (Reportes → pestaña "Avance de grupos", `GroupsProgress.jsx`, `GET /reports/groups-progress`, ADMIN/SUPERADMIN/Coordinador; `computeGroupsProgress`): una tarjeta por grupo con **inicio del plan** (primera clase del calendario del semestre), **fecha estimada final** (nota anterior), **clases dadas** (`ClassSession` REALIZADA a hoy) de las 40 del plan, **no dadas por festivos y recesos** (a hoy, indicando las que faltan por venir) y **no dadas por lluvia**, más barra de avance (dadas / plan). Al tocar la tarjeta se despliegan los estudiantes del grupo (activos, no de prueba, no suspendidos) con vistas/paquete, % de avance coloreado contra el ritmo del grupo (verde ≥ −10 pts, amarillo ≥ −25, rojo menos), por reponer (lluvia + justificadas) y fecha estimada de fin. `computeStudentProgress` ahora proyecta la fecha de fin de **todo** estudiante con clases por ver (antes solo los "por terminar") y devuelve `pct`. Al final del reporte, **tabla resumen ordenable** ("¿dónde poner el esfuerzo?"): % avance, dadas, faltan, festivos, lluvia, estudiantes con reposición, clases por reponer (suma de sus estudiantes; un estudiante en 2 grupos cuenta en ambos), retraso en días y fin estimado, con fila de totales; orden inicial por clases por reponer.

47. **Diccionario de datos + export completo de la BD:** el diccionario vive en `server/src/services/dataDictionary.js` (en inglés: cada tabla, columna, tipo SQL, nulabilidad, clave y significado de negocio, más los 14 enums). De ahí salen dos cosas: (a) `docs/database-dictionary.md`, generado con `cd server && npm run docs:dictionary` (**archivo generado — no editar a mano**; incluye convenciones, índice por área, diagrama ER en mermaid derivado de las FK declaradas y la sección de export), y (b) el **export completo de la base de datos**: `GET /api/system/export/database?format=xlsx|json` (ADMIN/SUPERADMIN), botón "⬇️ Exportar base de datos" en la sección **Base de datos** de `/admin/config`. El Excel trae hoja *Overview* (filas por tabla), *Data Dictionary*, *Enums* y **una hoja por tabla** con las columnas en el orden del diccionario; el JSON es el mismo volcado como respaldo lógico. Las columnas marcadas `sensitive` (hoy `users.password_hash`) salen siempre como `[REDACTED]`. Lógica de lectura/serialización en `services/databaseExport.js` (Decimal→número, `date`→`YYYY-MM-DD`, timestamp→ISO, Json→texto en Excel). `tests/unit/dataDictionary.test.js` parsea `schema.prisma` y **falla si un modelo/columna/enum cambia sin documentarse** (guardia anti-deriva); `tests/integration/databaseExport.test.js` cubre el gate de rol, los formatos y la redacción.

48. **Seguimiento de Estudiantes (Reportes → Estudiantes):** la pestaña *Estudiantes* de `/admin/reports` dejó de ser un selector de un estudiante y es ahora una **tabla de todos los estudiantes activos** con el consumo de su paquete de clases en el semestre activo (o el rango `from/to`): Documento · Nombre (con su ícono de estado) · Grupo · **Adq.** (adquiridas + pendientes del semestre anterior, nota 46) · **Asist.** · **Aus.** (solo desde `classesStartDate`, nota 46) · **Just.** · **N/A** (nota 45) · **Rep.** (sesión `kind=MAKEUP` o registro `REPOSICION`) · **Lluvia** (clases de sus grupos canceladas por LLUVIA, informativa) · **Total** · **% Avance** con barra semáforo. Columnas ordenables, filtros de búsqueda/grupo/nivel/estado, fila de totales y cards en móvil. **Dos lecturas de "consumida"**: el interruptor "las faltas consumen clase" (encendido por defecto) suma las ausencias al Total — el estudiante pagó la clase y no vino; apagado cuenta solo lo efectivamente visto (asistencias + reposiciones, la regla canónica de `attendanceStats`). El interruptor se resuelve en el cliente, sin volver al servidor. Al tocar una fila se abre el detalle clase por clase (`/reports/student/:id`), que reemplazó al viejo `StudentReport`. **Fichas PDF**: el botón 📄 por fila (y "🖨️ Fichas PDF (N)" para todo lo filtrado) arma un documento con una ficha por estudiante (totales + **tabla del detalle clase a clase**: fecha, clase, P/A/J/N-A y observación — reposición que cuenta por 2, falta anterior al inicio de clases, etc.) en un iframe oculto (`srcdoc`). `printFichas` trae el detalle de cada estudiante con `/reports/student/:id` **en el mismo rango efectivo de la tabla** (`data.from/to`, el semestre activo por defecto; el modal de detalle usa el mismo rango), de a 4 en paralelo y lo manda a imprimir — el navegador hace el PDF con *Guardar como PDF*, así que **no se agregó ninguna librería de PDF**. Backend: `GET /reports/students-tracking(/export)` en `routes/reports.js` (3 queries agregadas + `attachStudentStatus`, sin montos de matrícula en la respuesta) con la lógica de conteo pura en `services/studentTracking.js`; tests en `tests/unit/studentTracking.test.js` y `tests/integration/studentsTracking.test.js`.

49. **Reposiciones sencillas y dobles — las unidades cuentan asistencias, no solo pago:** al programar una reposición el coordinador declara "por cuántas asistencias cuenta" (`ClassSession.effectiveUnits`: **sencilla = 1, doble = 2**, con presets en `/admin/makeups`). Ese valor ya movía el pago del profesor (`getBracketRate(presentes) × effectiveUnits`) pero **no** se aplicaba al consumo del paquete del estudiante: una reposición doble sumaba 1 sola clase vista. Ahora la regla es central en `services/attendanceStats.js` — `attendanceUnits(session)` (unidades de la sesión, 1 si no hay dato válido: clases regulares, festivales y sesiones legadas), `seenUnits(record, session, classesStartDate)` (0 si no es clase vista, si no las unidades) y `roundUnits()` (las unidades admiten 0.5, así que los acumulados se redondean a un decimal) — y se aplica en **todo lo que consume paquete**: roster del flujo de asistencia (`GET /groups/:id/students` → `classesSeen`), ficha del estudiante (`/students/:id/report`), `/reports/student/:id`, portal de padres, columna **Rep.** y **Total** del Seguimiento de Estudiantes (`services/studentTracking.js`), KPI "asistencias efectivas" de `/reports/home` (suma las unidades *extra* de las sesiones con `effectiveUnits > 1` sobre el `count` base) y las **alertas de asistencia** (`deviation = expected − seen − na`, donde una reposición doble descuenta 2). Los **porcentajes de asistencia** (P vs A) y los conteos de faltas NO se ponderan: son tasas de comportamiento, no consumo — un ausente a una reposición doble sigue siendo **1 falta**. Tests: `attendanceStats` (`attendanceUnits`/`seenUnits`/`roundUnits`), `studentTracking`, `attendanceAlerts` e integración `makeupUnits.test.js`.

50. **Gastos fijos y variables (Contabilidad — 3.ª pestaña, "🧾 Fijos y variables"):** los gastos de la academia que no salen de la liquidación de clases se registran a mano en `/admin/accounting` (solo ADMIN/SUPERADMIN, mismo gate de router). Modelo `OperatingExpense` con dos naturalezas:
    - **FIJO** — el monto es **por quincena** y se causa en **cada** quincena que toque la vigencia `[startDate, endDate]`; `endDate` vacío = vigente indefinidamente. Si la vigencia arranca o termina a mitad de quincena, esa quincena cuenta **completa** (no se prorratea por días — decisión explícita: un arriendo quincenal no se parte).
    - **VARIABLE** — gasto de una sola vez, cargado a la quincena de su `expenseDate` (el `period` se deriva en el servidor).
    Nueve categorías (`OperatingExpenseCategory`: arriendo, servicios, nómina administrativa, mantenimiento, implementos, transporte, marketing, impuestos/seguros, otro) para el desglose. El **pago se marca por quincena** (`OperatingExpensePayment`, `@@unique[expenseId, period]`), así que un fijo puede estar pagado en una quincena y pendiente en la siguiente; `PATCH /accounting/expenses/:id/paid` rechaza (400) una quincena en la que el gasto no se causa. "Eliminar" **archiva** (`active=false`): deja de causarse pero el histórico se conserva; `?permanent=true` borra de verdad (la marca de pago cae por cascada).
    La expansión es **lógica pura** en `services/accounting.js` — `periodBounds(period)`, `expenseCoversPeriod(expense, period)` (solapamiento de rangos para FIJO, igualdad de quincena para VARIABLE) y `expandOperatingExpenses(expenses, periods)` → ocurrencias + agregados por quincena/mes/categoría — así que las definiciones se guardan una vez y el rango de la vista decide cuántos cobros se ven. Entra a **todos** los agregados de gasto: `/accounting/summary` (clave `operating`), la pestaña **Gastos** (KPI "Gasto causado total" = nómina + operativos, con su tabla por quincena), el **Balance** (columnas Nómina de clases / Fijos y variables), la hoja **Gastos Operativos** del export y la **Visión Estratégica** (nota 43). El cierre de quincena (`payroll/close`) **no** los bloquea: no son parte de la liquidación a profesores. Migración `20260910010000_operating_expenses` (defensiva). Tests: `tests/unit/accounting.test.js` (`periodBounds`, `expenseCoversPeriod`, `expandOperatingExpenses`, `buildBalance` con el 4.º argumento) y `tests/integration/accounting.routes.test.js` (CRUD, validaciones, gate de rol, marca de pago) + `strategy.test.js`.

53. **Agendamiento público de reposiciones (`/reponer/:token`):** el acudiente agenda las reposiciones de su hijo **sin login y sin formulario**, con un **enlace personal** (`Student.bookingToken`, código aleatorio de 24 caracteres; migración `20261023010000_makeup_booking`, defensiva). Pensado como puente hasta la plataforma completa con cuentas.
    - **Turnos** (`services/makeupBooking.js`, lógica pura unit-testeada): viernes 5:15–6:00 y 6:00–6:45 p. m.; sábado 1:30–2:15 y 2:15–3:00 p. m. (una cancha, 45 min). Cupo **6**, **todos los niveles comparten turno**, cada turno vale **una clase regular** (`effectiveUnits = 1`). Se ven 14 días hacia adelante, saltando las fechas excluidas del semestre. Se reserva hasta **2 h antes** y se cancela hasta **24 h antes**. Para cambiar horarios/cupo se editan las constantes `SLOT_TEMPLATES`/`SLOT_CAPACITY`.
    - **Cuánto puede reservar** = clases **de reposición** (lluvia + justificadas; los festivos no dan derecho a reservar desde la nota 54) (`computeMakeupDebt`, nota 52; acepta `{ studentIds }` para calcular uno solo) − reposiciones `PROGRAMADA` en las que ya está (las agendadas aún no bajan la deuda porque no se han visto).
    - **Cada turno reservado es una reposición normal**: la primera reserva crea un `ClassSession kind=MAKEUP` con `bookingSlot` (`@@unique[date, bookingSlot]`) **sin profesor**; cada reserva es un `MakeupParticipant` con `bookedAt`. La reserva corre en transacción `Serializable` con reintentos, así que reservas simultáneas no pasan del cupo (validado contra Postgres con 7 reservas a la vez por el último cupo). Si se cancela la última reserva, la reposición vacía se borra. El acudiente solo cancela lo que **él** reservó (`bookedAt`); lo que programó la Escuela no.
    - **Coordinación** (`/admin/makeup-booking`, ADMIN/Coordinador, menú "📅 Agendar reposiciones"): pestaña **Agenda** (turnos con quién reservó, alerta de turnos sin profesor y selector de profesor → `PUT /makeups/:id`; desde ahí sigue el flujo de reposiciones de siempre: panel del profesor, asistencia, costos), **Enviar enlaces** (estudiantes con deuda; crea el enlace y lo envía por **WhatsApp** — enlace `wa.me` con el mensaje listo, **sin conexión de API** —, **correo** — `mailto:` — o copia el mensaje; "Cambiar enlace" invalida el anterior) y **Sugerencias** (lo que pidieron los acudientes cuando nada les servía, con botón "Atendida").
    - Tests: `tests/unit/makeupBooking.test.js` e `tests/integration/makeupBooking.test.js`.

54. **Reposición vs. recuperar por calendario + Cumplimiento en el Panel de gestión:** lo que le falta a un estudiante se separa en dos conceptos (`splitDebt` en `services/semesterProgress.js`, unit-testeado; todo derivado, **sin migración ni cambios de datos**: ningún registro se borra o reescribe, solo cambia cómo se lee):
    - **Clases de reposición** (`pending`) = canceladas por **LLUVIA** + **JUSTIFICADAS** − reposiciones vistas (sesión MAKEUP o registro REPOSICION, con unidades). La Escuela las **programa**: alimentan la alerta "3+ clases de reposición", el agendamiento público (`/reponer/:token`, nota 53), la pestaña Enviar enlaces y "por reponer" de Avance de grupos.
    - **Clases por recuperar por calendario** (`calendar`) = **festivos y recesos** (fechas excluidas ya pasadas en días de su grupo). **No se reponen**: el calendario regular se corre y las devuelve (la proyección de fin ya salta las exclusiones). Se muestran en azul, aparte.
    - **Orden de descuento**: lo repuesto baja primero la reposición; si vio más de las que debía, el excedente también recupera festivos (una clase vista es una clase vista). Ambas cifras se topan en lo que le queda del paquete (reposición primero).
    - **Reglas de conteo** (aplican a ambas): los días de la semana en que el estudiante solo tiene **N/A** no le generan lluvia ni festivo (`notMyDays`); un festivo en el que el grupo igual tuvo clase (o ya contó como lluvia) no cuenta; una fecha excluida cargada dos veces cuenta una vez (y `POST /semesters/:id/exclusions` ya rechaza duplicados, 409). Un estudiante en dos grupos el mismo día suma por cada grupo (pierde dos clases).
    - **Trazabilidad**: `computeMakeupDebt` devuelve `items` (cada clase de origen: tipo RAIN/JUSTIFIED/HOLIDAY, fecha, grupo, motivo de la exclusión) y `madeUpItems` (reposiciones vistas). `GET /students/:id/makeup-debt` (ADMIN/SUPERADMIN/Coordinador/Recepción) los expone y la ficha del estudiante los lista **antes del historial de asistencia** en dos bloques: "Clases de reposición" y "Por recuperar por calendario".
    - **Cumplimiento ("¿damos las clases que pagaron?")**: **regla vigente: D10** — entra todo estudiante activo, no de prueba, con paquete > 0, sin importar su estado de pago (reemplazó a la regla anterior de matriculados/inscritos, T6). `GET /alerts/coordinator` devuelve `summary` — estudiantes con paquete, completaron, clases **pagadas** (adquiridas + previas), **dadas** (vistas, topadas en el paquete), faltan, % — y de dónde saldrá lo que falta: `coveredByCalendar` (clases regulares que quedan en SUS días hasta el cierre, sin festivos ni días N/A: `classesLeftInSemester`), `makeupPending`, `calendarPending` y `shortfall` (lo que **no alcanza** antes del cierre = faltan − calendario que queda, por estudiante). Listas: `shortfall` (no alcanzan), `makeups` (3+ de reposición), `nearEnd`. `computeStudentProgress` ahora también respeta los días N/A en la fecha estimada de fin. UI: tarjeta "🎯 Cumplimiento" + "📋 Estudiantes que requieren atención" en el **Panel de gestión** (`/admin`, ADMIN/SUPERADMIN/Coordinador); se quitó del inicio.
    - Tests: `tests/unit/studentLedger.test.js`, `tests/integration/semesterCompleted.test.js`, `groupsProgress.test.js`.

55. **Las faltas consumen la clase + estado 🎓 GRADUADO con fecha de fin de semestre:** una sola definición de "le quedan" en todo el sistema (decisión del cliente: la falta sin justificar se pierde — no se repone — así que también gasta la clase del paquete). Todo derivado, **sin migración ni cambios de datos**.
    - **Consumo del paquete** (`consumptionFromRecords` / `loadConsumption` en `services/semesterProgress.js`, unit-testeado): `consumed` = clases vistas (PRESENTE, o AUSENTE en festival) + **faltas sin justificar** (AUSENTE en clase regular o reposición), con unidades y solo desde `classesStartDate`. JUSTIFICADA y N/A **no** consumen (la justificada va a reposición). `seen` (solo vistas) se sigue mostrando aparte para asistencia. `computeCompletion({ acquired, previous, consumed })` → `remaining = paquete − consumidas`, `completed = consumidas ≥ paquete`.
    - Aplica en **todo** lo que usa "le quedan" / "completó": roster del flujo de asistencia (`GET /groups/:id/students` oculta al graduado; `?date=` sigue contando solo sesiones anteriores), panel de Cumplimiento (`summary.seen` = consumidas), "Por completar el semestre", "No alcanzan", tope de reposición/calendario (`splitDebt`), agendamiento público (cuánto puede reservar), Avance de grupos (`pct` = consumidas/paquete) y la fecha estimada de fin.
    - **"Vistas" = clases consumidas** (una sola definición, decisión del cliente): `consumidas.total` = presentes + ausentes + reposiciones vistas, tal como lo define "Reglas de negocio del paquete" (J y N/A no consumen). Es lo que muestra el roster del flujo de asistencia ("Clases: vistas/adquiridas"), la ficha, `/reports/student/:id` y el portal de padres. Hoy lo calcula `consumedUnits` en `services/attendanceStats.js`; el servicio `studentLedger` lo unifica (tareas T4–T6). `seenUnits`/`isSeenRecord` (solo PRESENTE o AUSENTE de festival) **no** son una segunda definición de "vistas": solo siguen vigentes mientras no se migren el estado y los conteos de asistencia.
    - **Falta a una reposición**: la reposición se perdió, así que también **salda** la deuda de reposición (`madeUp` cuenta las reposiciones vistas **o** con falta sin justificar); la ficha la muestra como "✖ Faltó (perdida)".
    - **🎓 GRADUADO** (`services/studentStatus.js`): nuevo estado derivado — solo con semestre activo — cuando consumió todo su paquete; prioridad INACTIVO > SUSPENDIDO > PRUEBA > **GRADUADO** > MATRICULADO > INSCRITO > PREINSCRITO. `graduatedOn` = **fecha de fin de semestre** = la clase con la que llegó al total. El graduado **sale de las listas de asistencia**, se ve con 🎓 en el registro de estudiantes (contador + filtro "🎓 Graduados") y en todas las vistas con ícono de estado. `tuitionStatus` conserva el estado de pago sin la graduación: Contabilidad y la conversión de Visión Estratégica siguen contando al graduado que pagó completo como matriculado (la **ocupación** de cupo sí lo libera). En el panel de Cumplimiento los graduados cuentan como clases entregadas (`COMMITTED_STATUSES` incluye GRADUADO).
    - **Ficha del estudiante**: "🎓 Fin de semestre <fecha>" si ya graduó, o "Fin de semestre estimado <fecha>" si sigue en curso (`GET /students/:id/makeup-debt` → `progress {total, seen, consumed, remaining, pct, completedOn, projectedEnd}`), más el recuadro "Avance (asistencias + faltas) · le quedan N".
    - Todos los `select` de estudiantes que alimentan `attachStudentStatus` incluyen `previousClasses` y `classesStartDate` (festivales, horarios, reposiciones, buscador, Visión Estratégica).
    - Tests: `tests/unit/studentLedger.test.js` (caso Aria), `tests/unit/studentStatus.test.js` (GRADUADO + `tuitionStatus`), integración `semesterCompleted`, `groupsProgress`.

56. **Días que toma el estudiante en cada grupo (D9, tarea T2):** `StudentEnrollment.weekdays` (`Int[]`, migración `20261101010000_enrollment_weekdays`, defensiva). Convención: números de `getUTCDay()` — 0 = domingo … 6 = sábado. **`null` o lista vacía = todos los días del grupo** (Prisma no distingue NULL de `{}` en listas, así que el servidor guarda `[]` para "todos" y `storedWeekdays()` lo lee como `null`). Lógica en `server/src/lib/weekdays.js` (`normalizeWeekdays`, `parseDayLetters`, `groupWeekdays`, `storedWeekdays`, unit-testeada) y en el cliente `utils/weekdays.jsx` (`WeekdayPicker`, `weekdaysLabel`).
    - **API:** `POST /students` acepta `primaryWeekdays` / `secondaryWeekdays` (para `primaryGroupId` / `secondaryGroupId`); `transfer` y `enrollments` aceptan `weekdays`; `PATCH /students/:id/enrollments/:groupId` edita solo los días. Se **valida contra el horario del grupo**: un día que el grupo no tiene → 400 (nombrando el día), lista vacía/no-lista/fuera de 0–6 → 400, grupo inexistente → 404; marcar **todos** los días del grupo equivale a `null`. En `transfer` la validación ocurre **antes** de mover nada. Re-agregar a un grupo sin `weekdays` vuelve a "todos".
    - **Importación** (`services/enrollmentImport.js`): columna **"Días"** (¡no confundir con **"DÍAS"**, que es el horario del grupo; la búsqueda distingue mayúsculas) con las letras **L M X J V S D** (L lunes, M martes, X miércoles, J jueves, V viernes, S sábado, D domingo), separadas por coma/guion/espacio o pegadas (`LXV`). Sin columna o celda vacía → todos los días. Letras desconocidas o un día que el grupo no tiene → **aviso** en `warnings` y la matrícula queda con todos los días (no se detiene la carga). Re-importar sin la columna **no pisa** los días ya guardados.
    - **UI:** en `StudentsPage`, diálogo **"Gestionar grupos"** — casillas por día del grupo en cada matrícula actual (con botón "Guardar días") y al elegir el grupo destino al cambiar/agregar (todas marcadas = `null`; no deja desmarcar el último). La **ficha** muestra un chip por matrícula con sus días ("LMV1 · Lun · Vie") cuando toma solo algunos.
    - **Estado:** el ledger lo usa (`takesDay` / `isMine`) para no generarle lluvia, festivos ni clases esperadas en los días que no toma. N/A queda como excepción puntual.
    - Tests: `tests/unit/weekdays.test.js`, `tests/integration/enrollmentWeekdays.test.js`.

57. **Ventana del semestre y permisos de reporte (D4, tarea T3):**
    - **`server/src/lib/semesterWindow.js`** — `semesterWindow(semester, allSemesters)` → `{ from, to }` con `from` = `startDate` del semestre y `to` = `startDate` del semestre inmediatamente posterior (**exclusivo**), o `null` si no hay uno posterior; `inWindow(window, date)`. `Semester.endDate` **no** es el límite: una clase dictada después del cierre y antes del siguiente semestre sigue siendo del semestre actual (solo se usa para proyecciones). Todavía no la usa ningún cálculo — la consume el cargador del ledger (T5); el código actual sigue filtrando por `startDate`–`endDate`.
    - **`server/src/lib/permissions.js`** — `canReport(user, session, professorId)` (ver "Autorización por recurso"). Corrige el 403 que recibía SUPERADMIN al finalizar o cancelar una reposición (`canReportMakeup` no lo contemplaba); ADMIN conserva su acceso a reposiciones y festivales. `routes/sessions.js`, `makeups.js` y `festivals.js` llaman a `canReport` directamente.
    - Tests: `tests/unit/semesterWindow.test.js`, `tests/unit/permissions.test.js`, `tests/integration/makeups.flow.test.js` (SUPERADMIN/ADMIN finalizan y cancelan una reposición).

58. **Servicio puro `studentLedger` (tarea T4):** `server/src/services/studentLedger.js` → `buildLedger(input)`, implementación literal de la sección 1 de "Reglas de negocio del paquete". **Función pura**: sin Prisma ni fecha del sistema (recibe `today`); fechas como `YYYY-MM-DD` (acepta `Date`, incluso en `exclusions`, que pueden ser cadena, `Date` o `{ date, reason }`). Devuelve `{ studentId, name, status, tuitionStatus, graduadoEl, semaforo, paquete, consumidas, noConsumen, reposicion, calendario, pendientes, sinConsolidar, proyeccion, asistencia, tuition }`.
    - **Cómo está armado:** cada consumo (presente, ausencia que cuenta, reposición vista, ausencia derivada de SIN_ESTUDIANTES) es un *evento* con fecha; de ahí salen `consumidas.*` y `graduadoEl` (la fecha con la que se alcanzó el paquete), así que no puede haber dos definiciones. Las clases que le tocan son pares **(grupo, fecha)**: un estudiante en dos grupos el mismo día tiene dos clases (y suma un festivo por grupo). `pendientes.total` se reparte siempre entre cuatro cubetas — `cubreCalendario + agendadasAplicadas + porAgendar + deficit` — y la prueba lo verifica sobre 200 entradas aleatorias.
    - **Notas de implementación:** `weekdays` null **o lista vacía** = todos los días del grupo (así guarda Prisma el "todos", nota 56). La ventana (D4) se aplica a registros, sesiones **y** exclusiones. Redondeos con `roundUnits` (un decimal). `heldOn` solo reconoce REALIZADA y CANCELADA (no el legado CANCELADA_MITAD).
    - **Rendimiento:** ≈ 0,4 ms por estudiante (800 estudiantes ≈ 0,3 s).
    - **Tests:** `tests/unit/studentLedger.test.js` — casos A–J del brief (Aria: consumidas 17, derecho 4, pendientes 23 = 13 + 1 + 2 + 7, semáforo ROJO), reglas D1/D2/D5/D7, semáforo, y el invariante de 200 semillas.
    - **Siguiente:** T6 (nota 60, hecho). Pendientes T7–T10 del brief.

59. **Cargador y endpoints del ledger (tarea T5):**
    - **`loadLedgers({ studentIds?, groupIds?, semester? })`** en `services/studentLedger.js`: lee todo en **una consulta por tabla** (estudiantes con matrículas, registros de asistencia de la ventana, sesiones REGULAR de sus grupos, participaciones `PROGRAMADA`, sumas de pago y tarifas), arma la ventana D4 con `semesterWindow` y llama a `buildLedger` por estudiante. Devuelve `{ semester, window, today, exclusions, ledgers }`; sin semestre activo, `ledgers: []`. Cada ledger lleva además `document`, `groups` (`{ id, code, enrollmentType }`) y `missingBirthDate`. `studentIds` carga a esos estudiantes aunque estén inactivos; sin él, solo activos. Los `require` de Prisma son perezosos para que `buildLedger` siga siendo probable sin base de datos.
    - **`summarizeLedgers(ledgers)`** (pura): sumas sobre estudiantes con `paquete.total > 0` que no sean INACTIVO ni PRUEBA (D10) — `paquete`, `consumidas` (topadas en el paquete), `pct`, `pendientes.*` (las cuatro cubetas), `reposicion.*`, `calendario.*`, `sinConsolidar.*` y el conteo por semáforo. En `GET /ledger` el resumen cubre el grupo pedido (`groupId`), **no** el filtro de semáforo ni la búsqueda, así los contadores siguen sumando el total.
    - **Rutas** (`routes/ledger.js`, montada en `/api/ledger`): ver "Ledger del paquete" en API Endpoints. `/groups` va antes de `/:studentId`. **`tuition` solo para ADMIN/SUPERADMIN** (y el padre en su propio hijo): Recepción, Coordinador y Profesor reciben el ledger sin `tuition` (brief §1.5; ojo, `stripTuition` de la nota 44 sí deja ver montos a Recepción — aquí se aplica la regla del brief). `/groups` usa `holidayDeviationForGroup` + `loadGroupSessionCounts` (ahora acepta la ventana D4) + `getPlanClasses`, exportados de `semesterProgress.js`.
    - **Rendimiento:** cada petición a `/api/ledger` recalcula todos los ledgers (≈ 0,4 ms por estudiante); no hay caché.
    - Tests: `tests/integration/ledger.routes.test.js` (roles, filtros, resumen, ledger individual idéntico al de la lista, una consulta por tabla, ventana en las consultas, `/groups`).


60. **T6 — todo el sistema lee del ledger (se borraron los motores duplicados):**
    - **Migrado a `loadLedgers`/`buildLedger`:** `studentStatus.js` (`attachStudentStatus` toma el estado del ledger; `deriveStatus` es la única prioridad de estados; sin semestre activo cae a pagos), `GET /groups/:id/students` (`classesSeen` = `consumidas.total`, graduado oculto, `?date=` → `before`), `/students/attendance-summary`, `/students/:id/makeup-debt` (mismos nombres de campo de antes, derivados del ledger), `/students/:id/report` y `/reports/student/:id` (vista común en `services/studentAttendance.js`), Seguimiento de Estudiantes, `/reports/strategy`, `/reports/groups-progress`, `/alerts/coordinator`, `/alerts/semester-completed`, agendamiento público (`/reponer/:token` reserva hasta `reposicion.porAgendar`), portal de padres y `/api/ledger`.
    - **Eliminado:** `services/attendanceAlerts.js`, `services/studentTracking.js`, `GET /alerts/attendance`, las funciones `seenUnits`/`isSeenRecord`/`seenAttendanceFilter`, `computeMakeupDebt`, `consumptionFromRecords`, `computeCompletion`, `splitDebt`, `projectEndDate` y el interruptor "las faltas consumen clase" (siempre consumen). `semesterProgress.js` conserva solo los datos de calendario/plan por grupo (`holidayDeviationForGroup`, `loadGroupSessionCounts(groups, semester, today, window)`, `getPlanClasses`, `computeGroupHolidayDeviation`, `computeGroupsProgress`).
    - **Cambios de cifras visibles:** el estado ya no depende de la asistencia (D7: PREINSCRITO sin pagos, INSCRITO con pago parcial); Cumplimiento cuenta a todo estudiante con paquete (D10); la ventana del semestre es `[inicio, inicio del siguiente)` (D4); OTRA cuenta como reposición, SIN_ESTUDIANTES consume (D1/D2); la suspensión congela el paquete (D5); % de asistencia = P/(P+A) (D6).
    - **Contrato:** las respuestas migradas adjuntan `ledger` (`ledgerBrief`) y `tests/integration/ledger.contract.test.js` verifica que el roster, el seguimiento, la ficha y `/api/ledger/:id` den la misma cifra. Recepción ve `tuition` (ADMIN, SUPERADMIN, RECEPTION: `TUITION_ROLES`); Coordinador y Profesor no. Helper de pruebas `mockLedgerDeps` en `tests/helpers/mockPrisma.js`.


61. **Front end del ledger (revisión de consistencia, sección 4):**
    - **Una sola pantalla de gestión**, `/admin/ledger` ("Reposiciones y reprogramación", `LedgerPage.jsx`, ADMIN/Coordinador): vista **Por estudiante** (semáforo, filtros Rojos/Ámbar/Sin paquete/Sin consolidar, acción por fila según el color) y **Por grupo** (`GET /api/ledger/groups`: plan, dadas, festivos con fecha y motivo, lluvia, fin planeado vs estimado, estudiantes que no alcanzan, "Proponer extensión"). Reemplazó la pestaña **Individuales** y la pestaña **Calendario** de `/admin/alerts` (que quedó con Lluvia y Preinscritos).
    - **Componentes/utilidades únicos:** `components/StudentLedgerCard.jsx` (pagadas · vistas · faltan + los cuatro sumandos calendario/agendadas/por agendar/déficit, "+N de más" si hay excedente, "sin consolidar") usada en la ficha, el portal de padres y la pantalla de gestión; `utils/glossary.js` (`GLOSSARY` y `SEMAFORO`, los textos de ayuda y los colores). Los colores de tablas salen del `semaforo` del servidor: se eliminaron `trafficColor`/`vsGroupColor` de Seguimiento y Avance de grupos y el hook `useSemesterCompleted` (el estado GRADUADO ya viene en `studentStatus`).
    - **Cumplimiento** (`CoordinatorStudentsPanel`): las cuatro cajas suman lo que falta; los festivos son una nota informativa.
    - **Ficha:** `GET /students/:id/report` entrega en cada fila de `timeline` el `effect` (CONSUME / DERECHO / REPROGRAMADA / NO_CUENTA), las `units` y el `acumulado` de vistas (termina en `consumidas.total` del ledger; lo verifica la prueba de contrato). Los festivos y recesos aparecen como filas "REPROGRAMADA".
    - **Flujo de asistencia:** aviso "genera una reposición" al marcar J; al cancelar se muestra el efecto de cada motivo (lluvia/otra = se repone a todos; sin estudiantes = consume); "Sin paquete" en vez de "0/0".
    - **Pendiente:** limpieza del repositorio (sitio Netlify/Google Sheets, `SISTEMA.md`, README de fase 1) y T10.

45. **Estado de asistencia N/A (`NO_APLICA`):** para estudiantes que **compran menos clases** que los días del grupo (p. ej. vienen 1 vez/semana en un grupo de 3 días). No cuenta **ni como asistencia ni como ausencia**: no consume paquete (no es "clase vista" — allowlist de `attendanceStats`), no genera reposición, no suma al pago del profesor (costEngine solo cuenta PRESENTE), no dispara INSCRITO, queda **fuera del denominador** de `attendanceRate` (reportes de clase/estudiante/profesor y portal padres) y **fuera de la distribución** del dashboard. (Las alertas de asistencia que descontaban N/A de las clases esperadas están **obsoletas**: D8. Desde D9 los días que toma el estudiante se registran en la matrícula, `StudentEnrollment.weekdays`; N/A queda como excepción puntual.) Cuarto botón **N/A** (gris) solo en el flujo regular (Step3); reposiciones y festivales no lo muestran (participantes asignados a mano) aunque el server lo acepta en las 3 whitelists. En la doble consolidación ambos reportes deben coincidir también en N/A (igualdad de string). Migración aislada `20260725010000_attendance_status_no_aplica` (`ADD VALUE IF NOT EXISTS`). Tests: `attendanceStats`, `consolidation`, `attendanceAlerts` (nuevo) y whitelist en `finalize.dual`.

51. **Importar asistencia desde Excel (carga masiva, solo SUPERADMIN):** para reportes tomados por fuera del sistema, sin que profesores, asistentes ni coordinador tengan que reportar. UI: tarjeta "Importar asistencia (Excel)" en la sección **Base de datos** de `/admin/config` (solo Superadmin) → **Vista previa** (no escribe) → **Importar**. Endpoint `POST /system/import-attendance`, lógica en `services/attendanceImport.js`. Formato: una fila por estudiante con **Fecha, Grupo, Estudiante, Marca** (P/A/J/NA) y opcionales **Detalle** («repone de X» → `attendanceType=REPOSICION`), **Profesor** (vacío = titular; distinto del titular = sustituto con nota "Importado desde Excel") y **Asistente** (vacío = sin asistente). Grupo **REP** = reposición grupal: se reporta la `MAKEUP` programada esa fecha que contenga a esos estudiantes (o se crea si viene Profesor). Cada clase regular entra como **dos `ClassReport` idénticos** (PROFESSOR + COORDINATOR) → `consolidateSession()` → MATCHED, `AttendanceRecord` y costos por el camino normal; así desaparece de "clases sin reportar". Pago: no se suspende por reporte tardío (estampa `paymentUnlockedAt/ById` = quien importa) y el asistente queda confirmado (`assistantConfirmed*`, triple coincidencia) → PAYABLE, pendiente de **aprobar** en Liquidación como cualquier clase. Estudiantes por nombre normalizado (sin tildes/mayúsculas); ante homónimos prefiere activo y luego inscrito en el grupo (o en el grupo del que repone). Reglas de seguridad: una clase con cualquier error no se carga entera; las ya consolidadas o canceladas se **omiten** (re-importar el mismo archivo es inofensivo); quincena cerrada → error. Sin cambios de schema. Tests: `tests/unit/attendanceImport.test.js`, `tests/integration/attendanceImport.test.js`; validado contra Postgres real con el archivo de asistencia del 13–17 oct 2026 (los costos coinciden con la liquidación esperada).
