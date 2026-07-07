# SISTEMA.md — Referencia Técnica Maestra (AsisteciaSTMC)

> Documento de contexto interno para Claude. Resume el estado **real** del sistema,
> sus invariantes, decisiones de diseño, bugs históricos y "gotchas". Léelo al inicio
> de cada sesión junto con `CLAUDE.md`. Si cambias comportamiento del sistema,
> **actualiza este archivo en el mismo commit.**
>
> Última actualización de referencia: commit `90c9f99` (fix asistente/sustituto).

---

## 0. TL;DR — lo que nunca debes olvidar

1. **El motor de costos paga por TRAMO de estudiantes presentes, no por estudiante.** `getBracketRate(regularPresent, cfg)` → tarifa plana por sesión × `effectiveUnits`. Hay un espejo en el frontend (`CostSummary.jsx`) que DEBE mantenerse sincronizado con `server/src/services/costEngine.js`.
2. **El último reporte de una clase manda.** Re-finalizar = edición: borra todos los `AttendanceRecord`, recrea, guarda `SessionEditLog`, recalcula costos.
3. **`CostRecord` usa `professorId` XOR `assistantId` (ambos nullable).** Nunca un `payeeId` genérico — eso rompía PostgreSQL.
4. **Las fechas de Prisma (`@db.Date`) llegan como ISO UTC midnight.** Usa `client/src/utils/dates.js` (`fmtDate`) en el front. Nunca concatenes `fecha + 'T12:00:00'` sin pasar por ahí.
5. **El asistente/sustituto se eligen en el paso 2 pero la sesión nace en el paso 1.** `finalize` DEBE persistir `assistantId`/`substituteProfessorId` o se pierden (bug histórico, ver §9).
6. **La autorización es server-side por recurso, no solo por rol.** No confíes en que el front oculte algo: el back también lo bloquea.
7. **Una sesión por grupo por día** (`UNIQUE(groupId, date)`). **Un registro por estudiante por sesión** (`UNIQUE(sessionId, studentId)`). No hay asistencia doble posible.

---

## 1. Qué es el sistema

Gestión de asistencia para una academia de tenis. Migración de Netlify+Google Sheets → Railway+PostgreSQL. Núcleo diferenciador: **motor de costos automático** que calcula cuánto se le paga a cada profesor/asistente por clase, agregado en **liquidaciones quincenales**.

- **Admin:** jasblleidy@gmail.com
- **Repo:** JasblleidyPirazan/AsisteciaSTMC · **PR activo:** #1
- **Branch de trabajo:** `claude/ecstatic-goldberg-UpKEn`
- **Deploy:** Railway → `asisteciastmc-production.up.railway.app`
- **Arranque (start.sh):** `prisma db push` → `seed.js` → `node src/index.js`
  - ⚠️ Railway debe apuntar al branch de trabajo, no a `main`.
  - `prisma db push` crea tablas nuevas automáticamente al desplegar (no hay migraciones versionadas).

---

## 2. Stack y estructura

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 5, CSS propio mobile-first (sin Tailwind) |
| Backend | Node.js + Express 4 |
| BD | PostgreSQL + Prisma ORM v5 |
| Auth | JWT (7d) + bcryptjs |
| Excel | `xlsx` (solo escritura — ver §10 nota de seguridad) |
| Seguridad | helmet, express-rate-limit |

- **Frontend** (`client/src/`): `api/client.js` (fetch+JWT), `hooks/` (useAuth, useOffline), `pages/`, `components/`, `utils/dates.js`, `index.css` (todo el CSS global).
- **Backend** (`server/src/`): `index.js` (entry), `prisma/schema.prisma`, `lib/prisma.js` (singleton), `middleware/` (auth, errorHandler), `services/costEngine.js`, `routes/` (13 routers), `scripts/` (seed, seed-demo).

---

## 3. Modelo de datos — invariantes

Modelos: `User`, `Professor`, `Assistant`, `Student`, `Group`, `StudentEnrollment`, `ClassSession`, `AttendanceRecord`, `CostRecord`, `MakeupClass`, `MakeupEnrollment`, `Event`, `EnrollmentRequest`, `SystemConfig`, `StudentGroupHistory`, `Semester`, `SemesterExclusion`, `SessionEditLog`.

**Invariantes y detalles que importan:**

