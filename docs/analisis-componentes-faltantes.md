# Análisis de arquitectura — Componentes faltantes

**Fecha:** 2026-07-12
**Alcance:** comparación entre lo documentado (CLAUDE.md, SISTEMA.md), el código real en `client/` y `server/`, y buenas prácticas para un sistema en producción que maneja dinero (liquidaciones) y datos de menores.

## Hallazgo previo: la documentación está desactualizada

La sección "Páginas Admin Pendientes de Construir" de CLAUDE.md ya no aplica: `GroupsPage.jsx`, `ProfessorsPage.jsx`, `AssistantsPage.jsx`, `EventsPage.jsx` y `ReportsPage.jsx` **ya existen y están implementadas** (entre 150 y 428 líneas cada una, con rutas registradas en `App.jsx`). El branch de trabajo referenciado (`claude/ecstatic-goldberg-UpKEn`) tampoco es el actual. Los vacíos reales del sistema están en infraestructura, flujos de recuperación y robustez, no en páginas.

Los componentes se listan en orden de prioridad.

---

## 1. Migraciones versionadas de Prisma (CRÍTICO — riesgo de pérdida de datos)

**Uso principal:** hoy `server/start.sh` ejecuta en cada deploy `prisma db push --accept-data-loss`. Ese flag autoriza a Prisma a **borrar columnas o tablas en producción sin confirmación** si el schema cambió de forma incompatible. Con datos reales de liquidaciones y asistencia, un rename de columna mal hecho destruye historial. Las migraciones versionadas (`prisma migrate`) aplican cambios de forma controlada, auditable y reversible.

**Esquema de archivos:**
```
server/src/prisma/
├── schema.prisma              (existe)
└── migrations/                (NUEVO)
    ├── 0_init/migration.sql   (baseline generada desde el schema actual)
    └── migration_lock.toml
server/start.sh                (MODIFICAR: db push → prisma migrate deploy)
server/package.json            (el script db:migrate ya existe pero hoy fallaría: no hay carpeta migrations)
```

**Indicación para otra sesión:**
> "Migra el proyecto de `prisma db push` a Prisma Migrate: genera la migración baseline desde el schema actual con `prisma migrate diff --from-empty --to-schema-datamodel`, márcala como aplicada en la BD de producción con `prisma migrate resolve --applied`, cambia `start.sh` para usar `prisma migrate deploy` (sin `--accept-data-loss`), y documenta en CLAUDE.md el flujo para futuros cambios de schema (`prisma migrate dev` en local → commit de la migración → deploy)."

---

## 2. Suite de pruebas automatizadas (CRÍTICO — el motor de dinero no tiene tests)

**Uso principal:** no existe ni un solo test en el repositorio (sin framework, sin script `test`). La lógica más delicada del sistema es pura y perfectamente testeable: tramos de `costEngine.js` (`getBracketRate`), `getPeriodForDate` (quincenas), pago de festivales, `payStatus` (PAYABLE / SUSPENDED_LATE / PENDING_MATCH), triple coincidencia de asistentes, `studentStatus` derivado, `services/schedule.js` (fechas esperadas con exclusiones) y `attendanceStats.js` (P y A cuentan, J no). Un error ahí significa pagarle mal a alguien.

**Esquema de archivos:**
```
server/
├── tests/
│   ├── costEngine.test.js         (tramos, effectiveUnits, festivales, asistente)
│   ├── periods.test.js            (getPeriodForDate, getCurrentPeriod, zona America/Bogota)
│   ├── schedule.test.js           (calendario esperado, exclusiones, enrolledAt)
│   ├── attendanceStats.test.js
│   └── routes/                    (fase 2: integración con supertest + BD de prueba)
│       ├── auth.test.js
│       └── sessions.test.js       (guards canReportGroup por rol)
└── package.json                   (agregar vitest o node:test + script "test")
```

