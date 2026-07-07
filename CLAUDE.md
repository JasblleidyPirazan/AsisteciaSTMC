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
| `User` | Cuentas de acceso. Roles: ADMIN, TEACHER, ASSISTANT, PARENT |
| `Professor` | Profesores (puede tener User vinculado) |
| `Assistant` | Asistentes (puede tener User vinculado) |
| `Student` | Estudiantes, vinculados a un padre (parentUserId). `classesAcquired` = total de clases compradas para el semestre (lo fija el admin) |
| `Group` | Grupos de clase: días, horario, cancha, nivel de bola, tipo sencilla/doble |
| `StudentEnrollment` | Relación estudiante↔grupo (PRIMARY o SECONDARY) |
| `ClassSession` | Sesión de clase: PROGRAMADA/REALIZADA/CANCELADA/CANCELADA_MITAD. `kind` REGULAR/MAKEUP; las reposiciones grupales tienen `groupId` null, `makeupProfessorId`, `title` y `effectiveUnits` = "por cuántas asistencias cuenta" |
| `MakeupParticipant` | Estudiantes asignados a una reposición grupal (sessionId + studentId) |
| `AttendanceRecord` | Asistencia por estudiante: PRESENTE/AUSENTE/JUSTIFICADA + tipo REGULAR/REPOSICION |
| `CostRecord` | Costos calculados por sesión (professorId XOR assistantId, payeeType) |
| `MakeupClass` | (Legacy, sin uso) — las reposiciones grupales ahora viven en `ClassSession` con `kind=MAKEUP` |
| `Event` | Torneos/clínicas con pago fijo |
| `EnrollmentRequest` | Solicitudes de inscripción (estado PENDING/APPROVED/REJECTED) |
| `SystemConfig` | Tarifas configurables: rate_2_students, rate_3_students, rate_4_students, rate_5plus_students, assistant_fixed_rate |
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
- `POST /api/sessions/:id/finalize` — guardar asistencia + calcular costos. **Si la sesión ya estaba finalizada, se trata como edición:** guarda `SessionEditLog` con el estado anterior, reemplaza todos los registros (el último reporte manda) y recalcula costos
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
- `GET /api/reports/dashboard`
- `GET /api/reports/group/:id`
- `GET /api/reports/student/:id`
- `GET /api/reports/assistant/:id`
- `GET /api/reports/professor/:id`
- `GET /api/reports/class/:sessionId`
- `GET/PUT /api/config`
- `GET /api/payroll/export?period=X` — descarga Excel. ADMIN: 3 hojas (Profesores, Asistentes, Resumen). TEACHER/ASSISTANT: una sola hoja "Mi liquidación" con solo sus registros
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
   - `prisma db push` (crea tablas si no existen)
   - `node src/scripts/seed.js` (crea admin + tarifas por defecto)
   - `node src/index.js` (inicia el servidor)

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

# Base de datos
cd server && npx prisma db push --schema src/prisma/schema.prisma
cd server && node src/scripts/seed.js

# Build producción
cd client && npm run build
```

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