- **`User.role`**: `ADMIN | TEACHER | ASSISTANT | PARENT | PHYSICAL_TRAINER`.
- **`Professor`/`Assistant`** tienen `userId?` opcional (puede existir sin cuenta de acceso). La relación con `User` es por `userId`.
- **`Student.parentUserId`** vincula al padre. `deactivationReason`/`deactivatedAt` para soft-delete con motivo.
- **`Group`**: `classUnits` (Decimal 1.0/2.0) se **deriva** de `durationMinutes` (`>= 80 → 2.0`). `code` es único. Soft-delete con motivo igual que Student.
- **`StudentEnrollment`**: PK compuesta `[studentId, groupId]`. `enrollmentType: PRIMARY | SECONDARY`. Un estudiante puede estar en varios grupos (multigrupo).
- **`ClassSession`**: `UNIQUE([groupId, date])`. `status: PROGRAMADA | REALIZADA | CANCELADA | CANCELADA_MITAD`. `effectiveUnits` (Decimal). `substituteProfessorId?`, `assistantId?`, `reportedById?`.
- **`AttendanceRecord`**: `UNIQUE([sessionId, studentId])`. `status: PRESENTE | AUSENTE | JUSTIFICADA`. `attendanceType: REGULAR | REPOSICION`.
- **`CostRecord`**: `professorId?` **XOR** `assistantId?` (solo uno con valor según `payeeType`). `rate` = tarifa de tramo (NO por estudiante). `presentCount` = total de estudiantes presentes (regulares + reposición). `period` formato `"YYYY-MM-N"`.
- **`SystemConfig`**: tabla key/value. Claves: `rate_2_students`, `rate_3_students`, `rate_4_students`, `rate_5plus_students`, `assistant_fixed_rate`. (Las viejas `rate_per_student` y `reposition_rate` quedaron obsoletas — ver §9.)
- **`SessionEditLog`**: `previousState`/`newState` en `Json`. Se crea solo cuando se re-finaliza una sesión ya finalizada.
- **`Semester`**: solo uno con `active: true` a la vez (al activar uno, los demás se desactivan). `SemesterExclusion` = fechas no lectivas.

---

## 4. Motor de costos (lo más crítico) — `server/src/services/costEngine.js`

Se ejecuta en `POST /api/sessions/:id/finalize` y al marcar/desmarcar asistente.

```
effectiveUnits: sencilla=1.0, doble=2.0, doble cancelada a la mitad=1.0
Solo sesiones REALIZADA o CANCELADA_MITAD generan costo.

Profesor (titular o sustituto, según corresponda):
   bracketRate(presentCount) × effectiveUnits

   presentCount = total de estudiantes presentes (regulares + reposición;
                  la reposición NO tiene tarifa aparte, cuenta como un
                  estudiante más para el tramo)
   bracketRate: 1-2 → rate_2_students
                3   → rate_3_students
                4   → rate_4_students
                5+  → rate_5plus_students
   (tarifa PLANA por sesión, no por estudiante)

Asistente (si la sesión tiene assistantId):
   assistant_fixed_rate × effectiveUnits
```

**Reglas de implementación:**
- Es **idempotente**: hace `deleteMany` de los `CostRecord` de la sesión antes de recrear. Por eso se puede llamar múltiples veces (ediciones, marcar asistente) sin duplicar pagos.
- El profesor que cobra es `substituteProfessor || group.professor`.
- `getBracketRate` se exporta y hay un **espejo en `client/src/components/CostSummary.jsx`** para el preview en vivo del paso 4. **Si cambias la fórmula, cambia ambos.**
- `getPeriodForDate(date)` define la quincena: día ≤ 15 → `"1"`, si no → `"2"`. Formato `"2026-06-1"`.

---

## 5. Flujo de asistencia (5 pasos) + edición

`client/src/pages/AttendanceFlow/index.jsx` orquesta.

