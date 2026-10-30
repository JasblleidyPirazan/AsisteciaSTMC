# Brief de implementación — AsisteciaSTMC

Este documento es la instrucción de trabajo para Claude Code. Complementa a `revision-consistencia-AsisteciaSTMC.md` (diagnóstico). Todo lo que está aquí es decisión tomada; no hay que interpretar.

**Forma de uso:** abrir Claude Code dentro del repositorio, pegar el contenido de la sección 0 y la sección 1 en CLAUDE.md (tarea T1), y luego ejecutar las tareas T2 a T10 una por conversación, en orden, copiando el prompt tal cual. Cada tarea termina con `npm test` en verde en `server/` y `npm run build` en `client/`.

## 0. Decisiones de negocio (cerradas)

| # | Tema | Regla |
|---|---|---|
| D1 | Cancelación OTRA | Causa de la Escuela. Cada estudiante del grupo al que le tocaba ese día gana una reposición (cuenta en `reposicion.otras`). No consume paquete. |
| D2 | Cancelación SIN_ESTUDIANTES | Causa del alumno. Consume una clase a cada estudiante del grupo al que le tocaba ese día (cuenta en `consumidas.ausentes`), sin crear registros: es derivado. No genera reposición. |
| D3 | JUSTIFICADA en FESTIVAL | No consume y no genera reposición. |
| D4 | Ventana del semestre | Una clase o reposición cuenta para el semestre si su fecha está en `[semester.startDate, siguienteSemestre.startDate)`. Si no hay semestre posterior, no hay límite superior. `Semester.endDate` se usa solo para proyecciones ("alcanza antes del cierre"). |
| D5 | Suspensión | Congela el paquete. Entre `suspendedFrom` y `suspendedUntil` (inclusive): una AUSENTE no consume, no se le esperan clases, y lluvia, OTRA, SIN_ESTUDIANTES y festivos de ese período no le aplican. Un PRESENTE sí consume siempre (asistió de verdad). |
| D6 | % de asistencia | `presentes / (presentes + ausentes)`. JUSTIFICADA y N/A fuera del denominador. Es un indicador de comportamiento, no del paquete. |
| D7 | Estado por pago | PREINSCRITO = sin pagos. INSCRITO = pago parcial (0 < pagado < valor del plan). MATRICULADO = pagado ≥ valor del plan. La asistencia no cambia el estado. GRADUADO, SUSPENDIDO, PRUEBA e INACTIVO se mantienen con su prioridad actual. |
| D8 | Alertas individuales | Se eliminan (`/alerts/attendance`, `services/attendanceAlerts.js`, pestaña "Individuales"). Las reemplaza la pantalla del ledger. |
| D9 | Días que toma el estudiante | Se registran en la matrícula: `StudentEnrollment.weekdays`. N/A deja de ser la fuente; queda como excepción puntual. |
| D10 | Quién entra al Cumplimiento | Todo estudiante activo, no de prueba, con paquete > 0, sin importar su estado de pago. |

**Reglas que no cambian y se mantienen tal como están:** la falta sin justificar consume la clase; N/A no cuenta para nada; festivos y recesos no se reponen (se reprograma el calendario); una reposición doble vale 2; las faltas solo cuentan desde `classesStartDate`.

## 1. Especificación del ledger (`server/src/services/studentLedger.js`)

### 1.1 Entradas de la función pura `buildLedger(input)`

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

### 1.2 Predicados internos (una sola definición cada uno)

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

### 1.3 Campos de salida y fórmula de cada uno

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
- `items` = lista de origen `{ type: 'RAIN'|'OTHER'|'JUSTIFIED', date, groupCode }` y `repuestasItems` = `{ date, label, units, absent }` (igual al formato actual de `computeMakeupDebt`)

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

### 1.4 Cargador `loadLedgers({ studentIds?, groupIds?, semester })`

Una sola pasada: estudiantes activos con `enrollments.group`, registros con sesión dentro de la ventana, sesiones REGULAR de sus grupos en la ventana, participaciones PROGRAMADA, exclusiones, semestres (para calcular `window.to`), sumas de pago y tarifas (`getTuitionConfig`). Devuelve `{ semester, window, ledgers: [...] }`. Sin semestre activo devuelve `ledgers: []`.

### 1.5 Endpoints nuevos

