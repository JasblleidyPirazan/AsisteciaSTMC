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
| `Student` | Estudiantes, vinculados a un padre (parentUserId) |
| `Group` | Grupos de clase: días, horario, cancha, nivel de bola, tipo sencilla/doble |
| `StudentEnrollment` | Relación estudiante↔grupo (PRIMARY o SECONDARY) |
| `ClassSession` | Sesión de clase: PROGRAMADA/REALIZADA/CANCELADA/CANCELADA_MITAD |
| `AttendanceRecord` | Asistencia por estudiante: PRESENTE/AUSENTE/JUSTIFICADA + tipo REGULAR/REPOSICION |
| `CostRecord` | Costos calculados por sesión (professorId XOR assistantId, payeeType) |
| `MakeupClass` | Reposiciones grupales |
| `Event` | Torneos/clínicas con pago fijo |
| `EnrollmentRequest` | Solicitudes de inscripción (estado PENDING/APPROVED/REJECTED) |
| `SystemConfig` | Tarifas configurables: rate_per_student, assistant_fixed_rate, reposition_rate |

---

## Motor de Costos

Archivo: `server/src/services/costEngine.js`

- Se ejecuta al hacer `POST /api/sessions/:id/finalize`
- Clases sencillas (45 min): `effectiveUnits = 1.0`
- Clases dobles (90 min): `effectiveUnits = 2.0`
- Cancelada a la mitad: `effectiveUnits = 1.0` (toggle en el resumen)
- **Profesor**: `presentes_regulares × tarifa × units + presentes_reposicion × tarifa_repo × units`
- **Asistente**: `tarifa_fija × units`
- Solo sesiones REALIZADA o CANCELADA_MITAD generan costo

---

## Flujo de Asistencia (5 pasos, mobile-first)

1. Dashboard → seleccionar grupo del día
2. Step1: ¿La clase se realizó? SI → sigue / NO → motivo → guarda CANCELADA → fin
3. Step2: ¿Quién dictó? (titular por defecto, selector de sustituto, selector de asistente)
4. Step3: Lista de estudiantes con botones P/A/J (44×44px), agregar reposición, toggle mitad
5. Step4: Resumen con cálculo de pago (solo visible para ADMIN y TEACHER)

---

## Roles y Accesos

| Acción | ADMIN | TEACHER | ASSISTANT | PARENT |
|---|---|---|---|---|
| CRUD datos maestros | ✅ | ❌ | ❌ | ❌ |
| Ver grupos del día | ✅ | Solo los propios | Todos | Los del hijo |
| Tomar asistencia | ✅ | Solo sus grupos | ❌ | Solo su hijo |
| Marcar clases acompañadas | ✅ | ❌ | ✅ | ❌ |
| Ver cálculo de costos | ✅ | Solo el propio | Solo el propio | ❌ |
| Liquidación quincenal | ✅ | ❌ | ❌ | ❌ |
| Configurar tarifas | ✅ | ❌ | ❌ | ❌ |
| Portal hijo/a | ✅ | ❌ | ❌ | ✅ |

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
- `POST /api/sessions/:id/finalize` — guardar asistencia + calcular costos
- `POST /api/sessions/:id/cancel` — cancelar con motivo
- `POST /api/sessions/:id/assist` — asistente marca que acompañó

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
- `GET/PUT /api/config`

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
| `/parent` | ParentPortalPage | PARENT, ADMIN |
| `/admin` | AdminDashboard | ADMIN |
| `/admin/students` | StudentsPage | ADMIN |
| `/admin/payroll` | PayrollPage | ADMIN |
| `/admin/config` | ConfigPage | ADMIN |
| `/admin/enrollment` | EnrollmentRequestsPage | ADMIN |

---

## Seguridad Implementada

- `helmet` — headers HTTP de seguridad (X-Frame-Options, HSTS, etc.)
- Rate limiting en auth (20 req/15min) y enrollment (5 req/hora)
- CORS restringido en producción
- JWT tokens de 7 días, verificados en cada request
- Passwords con bcrypt (12 rounds en cambio de contraseña, 10 en creación)
- Protección contra timing attacks en login
- Validación de inputs con longitudes máximas
- Error handler no expone detalles internos en producción
- Soft delete (campo `active`) en lugar de borrado permanente
- `UNIQUE([groupId, date])` en ClassSession previene duplicados a nivel BD

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

2. **classUnits:** Se calcula automáticamente al crear/editar grupo: `durationMinutes >= 80 → 2.0, else 1.0`.

3. **Quincenas:** `period` se almacena como `"2025-06-1"` (primera) o `"2025-06-2"` (segunda). Función `getPeriodForDate()` en costEngine.js.

4. **Offline:** localStorage key `stmc_pending_sessions`. Auto-sync cuando `navigator.onLine` vuelve a true.

5. **useAuth.jsx** tiene JSX (usa `<AuthContext.Provider>`), debe tener extensión `.jsx` no `.js`.

6. **Token JWT:** almacenado en `localStorage` con key `stmc_token`. El cliente (`api/client.js`) lo agrega automáticamente en cada request como `Authorization: Bearer ...`.