**Indicación para otra sesión:**
> "Agrega una suite de tests al backend con vitest. Fase 1: tests unitarios de las funciones puras de `services/costEngine.js`, `lib/dates.js`, `services/schedule.js` y `services/attendanceStats.js`, cubriendo los tramos de tarifas, reposiciones con effectiveUnits, festivales, quincenas y las reglas de clases vistas. Fase 2: tests de integración de rutas con supertest contra una base PostgreSQL de prueba, priorizando los guards de autorización por rol de `sessions.js` y `reports.js`. No modifiques lógica de producción; si un test revela un bug, repórtalo antes de corregirlo."

---

## 3. Recuperación y gestión de contraseñas de padres (ALTO — usuarios quedan bloqueados)

**Uso principal:** no existe "olvidé mi contraseña" (`auth.js` solo tiene login, me, accept-policies y cambio de contraseña autenticado) y la UI de admin no puede restablecer la clave de un PARENT: `/admin/users` gestiona solo roles de staff (`STAFF_ROLES` en `users.js`), y profesores/asistentes tienen su gestión propia. Un padre que olvida su contraseña hoy solo se recupera editando la BD por SQL.

**Esquema de archivos (mínimo viable, sin email):**
```
server/src/routes/users.js         (MODIFICAR: sección de padres — listar PARENT y
                                    endpoint de reset de contraseña por ADMIN)
client/src/pages/admin/UsersPage.jsx  (MODIFICAR: pestaña "Padres" con botón
                                       "Restablecer contraseña")
```
**Esquema adicional si se decide autoservicio por email:**
```
server/src/prisma/schema.prisma    (nuevo modelo PasswordResetToken)
server/src/routes/auth.js          (POST /forgot-password, POST /reset-password)
server/src/services/mailer.js      (ver componente 4)
client/src/pages/ForgotPasswordPage.jsx
```

**Indicación para otra sesión:**
> "Permite al ADMIN restablecer la contraseña de cualquier usuario PARENT desde `/admin/users`: agrega una pestaña de padres en UsersPage y un endpoint en `users.js` que acepte nueva contraseña (bcrypt, mín. 8 caracteres), sin tocar los roles de staff existentes. [Si hay proveedor de email definido: agrega además flujo de autoservicio con token de un solo uso y expiración de 1 hora.]"

**Pregunta abierta:** ¿basta con reset manual por el admin (te llaman por WhatsApp y tú la restableces), o quieres autoservicio por email? Lo segundo requiere decidir el proveedor (componente 4).

---

## 4. Servicio de notificaciones por email (ALTO — depende de decisión tuya)

**Uso principal:** al aprobar una inscripción se crea la cuenta del padre con una contraseña que el admin digita, pero **nadie se la comunica automáticamente**; las alertas de lluvia y de asistencia son solo in-app; los reportes tardíos solo se ven si el admin entra al dashboard. Un servicio de email centralizado cubre: credenciales de bienvenida al aprobar inscripción, aviso de rechazo, restablecimiento de contraseña, y (opcional) resumen de alertas al admin.

**Esquema de archivos:**
```
server/src/services/mailer.js      (NUEVO: wrapper del proveedor + cola simple con reintentos)
server/src/services/emailTemplates/ (NUEVO: bienvenida, reset, alerta)
server/src/routes/enrollment.js    (MODIFICAR: enviar email en approve/reject, sin
                                    bloquear la respuesta si el envío falla)
.env.example                       (MODIFICAR: SMTP_HOST/RESEND_API_KEY según proveedor)
```

**Indicación para otra sesión:**
> "Implementa `server/src/services/mailer.js` con [proveedor elegido], con envío no bloqueante (si el email falla, la operación de negocio no se revierte; se registra el error). Conéctalo al approve de inscripciones para enviar las credenciales iniciales al padre, y al flujo de reset de contraseña si existe. Variables de entorno documentadas en `.env.example` y en CLAUDE.md."

**Preguntas abiertas (necesarias antes de desarrollar):** ¿qué proveedor de email quieres usar (Resend, SendGrid, SMTP de Gmail…)? ¿Qué eventos deben notificarse? ¿O la comunicación con padres seguirá siendo por WhatsApp manual y este componente se descarta?

---

## 5. Exportes en ReportsPage (MEDIO — prometido y no implementado)