| Método y ruta | Roles | Devuelve |
|---|---|---|
| `GET /api/ledger` | ADMIN, SUPERADMIN, PHYSICAL_TRAINER, RECEPTION | `{ semester, summary, ledgers }` con filtros `groupId`, `semaforo`, `q` |
| `GET /api/ledger/:studentId` | los anteriores + TEACHER (solo sus grupos) + PARENT (solo su hijo) | un ledger |
| `GET /api/ledger/groups` | ADMIN, SUPERADMIN, PHYSICAL_TRAINER | por grupo: plan, dadas, festivos, lluvia, fin estimado, y agregados de sus estudiantes (`deficit`, `porAgendar`, `sinConsolidar`) |

`summary` = sumas de `paquete.total`, `consumidas.total` (topadas en el paquete), `pendientes.*` y conteo por semáforo, sobre estudiantes con `paquete.total > 0` (D10). RECEPTION y TEACHER reciben el ledger sin `tuition`.

## 2. Cambios de esquema

**Migración 1:** `student_enrollments.weekdays` (D9)

```sql
ALTER TABLE "student_enrollments" ADD COLUMN "weekdays" INTEGER[];
```

`null` = todos los días del grupo. Valores 0 (domingo) a 6 (sábado). Se edita en la ficha del estudiante (botón "Grupos") y se acepta en `POST /students`, `POST /students/:id/transfer`, `POST /students/:id/enrollments` y en la importación de estudiantes (columna "Días").

Sin cambios: `CancellationCategory` (OTRA y SIN_ESTUDIANTES ya existen; el efecto es derivado), `Semester` (la ventana se calcula con el siguiente semestre).

**Migración 2 (última tarea, con respaldo previo):** eliminar `makeup_classes`, `makeup_enrollments`, `events`, `students.payment_complete`, `groups.class_units` y el valor `CANCELADA_MITAD` solo si no hay filas que lo usen.

## 3. Casos de prueba (fixtures para `tests/unit/studentLedger.test.js`)

Semestre: 2026-08-01 a 2026-11-30; siguiente semestre empieza 2027-02-01 (ventana hasta esa fecha). Hoy: 2026-10-15. Exclusión: lunes 2026-10-12.

**Caso A — Aria (caso completo)**
40 adquiridas, 0 previas, inicio de clases 2026-08-03. Grupo G1 lunes y miércoles, `weekdays` nulo, inscrita 2026-08-01.
Registros en G1: 12 PRESENTE, 3 AUSENTE, 2 JUSTIFICADA, 1 NO_APLICA.
Sesiones de G1: 1 CANCELADA·LLUVIA (2026-09-02), 1 CANCELADA·OTRA (2026-09-09), 1 CANCELADA·SIN_ESTUDIANTES (2026-09-16), 1 sesión PROGRAMADA en 2026-10-14 con un solo reporte (sin consolidar).
1 reposición MAKEUP PRESENTE (2026-09-26, units 1). 1 participación PROGRAMADA (2026-10-17, units 1).
Fechas restantes `isMine` hasta el 30 de noviembre desde el 15 de octubre: 13 (lunes y miércoles, sin el festivo).
Esperado:
- consumidas: presentes 12, ausentes 4 (3 + SIN_ESTUDIANTES), reposicionesVistas 1, total 17, excedente 0
- noConsumen: justificadas 2, na 1
- reposicion: lluvia 1, otras 1, justificadas 2, derecho 4, repuestas 1, pendientes 3, agendadas 1, porAgendar 2
- calendario: festivos 1, recuperables 1
- pendientes: total 23, cubreCalendario 13, agendadasAplicadas 1, porAgendar 2, deficit 7 (13+1+2+7 = 23)
- sinConsolidar: clases 1
- asistencia: presentes 13, faltas 3, tasa 81
- semaforo: ROJO

**Caso B — reposición doble perdida**
10 adquiridas; 4 PRESENTE regulares; 1 AUSENTE en sesión MAKEUP con `effectiveUnits` 2; derecho previo: 2 lluvias. Esperado: `consumidas.total` 6, `reposicion.repuestas` 2, `reposicion.pendientes` 0.

**Caso C — justificada en reposición por invitación**
Derecho previo: 1 lluvia. Registro JUSTIFICADA con `attendanceType` REPOSICION en sesión REGULAR de otro grupo. Esperado: `reposicion.justificadas` 0, `derecho` 1, `repuestas` 0, `pendientes` 1, `noConsumen.justificadas` 1.

