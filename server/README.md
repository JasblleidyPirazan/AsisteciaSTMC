# Backend — Sistema de Asistencia de Tenis (MVP v2)

Backend del sistema según el documento de especificación v2: **Node.js + Express + PostgreSQL + Prisma**, desplegable en **Railway**.

## Requisitos

- Node.js >= 20
- PostgreSQL (local o el servicio gestionado de Railway)

## Puesta en marcha

```bash
cd server
cp .env.example .env        # ajusta DATABASE_URL y JWT_SECRET
npm install
npm run prisma:generate
npm run prisma:migrate      # crea las tablas (desarrollo)
npm run seed                # crea el admin inicial y las tarifas base
npm run dev                 # arranca en http://localhost:3000
```

En producción (Railway):

```bash
npm run prisma:deploy       # aplica migraciones
npm run seed
npm start
```

## Estructura

```
server/
├── prisma/
│   ├── schema.prisma       # Modelo de datos (users, groups, sessions, attendance, cost_records, ...)
│   └── seed.js             # Admin inicial + tarifas base
└── src/
    ├── config/env.js       # Variables de entorno
    ├── lib/                # prisma client, errores, helpers
    ├── middleware/         # auth (JWT + roles), validación (zod), errores
    ├── services/
    │   └── costEngine.js   # Motor de costos (sección 3 del documento)
    ├── utils/group.js      # Lógica de días, duración y unidades de clase
    ├── controllers/        # Lógica por módulo
    ├── routes/             # Endpoints REST bajo /api/*
    └── app.js / server.js  # Ensamblado y arranque
```

## Motor de costos

Al **enviar** una sesión (`POST /api/sessions/submit`) se calculan automáticamente
los `cost_records`:

- **Profesor:** `presentes × tarifa_estudiante × unidades_efectivas`.
- **Reposición grupal** (3+ estudiantes de reposición): `estudiantes × tarifa_reposición`.
- **Asistente:** `tarifa_fija × unidades_efectivas`.

Las clases **canceladas** no generan pago. Las **dobles canceladas a la mitad**
usan `unidades_efectivas = 1.0`.

## Mapa de Historias de Usuario → Endpoints

| HU | Endpoint |
|----|----------|
| HU-INS-01 | `POST /api/enrollment` (público) |
| HU-INS-02 | `GET/POST /api/enrollment/:id/approve|reject` |
| HU-GRP-01 | `POST /api/groups` |
| HU-GRP-02 | `GET /api/groups/today` |
| HU-AST-01..06 | `GET /api/sessions/context/:groupId`, `POST /api/sessions/preview`, `POST /api/sessions/submit` |
| HU-AST-07 | Offline: soportado en el cliente; el submit es idempotente por (grupo, fecha) |
| HU-AST-08 | `GET /api/sessions/assistant/today`, `POST /api/sessions/assistant/accompany` |
| HU-LIQ-01 | `GET /api/settlements/:period` |
| HU-LIQ-02 | `GET /api/settlements/me/:period` |
| HU-ADM-01 | `GET/PUT /api/admin/settings` |
| HU-ADM-02 | `GET /api/admin/reports/:period` |