**Uso principal:** CLAUDE.md promete "ReportsPage — Reportes exportables PDF/Excel", pero el único export real del sistema es el de nómina (`GET /payroll/export`). `ReportsPage.jsx` (428 líneas) muestra reportes en pantalla sin botón de descarga y `reports.js` no tiene endpoints de export. La dependencia `xlsx` ya está instalada y el patrón de descarga por blob ya existe en PayrollPage — es reutilización directa.

**Esquema de archivos:**
```
server/src/routes/reports.js               (MODIFICAR: GET /reports/group/:id/export,
                                            /reports/student/:id/export, etc. → .xlsx)
client/src/pages/admin/ReportsPage.jsx     (MODIFICAR: botón "Descargar Excel" reusando
                                            el patrón fetch+blob de PayrollPage.jsx)
```

**Indicación para otra sesión:**
> "Agrega export a Excel en los reportes: endpoints `/export` en `reports.js` que generen .xlsx con la misma data que ya devuelven los reportes de grupo, estudiante, profesor y asistente (respetando la autorización por rol existente, incluyendo que PF no ve montos), y botones de descarga en ReportsPage siguiendo el patrón de blob de PayrollPage."

**Pregunta abierta:** ¿PDF es realmente necesario o basta Excel? PDF agrega una dependencia pesada (puppeteer/pdfkit); Excel sale casi gratis con lo que ya hay.

---

## 6. Filtro automático por semestre activo en reportes (MEDIO)

**Uso principal:** la nota 11 de CLAUDE.md lo reconoce: los reportes no filtran por semestre automáticamente; hay que pasar `from`/`to` a mano. El resto del sistema (clases vistas, alertas de asistencia) ya gira alrededor del semestre activo — los reportes son la pieza inconsistente: mezclan datos de semestres distintos por defecto.

**Esquema de archivos:**
```
server/src/routes/reports.js               (MODIFICAR: default from/to = fechas del
                                            semestre activo cuando no se pasan)
client/src/pages/admin/ReportsPage.jsx     (MODIFICAR: selector de semestre que
                                            traduce a from/to; default = activo)
```

**Indicación para otra sesión:**
> "Haz que los reportes de `reports.js` usen por defecto el rango del semestre activo cuando no se pasan `from`/`to` (helper compartido que consulte `Semester.active`), y agrega en ReportsPage un selector de semestre (lista de `GET /semesters`) que alimente esos parámetros. Mantén el override manual de fechas."

---

## 7. Robustecimiento del modo offline (MEDIO — cobertura parcial y cola frágil)

**Uso principal:** el modo offline actual solo cubre un caso: el `finalize` de una sesión **que ya fue creada online** (`AttendanceFlow/index.jsx:116`). Si el profesor abre el flujo sin conexión, el `POST /sessions` inicial falla y no puede ni empezar. Además la cola de `useOffline.jsx` tiene dos defectos: un item rechazado por validación (HTTP 400) se reintenta para siempre (el catch no distingue error de red de error definitivo), y no hay UI para ver o descartar pendientes — `OfflineBanner` solo avisa que no hay conexión.

**Esquema de archivos:**
```
client/src/hooks/useOffline.jsx            (MODIFICAR: cola de operaciones completas
                                            {crear sesión + finalize}, distinguir
                                            errores 4xx (descartar/marcar) de errores
                                            de red (reintentar))
client/src/pages/AttendanceFlow/index.jsx  (MODIFICAR: permitir completar el flujo
                                            entero offline, con datos del grupo cacheados)
client/src/components/OfflineBanner.jsx    (MODIFICAR: contador de reportes pendientes,
                                            lista y opción de descartar)
```

**Indicación para otra sesión:**
> "Robustece el modo offline: (1) permite completar el flujo de asistencia sin conexión encolando la operación completa (crear sesión + finalize) en localStorage, cacheando el roster del grupo; (2) en el sync, distingue errores de red (reintentar) de errores 4xx (marcar como fallido y no reintentar); (3) muestra en OfflineBanner cuántos reportes están pendientes de sincronizar, con detalle y opción de descartar. Ten en cuenta el UNIQUE(groupId, date) del backend para que un reencolado no duplique sesiones."