**Caso D — clase después del cierre**
Registro PRESENTE el 2026-12-07 (después de `endDate`, antes del siguiente semestre). Esperado: cuenta en `consumidas.presentes`. Un registro el 2027-02-03 no cuenta.

**Caso E — suspensión**
Suspendida del 2026-09-07 al 2026-09-20. En ese rango: 1 AUSENTE, 1 lluvia, 1 festivo en su día, 1 PRESENTE. Esperado: `consumidas.ausentes` 0, `reposicion.lluvia` 0, `calendario.festivos` 0, `consumidas.presentes` 1.

**Caso F — festival**
1 AUSENTE en FESTIVAL, 1 JUSTIFICADA en FESTIVAL. Esperado: `consumidas.ausentes` 1, `reposicion.justificadas` 0, `noConsumen.justificadas` 1.

**Caso G — días contratados**
Grupo lunes-miércoles-viernes, `weekdays` [1] (solo lunes). Lluvia en miércoles, festivo en viernes, sesión sin reporte en miércoles. Esperado: `reposicion.lluvia` 0, `calendario.festivos` 0, `sinConsolidar.clases` 0, `pendientes.restantesEnSemestre` cuenta solo lunes.

**Caso H — graduada con excedente**
10 adquiridas; 11 PRESENTE. Esperado: `consumidas.total` 11, `excedente` 1, `pendientes.total` 0, status GRADUADO, `graduadoEl` = fecha del 10.º presente, semaforo GRIS.

**Caso I — sin paquete**
0 adquiridas, 3 PRESENTE. Esperado: `pendientes.total` 0, status no GRADUADO, semaforo ROJO.

**Caso J — estado por pago (D7)**
Mismo estudiante con `expectedTotal` 1 000 000: `totalPaid` 0 → PREINSCRITO; 400 000 → INSCRITO; 1 000 000 → MATRICULADO. Con 5 PRESENTE y `totalPaid` 0 sigue PREINSCRITO.

**Test de contrato (integración, con Prisma mock)**
Para un mismo estudiante, `GET /ledger/:id`, `GET /groups/:id/students`, `GET /students/:id/report`, `GET /reports/student/:id` y `GET /parent/attendance/:id` devuelven el mismo `paquete.total`, `consumidas.total` y `pendientes.total`.

## 4. Prompts por tarea (uno por conversación, en orden)

Cada prompt empieza con esta cabecera común:

> Trabaja en este repositorio. Lee CLAUDE.md y docs/brief-implementacion.md antes de tocar nada. Alcance: solo lo que describe esta tarea; no refactorices nada fuera de ella. Al terminar: `cd server && npm test` y `cd client && npm run build` deben pasar. Actualiza CLAUDE.md si cambias comportamiento. No hagas commit.

**T1 — Documentación y decisiones**
Copia las secciones 0 y 1 de docs/brief-implementacion.md en CLAUDE.md como nueva sección "Reglas de negocio del paquete" y elimina de CLAUDE.md cualquier frase que las contradiga (nota 26 alertas, nota 52 criterio antiguo de reposición, nota 55 "vistas" con doble definición). Elimina SISTEMA.md (está desactualizado: db push, branch obsoleta, roles incompletos) y README.md de la fase Google Sheets; crea un README.md corto que apunte a CLAUDE.md. Elimina las carpetas js/, css/, netlify/ y los archivos index.html y netlify.toml de la raíz: son la versión anterior del sistema y no los usa ningún package.json. No toques server/ ni client/.

**T2 — Días contratados en la matrícula**
Agrega `weekdays INTEGER[]` nullable a `StudentEnrollment` (migración Prisma versionada, sin db push). Acepta `weekdays` (array de 0 a 6) en `POST /students` (para `primaryGroupId` y `secondaryGroupId`), `POST /students/:id/transfer`, `POST /students/:id/enrollments` y en la importación de estudiantes (`services/enrollmentImport.js`, columna "Días" con valores L, M, X, J, V, S, D). Valida que cada día exista en el horario del grupo. En `StudentsPage.jsx`, en el diálogo "Grupos", muestra casillas por día del grupo (todas marcadas = null). Muestra los días en la ficha junto al código del grupo. Tests: validación de días contra el grupo, importación con y sin columna.

