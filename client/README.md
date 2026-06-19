# Frontend — Sistema de Asistencia de Tenis (MVP v2)

Cliente **React + Vite**, diseñado mobile-first (pantallas ~380px), que consume
el backend en `/api/*`.

## Desarrollo

```bash
cd client
npm install
npm run dev        # http://localhost:5173 (proxy /api -> http://localhost:3000)
```

Con el backend corriendo en otro puerto, define `VITE_API_TARGET`.

## Producción

```bash
npm run build      # genera client/dist
```

El backend Express sirve `client/dist` automáticamente cuando existe (servicio
único en Railway). También puedes apuntar `CLIENT_DIST` a otra ruta.

## Pantallas y Historias de Usuario

| Pantalla | Ruta | HU |
|----------|------|----|
| Inscripción pública | `/enrollment` | HU-INS-01 |
| Login | `/login` | — |
| Grupos del día (dashboard) | `/` | HU-GRP-02 |
| Flujo de asistencia (5 pantallas) | `/attendance/:groupId` | HU-AST-01..06 |
| Flujo del asistente | `/assistant` | HU-AST-08 |
| Mi liquidación | `/my-settlement` | HU-LIQ-02 |
| Admin · Inscripciones | `/admin/enrollments` | HU-INS-02 |
| Admin · Grupos | `/admin/groups` | HU-GRP-01 |
| Admin · Usuarios | `/admin/users` | — |
| Admin · Liquidación | `/admin/settlement` | HU-LIQ-01 |
| Admin · Reportes | `/admin/reports` | HU-ADM-02 |
| Admin · Tarifas | `/admin/settings` | HU-ADM-01 |

El modo offline (HU-AST-07) cachea el contexto de la clase y encola los reportes
en `localStorage`, reenviándolos al recuperar conexión.