---

## 8. Integración continua — GitHub Actions (MEDIO)

**Uso principal:** no existe `.github/` — nada valida un PR antes de merge, y Railway despliega directo del branch. Un workflow mínimo que compile el cliente, valide el schema de Prisma y corra lint/tests evita romper producción con un push.

**Esquema de archivos:**
```
.github/workflows/ci.yml    (NUEVO: npm ci en client y server, prisma validate,
                             build de Vite, lint y test cuando existan)
```

**Indicación para otra sesión:**
> "Crea `.github/workflows/ci.yml` que en cada push/PR instale dependencias de client y server, ejecute `prisma validate` y `prisma generate`, compile el cliente con Vite, y corra `npm test` y lint si existen los scripts. Node 20. Sin deploy — Railway ya se encarga."

---

## 9. ESLint + Prettier (BAJO)

**Uso principal:** no hay ninguna configuración de lint ni formato en client ni server. En un proyecto mantenido por sesiones de IA sucesivas, el lint es la única barrera automática contra imports muertos, variables sin usar y estilos divergentes.

**Esquema de archivos:**
```
eslint.config.js            (NUEVO en raíz: flat config con overrides para
                             client (react, jsx) y server (node))
.prettierrc                 (NUEVO)
client/package.json         (script lint)
server/package.json         (script lint)
```

**Indicación para otra sesión:**
> "Configura ESLint (flat config) y Prettier para todo el monorepo: reglas react/react-hooks para `client/`, entorno node para `server/`, ignorando `js/`, `netlify/` y builds. Corre el lint, corrige solo problemas mecánicos (imports sin usar, etc.) sin cambiar lógica, y agrega los scripts `lint` a ambos package.json."

---

## 10. Validación de entrada centralizada (BAJO-MEDIO)

**Uso principal:** la validación actual es manual y dispersa (if por campo en cada ruta, con criterios que varían entre archivos). Un middleware de validación con schemas (zod) da mensajes de error consistentes, tipos coercionados (fechas, números) y una sola fuente de verdad por endpoint. No es urgente porque la validación manual existente es razonable, pero cada endpoint nuevo la degrada.

**Esquema de archivos:**
```
server/src/middleware/validate.js   (NUEVO: validate(schema) → 400 con detalle)
server/src/schemas/                 (NUEVO: sessions.js, students.js, enrollment.js…)
server/src/routes/*.js              (MODIFICAR gradualmente: adoptar en endpoints
                                     nuevos y en los de mayor riesgo primero)
```

**Indicación para otra sesión:**
> "Introduce zod en el backend con un middleware `validate(schema)` y migra primero los endpoints que escriben dinero o asistencia (`sessions.js` finalize/cancel, `makeups.js`, `payroll.js` unlock). Replica exactamente las reglas actuales (whitelists de estados, longitudes máximas) para no cambiar comportamiento; el resto de rutas se migra de forma incremental."

---

## 11. Logging estructurado (BAJO)

**Uso principal:** el servidor no registra requests ni errores de forma estructurada (solo el errorHandler y console). En Railway, cuando algo falle en producción (un pago mal calculado, un 500 intermitente) no habrá rastro para diagnosticar. pino + pino-http dan logs JSON con request id, ruta, usuario y latencia, filtrables en los logs de Railway.

**Esquema de archivos:**
```
server/src/lib/logger.js            (NUEVO: pino, nivel por NODE_ENV)
server/src/index.js                 (MODIFICAR: pino-http, redactando Authorization)
server/src/middleware/errorHandler.js (MODIFICAR: loggear el error completo
                                       server-side aunque al cliente vaya genérico)
```

**Indicación para otra sesión:**
> "Agrega logging estructurado con pino: request logging vía pino-http (redactando headers sensibles y sin loggear bodies con contraseñas), logger disponible para servicios, y errorHandler que registre stack completo server-side. Nivel `info` en producción, `debug` en desarrollo."

---

## 12. Limpieza del código legacy v1 y actualización de documentación (BAJO, alto valor de higiene)