**T3 — Ventana del semestre y permisos**
Crea `server/src/lib/semesterWindow.js` con `semesterWindow(semester, allSemesters)` que devuelve `{ from, to }` según la regla D4 (`to` = `startDate` del semestre con fecha de inicio inmediatamente posterior, o null). Crea `server/src/lib/permissions.js` con `canReport(user, session, professorId?)`: SUPERADMIN siempre; PHYSICAL_TRAINER siempre; ADMIN solo MAKEUP y FESTIVAL; TEACHER en REGULAR si es titular del grupo, en MAKEUP si es `makeupProfessorId` o `substituteProfessorId`; nadie más. Reemplaza `canReportGroup`, `canReportMakeup` y `canReportFestival` por esta función. Tests unitarios de ambas (SUPERADMIN debe poder finalizar y cancelar una reposición: hoy recibe 403).

**T4 — Servicio puro studentLedger**
Crea `server/src/services/studentLedger.js` con `buildLedger(input)` exactamente como lo especifica la sección 1 del brief (entradas 1.1, predicados 1.2, campos 1.3). Es una función pura: sin Prisma, sin fechas del sistema (recibe `today`). Implementa `tests/unit/studentLedger.test.js` con los casos A a J de la sección 3 y un test del invariante `pendientes.total === cubreCalendario + agendadasAplicadas + porAgendar + deficit` sobre 200 entradas aleatorias. No conectes todavía ningún endpoint.

**T5 — Cargador y endpoints del ledger**
Agrega `loadLedgers({ studentIds?, groupIds?, semester? })` en `studentLedger.js` (sección 1.4) y la ruta `server/src/routes/ledger.js` con los tres endpoints de la sección 1.5, montada en `index.js` como `/api/ledger`. Usa `semesterWindow` de T3, `getTuitionConfig` y `stripTuition` existentes. Tests de integración con el Prisma mock de `tests/helpers/mockPrisma.js`: roles, filtro de TEACHER a sus grupos, PARENT a su hijo, summary solo con `paquete.total > 0`.

**T6 — Migrar los endpoints existentes al ledger y borrar los motores duplicados**
Haz que estos endpoints obtengan sus cifras de `loadLedgers` y eliminen su cálculo propio, manteniendo la forma de respuesta que el cliente ya consume (agrega campos, no quites los que se usan): `GET /groups/:id/students` (`classesSeen = consumidas.total`, `semesterCompleted` = status GRADUADO), `GET /students/:id/report` (summary desde el ledger; `cancelledRain = reposicion.lluvia`), `GET /students/:id/makeup-debt` (devuelve el ledger completo), `GET /reports/student/:id`, `GET /reports/students-tracking` y su export (quita `countAbsences`; columnas desde el ledger), `GET /parent/attendance/:id`, `GET /parent/children` (`attendanceAlert` pasa a ser `semaforo`), `GET /alerts/coordinator` (summary y listas desde el ledger: `shortfall = deficit > 0`, `makeups = porAgendar ≥ 3`, `nearEnd = pendientes.total ≤ 3`), `GET /alerts/semester-completed`, `GET /makeup-booking/:token` y `/book` (`available = reposicion.porAgendar`), `GET /makeup-booking/admin/overview`. Cambia `attachStudentStatus` para que el estado siga la regla D7 (la asistencia ya no lo cambia) y tome GRADUADO del ledger. Elimina `GET /alerts/attendance`, `services/attendanceAlerts.js`, `services/studentTracking.js`, `computeStudentProgress`, `computeMakeupDebt`, `loadConsumption`, `consumptionFromRecords`, `splitDebt`, `notMyDays` de `semesterProgress.js` y en `attendanceStats.js` deja solo `absenceCounts`, `attendanceUnits`, `consumedUnits`, `roundUnits`. Ajusta o elimina los tests que probaban lo borrado; el test de contrato de la sección 3 debe pasar.

**T7 — Componente único de estado en el cliente**
Crea `client/src/utils/glossary.js` con los textos de la sección 4.6 del documento de revisión y `client/src/utils/semaforo.js` que solo mapea el `semaforo` del servidor a color, etiqueta y acción sugerida. Crea `client/src/components/StudentLedgerCard.jsx` con las variantes `full` y `compact` según la sección 4.1 (ecuación, barra, tres chips que suman "Faltan", aviso de sin consolidar, excedente visible). Úsalo en `StudentsPage.jsx` (ficha, reemplaza los bloques "Clases de reposición" y "Por recuperar por calendario" por las listas `items` del ledger), `StudentQuickPanel.jsx`, `Step3Students.jsx` (compact, junto al nombre), `ParentPortalPage.jsx` y `MakeupBookingPage.jsx`. Elimina `trafficColor`, `vsGroupColor`, `useSemesterCompleted` y `semesterCompleted.jsx`. Todos los textos de ayuda salen del glosario.