1. **Dashboard** → tap a grupo del día → navega a `/attendance/:groupId` con `state.group`.
2. **index.jsx al montar** llama `GET /sessions/check?groupId&date`. Si ya existe sesión **finalizada** → modo **edición**: precarga asistencia + sustituto + asistente, salta al **paso 3**, muestra banner "Editando reporte".
3. **Step1ClassStatus**: ¿se realizó? NO → motivo → `POST /sessions` + `/cancel` → fin. SÍ → `POST /sessions` (status PROGRAMADA) → paso 2.
4. **Step2Teacher**: elige sustituto (default titular) y asistente (opcional). ⚠️ Estos datos se eligen aquí pero la sesión ya existe; viajan al backend en `finalize` (ver §9 bug 1).
5. **Step3Students**: lista con botones P/A/J. Botón marcado lleva `.selected` + clase de color; los otros `.dim`. "Todos P/A", agregar reposición, modal de justificación.
6. **Step4Summary**: stats, toggle "¿canceló a la mitad?" (**solo grupos dobles**), preview de pago (solo ADMIN/TEACHER vía `GET /config/rates`), botón enviar/guardar.

**`finalize` payload:** `{ attendanceRecords, cancelledHalf, substituteProfessorId, assistantId }`.

**Edición (backend):** snapshot previo → `deleteMany` records → `createMany` nuevos → update sesión (incluye assistant/substitute) → `SessionEditLog` → `calculateCosts`. El historial se ve en Reportes → Clase.

**Offline:** `localStorage['stmc_pending_sessions']`, auto-sync al reconectar (`hooks/useOffline.jsx`).

---

## 5b. Reposiciones grupales (módulo)

Una reposición es un **`ClassSession` con `kind=MAKEUP` y `groupId=null`** — reutiliza el motor de costos, la liquidación y los reportes sin duplicar lógica.

- **Crear** (`/admin/makeups`, ADMIN/PF → `POST /makeups`): fecha, título, `professorId` (→ `makeupProfessorId`), asistente opcional, **`countsAsUnits`** (→ `effectiveUnits`, "por cuántas asistencias cuenta") y `studentIds[]` (→ `MakeupParticipant`). Status inicial PROGRAMADA.
- **Reportar** (`MakeupAttendancePage`, `/makeups/:id/attendance` → `POST /makeups/:id/finalize`): igual flujo que clases regulares pero en una sola pantalla. Permite cambiar profesor (sustituto)/asistente y marcar P/A/J de los participantes. ADMIN/PF cualquiera; TEACHER solo si es el profesor asignado o sustituto.
- **Pago profesor:** `getBracketRate(presentes) × effectiveUnits`. **Todos los participantes cuentan como REGULAR** (no reposición) — el "tramo" se calcula sobre los presentes de la reposición.
- **Costo:** genera `CostRecord` normal → aparece en liquidación quincenal y en el reporte de profesor (que ahora incluye sesiones con `makeupProfessorId`/`substituteProfessorId`, no solo `group.professorId`).
- **Asistentes** acompañan reposiciones por el mismo `POST /sessions/:id/assist`.
- **Visibilidad:** aparecen como "Reposiciones pendientes" en el Dashboard de profesor/PF (status PROGRAMADA). `GET /sessions` normal las **excluye** (`kind=REGULAR` por defecto) para no contaminar vistas existentes.
- Editar/eliminar reposición: `PUT /makeups/:id` (recalcula costos si ya estaba reportada), `DELETE /makeups/:id`.

---

## 6. Asistentes — cómo funciona realmente

Hay **dos caminos** para asignar un asistente a una clase:

1. **Profesor en el flujo de asistencia** (Step2Teacher): selecciona asistente → se guarda en `finalize`.
2. **Asistente desde su dashboard** ("Clases que acompañé", `AssistantView` en DashboardPage):
   - Carga `GET /sessions?date=X` + `GET /assistants` para identificarse por email.
   - Toggle por grupo → `POST /sessions/:id/assist` (marcar) o `{ remove: true }` (desmarcar).
   - Toggle **deshabilitado** si la clase no fue reportada aún o si otro asistente ya la marcó.
   - Al marcar/desmarcar se recalculan costos si la sesión está REALIZADA/CANCELADA_MITAD.

**Un solo asistente por clase** (`assistantId` es campo único, no lista). No hay asistencia doble.

`POST /sessions/:id/assist` body: `{}` marca (ASSISTANT usa su propio perfil; ADMIN pasa `assistantId`), `{ remove: true }` desmarca.

---

## 7. Roles y autorización (server-side por recurso)