**Uso principal:** conviven en el repo dos sistemas: la v2 actual (`client/` + `server/`) y la v1 completa de Netlify + Google Sheets (`js/` con ~20 archivos, `css/`, `netlify/functions/sheets-proxy.js`, `index.html` en la raíz, `netlify.toml`, `docs/base-de-datos.md`, README y SISTEMA.md describiendo la arquitectura vieja). Confunde a cualquier sesión futura y a cualquier búsqueda de código. Además CLAUDE.md tiene secciones obsoletas (páginas "pendientes" ya construidas, branch de trabajo viejo).

**Esquema de archivos:**
```
ELIMINAR (previa confirmación): js/, css/, netlify/, index.html, netlify.toml,
                                docs/base-de-datos.md
ACTUALIZAR: README.md (describir la v2), CLAUDE.md (quitar sección de páginas
            pendientes, actualizar branch), SISTEMA.md (revisar o eliminar)
```

**Indicación para otra sesión:**
> "Elimina el código legacy de la v1 (Netlify + Google Sheets): carpetas `js/`, `css/`, `netlify/`, el `index.html` raíz, `netlify.toml` y docs de la arquitectura vieja. Reescribe README.md para la v2 (stack, cómo correr local, deploy Railway) y actualiza CLAUDE.md: elimina la sección 'Páginas Admin Pendientes de Construir' (ya existen todas) y corrige el branch de trabajo."

**Pregunta abierta:** ¿confirmas que la versión de Netlify + Google Sheets ya no está en uso y se puede eliminar del repositorio? (Queda en el historial de git de todos modos.)

---

## 13. Estrategia de backups de la base de datos (operativo, no código)

**Uso principal:** no hay evidencia de estrategia de respaldo más allá de lo que Railway provea por defecto. El sistema es la fuente única de verdad de asistencia y pagos; perder la BD significa perder el historial de liquidaciones.

**Indicación para otra sesión:**
> "Verifica y documenta la estrategia de backups del PostgreSQL de Railway: confirma si el plan actual incluye backups automáticos y su retención; agrega un script documentado de `pg_dump` para respaldos manuales antes de cada migración de schema, y documenta el procedimiento de restore probado en CLAUDE.md."

---

## Resumen de prioridades

| # | Componente | Prioridad | Bloqueado por decisión tuya |
|---|---|---|---|
| 1 | Migraciones Prisma (quitar `--accept-data-loss`) | Crítica | No |
| 2 | Tests del motor de costos y quincenas | Crítica | No |
| 3 | Reset de contraseña de padres | Alta | Parcial (¿con o sin email?) |
| 4 | Servicio de email | Alta | Sí (proveedor y eventos) |
| 5 | Export Excel en reportes | Media | Parcial (¿PDF sí o no?) |
| 6 | Filtro por semestre activo en reportes | Media | No |
| 7 | Offline robusto | Media | No |
| 8 | CI (GitHub Actions) | Media | No |
| 9 | ESLint + Prettier | Baja | No |
| 10 | Validación centralizada (zod) | Baja-media | No |
| 11 | Logging estructurado (pino) | Baja | No |
| 12 | Limpieza legacy v1 + docs | Baja | Sí (confirmar borrado) |
| 13 | Backups de BD | Operativa | No |

## Preguntas pendientes de respuesta antes de desarrollar

1. **Email:** ¿quieres notificaciones automáticas por correo (credenciales al aprobar inscripción, reset de contraseña)? Si sí, ¿qué proveedor (Resend, SendGrid, SMTP de Gmail)? Si la comunicación seguirá siendo por WhatsApp manual, los componentes 3 y 5 se simplifican y el 4 se descarta.
2. **Contraseñas de padres:** ¿basta que el ADMIN pueda restablecerlas desde la UI, o necesitas autoservicio ("olvidé mi contraseña")?
3. **Reportes:** ¿el export en PDF es un requisito real o basta Excel?
4. **Legacy:** ¿confirmas que la v1 de Netlify + Google Sheets ya no se usa y puede eliminarse del repo?