**T8 — Pantalla "Reposiciones y reprogramación"**
Crea `client/src/pages/admin/LedgerPage.jsx` en la ruta `/admin/ledger` (ADMIN, SUPERADMIN, PHYSICAL_TRAINER) según la sección 4.3 de la revisión: cabecera con `summary`, chips de filtro por semáforo, tabla en escritorio y tarjetas en móvil ordenadas por `deficit`, luego `porAgendar`, luego `sinConsolidar`; acción por fila según el semáforo (cerrar reportes → `/admin/conflicts` o pendientes del grupo; enviar enlace → reutiliza los botones de WhatsApp y correo de `MakeupBookingAdminPage`; agendar → `/admin/makeups` con el estudiante preseleccionado; extender calendario → `/admin/groups` con el grupo enfocado). Reemplaza en `AdminDashboard.jsx` el `CoordinatorStudentsPanel` por un resumen de 4 cifras con enlace a esta página. Elimina la pestaña "Individuales" de `AlertsPage.jsx`, el bloque "Estudiantes que requieren atención" de `CoordinatorStudentsPanel.jsx` y la pestaña "Enviar enlaces" de `MakeupBookingAdminPage.jsx` (sus botones pasan a `LedgerPage`). Agrega la entrada al menú de gestión.

**T9 — Vista por grupo y línea de tiempo**
Fusiona la pestaña "Calendario" de `AlertsPage.jsx` y `GroupsProgress.jsx` en una sola vista "Reprogramación" (`/admin/reports`, pestaña "Grupos") alimentada por `GET /ledger/groups`: por grupo, plan, dadas, festivos con fecha y motivo, lluvia, fin planeado y fin estimado, y cuántos estudiantes del grupo quedan con `deficit > 0` con ese fin; botón "Proponer extensión" que muestra la fecha estimada y la lista de afectados. En la ficha del estudiante (`StudentsPage.jsx`) convierte el historial en la línea de tiempo de la sección 4.5: cada fila con su efecto (Consume, Derecho a reposición, Reprogramada, No cuenta, Sin consolidar) y el contador acumulado consumidas/pagadas. El efecto de cada fila lo calcula el servidor: agrega a `GET /ledger/:studentId` un arreglo `timeline` con `{ date, label, status, effect, units, running }`.

**T10 — Limpieza final**
Elimina `CostSummary.jsx` como espejo del motor de costos: crea `POST /sessions/preview-cost` que recibe `{ presentCount, effectiveUnits, assistantId }` y devuelve el cálculo con `getBracketRate`; `Step4Summary.jsx` lo consume. Elimina del cliente todo uso de `countAbsences`. Mueve `SLOT_TEMPLATES`, `SLOT_CAPACITY`, `HORIZON_DAYS`, `BOOK_CUTOFF_HOURS` y `CANCEL_CUTOFF_HOURS` a `SystemConfig` (claves `makeup_slots` en JSON y las demás numéricas) con edición en `ConfigPage.jsx`; el mensaje de WhatsApp en `MakeupBookingAdminPage` se arma desde esa configuración. Genera una migración que elimine `makeup_classes`, `makeup_enrollments`, `events`, `students.payment_complete` y `groups.class_units`, precedida de un script `src/scripts/export-legacy.js` que exporte esas tablas a JSON. Elimina `EventsPage.jsx`, `routes/events.js` y sus rutas. Actualiza CLAUDE.md.

## 5. Criterio de "terminado" global

1. `npm test` en `server/` pasa, incluidos `studentLedger.test.js` (casos A–J, invariante) y el test de contrato.
2. Para cualquier estudiante, todas las pantallas muestran el mismo pagadas, vistas y faltan.
3. En `/admin/ledger`, la suma de los tres chips de cada fila es igual a "Faltan".
4. Un SUPERADMIN puede reportar y cancelar una reposición.
5. Una clase dictada después de `endDate` y antes del siguiente semestre aparece en la ficha y baja "Faltan".
6. No quedan en el repositorio `js/`, `css/`, `netlify/`, `SISTEMA.md`, `attendanceAlerts.js`, `studentTracking.js` ni el toggle "Las faltas consumen clase".