| Acción | ADMIN | TEACHER | PHYSICAL_TRAINER | ASSISTANT | PARENT |
|---|---|---|---|---|---|
| CRUD estudiantes/grupos/eventos | ✅ | ❌ | ✅ | ❌ | ❌ |
| Ver grupos del día | Todos | Propios | Todos | Todos | Del hijo |
| Tomar asistencia | ✅ | Sus grupos | Todos | ❌ (usa /assist) | Solo su hijo |
| Marcar clase acompañada | ✅ | ❌ | ❌ | ✅ | ❌ |
| Ver costos/pago | ✅ | El propio | ❌ | El propio | ❌ |
| Liquidación completa | ✅ | ❌ | ❌ | ❌ | ❌ |
| Mi quincena (Excel propio) | — | ✅ | ❌ | ✅ | ❌ |
| Configurar tarifas/semestres | ✅ | ❌ | ❌ | ❌ | ❌ |

**Guards clave:**
- `canReportGroup()` en `sessions.js`: ADMIN/PF cualquier grupo; TEACHER solo donde es titular; PARENT solo grupos con hijo inscrito; ASSISTANT denegado.
- **Reportes**: profesor/asistente solo ven el propio; PF ve reporte de profesor **sin montos**; `totalCost` de clase solo a ADMIN o al profesor que dictó.
- **Dashboard stats**: `totalPayableThisMonth` solo se **envía** a ADMIN (no solo oculto en UI).
- **`GET /config/rates`**: ADMIN+TEACHER (preview de pago). `GET/PUT /config` completo: solo ADMIN.
- **`GET /groups/:id/students`**: PARENT solo si tiene hijo en ese grupo.
- **`authMiddleware` revalida `user.active` en BD en cada request** → desactivar un usuario lo expulsa de inmediato (no espera los 7 días del token).

**PHYSICAL_TRAINER**: gestión operativa completa, **cero información económica**. No hay UI para crearlo aún → vía SQL/seed (`role: 'PHYSICAL_TRAINER'`).

---

## 8. Quincenas y liquidación

- **Período**: `"YYYY-MM-N"`, N=1 (días 1-15) o N=2 (16-fin). `getPeriodForDate()` en costEngine.
- **`GET /payroll/summary?period`** (ADMIN): `{ items[], totalProfessors, totalAssistants, grandTotal }`. Items ordenados profesores→asistentes.
- **`GET /payroll?period&payeeId?`**: detalle. TEACHER/ASSISTANT filtrados a lo propio; PF bloqueado (403).
- **`GET /payroll/export?period`**:
  - ADMIN → 3 hojas (Profesores, Asistentes, Resumen).
  - TEACHER/ASSISTANT → 1 hoja "Mi liquidación" con solo sus registros (scope verificado por userId server-side).
- **Frontend**: `PayrollPage` (admin, secciones separadas + export), `MyPayrollPage` (`/my-payroll`, TEACHER/ASSISTANT, botón "💰 Mi quincena" en dashboard).
- Descarga Excel: `fetch` raw con `Authorization` header (no `api.get`), blob → `URL.createObjectURL`.
- **Dashboard admin**: muestra `totalPayableThisPeriod` = pago de la **quincena actual** (agregado por `period`), no mensual.

---

## 9. Bugs históricos corregidos (NO repetir)

1. **Asistente/sustituto no se guardaban** (`90c9f99`): la sesión nace en paso 1, se elegían en paso 2, y `finalize` no los enviaba → `assistantId`/`substituteProfessorId` quedaban null (asistente sin pago, pago de sustituto al titular). **Fix:** `finalize` acepta y persiste ambos. *Datos previos a este fix quedaron en null — corregir reabriendo la clase en modo edición.*
2. **Toggle "Clases que acompañé" no guardaba**: usaba `g.sessionId` (campo inexistente en `/groups`). **Fix:** `AssistantView` carga sesiones reales del día.
3. **Highlight P/A/J nunca aparecía**: JSX aplicaba clases en español, CSS las define en inglés (`.present/.absent/.justified`). **Fix:** `STATUS_CLASS` map + `.selected`/`.dim`.
4. **"Invalid Date" en 6 páginas**: concatenaban `fecha + 'T12:00:00'` sobre fechas ISO de Prisma. **Fix:** `utils/dates.js`.
5. **Login fallido recargaba la página** antes de mostrar el error: el handler global de 401 no exceptuaba `/auth/login`. **Fix:** excepción en `client.js`.
6. **`CostRecord` con `payeeId` genérico** rompía PostgreSQL → separado en `professorId`/`assistantId` nullable.
7. **`useAuth.js` con JSX** → renombrado a `.jsx`.
8. **Cost records huérfanos** al cancelar una sesión ya finalizada → `cancel` ahora hace `deleteMany` de costos.
9. **Tarifa por estudiante → por tramo**: el modelo viejo (`rate_per_student`) se reemplazó por tramos 2/3/4/5+. El front tenía la fórmula vieja y pedía `/config` (solo admin) → 403 silencioso. **Fix:** `/config/rates` + espejo en `CostSummary`.

---

## 10. Decisiones de diseño y "gotchas"

- **No hay migraciones versionadas.** `prisma db push --accept-data-loss` en deploy. Cambios de schema destructivos pueden perder datos — pensar antes de renombrar/borrar columnas.
- **CORS `origin: true`** y helmet con CSP/COEP desactivados: auth es por JWT (no cookies), CSRF no es amenaza. Se relajó para que cargara en Railway (ver `b86cd79`).
- **JSON body limit 5mb** (soporta imágenes base64 de comprobantes de pago en inscripción).
- **Token JWT** en `localStorage['stmc_token']`. `api/client.js` lo inyecta como `Authorization: Bearer`.
- **xlsx advisories** (prototype pollution, ReDoS): aplican solo a `XLSX.read` (parseo). El sistema solo **genera** (`XLSX.write`), nunca parsea archivos subidos → no explotable. Sin fix upstream.
- **Modal CSS**: `.modal-overlay`/`.modal-content` en `index.css`. Cierra al click fuera (stopPropagation en el contenido).
- **CSS de fluidez**: `.btn:active` escala, `prefers-reduced-motion` respetado.
- **Toggle "mitad"** solo se renderiza en grupos dobles (`{isDouble && ...}`).
- **Respuestas API**: siempre `{ success: true, data }` o `{ success: false, error }`. `api/client.js` desempaqueta `.data`.
- **ErrorBoundary** envuelve toda la app y muestra el stack en pantalla (útil para depurar blank pages en Railway).

---

## 11. Páginas admin pendientes / estado

Construidas y funcionales: Students, Groups, Professors, Assistants, Events, Reports (5 tabs), Payroll, Config (tarifas+semestres), Enrollment, MyPayroll.

Posibles mejoras futuras (no bloqueantes):
- UI para crear cuentas PHYSICAL_TRAINER.
- Filtrado automático de reportes por semestre activo (hoy es manual con from/to).
- Reposiciones grupales (`MakeupClass`) tienen modelo pero poca UI.

---

## 12. Comandos

```bash
# Dev
cd server && npm run dev        # backend :3000
cd client && npm run dev        # frontend :5173 (proxy a :3000)

# BD
cd server && npx prisma db push --schema src/prisma/schema.prisma
cd server && npx prisma format --schema src/prisma/schema.prisma   # validar schema sin DATABASE_URL
cd server && node src/scripts/seed.js          # admin + tarifas default
cd server && node src/scripts/seed-demo.js     # datos de prueba

# Verificación pre-commit
cd server && node --check src/routes/<archivo>.js
cd client && npm run build      # detecta errores de compilación JSX

# Cuentas demo (seed-demo): brayan@/carlos@ (TEACHER), maria@ (ASSISTANT),
# felipe@ (PHYSICAL_TRAINER), padre1@/padre2@ (PARENT) — claves <nombre>123
```

---

## 13. Convenciones de trabajo en este repo

- **Branch:** siempre `claude/ecstatic-goldberg-UpKEn`. Push con `-u origin`. **No** abrir PRs salvo petición explícita (ya existe el #1; los push lo actualizan).
- **Commits:** mensaje descriptivo en español, con cuerpo explicando el *porqué* del cambio. Terminar con los trailers Co-Authored-By y Claude-Session.
- **Idioma:** UI, comentarios de dominio y docs en español. Identificadores de código en inglés/español según el existente (mantener consistencia local).
- **Al cambiar comportamiento del sistema:** actualizar `CLAUDE.md` y **este `SISTEMA.md`** en el mismo commit.
- **Verificar siempre** antes de commit: `node --check` en archivos de servidor tocados + `npm run build` en client.
