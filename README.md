# AsisteciaSTMC

Sistema de asistencia, costos y liquidación de la academia de tenis Santa María (STMC).
React + Vite (cliente) · Node + Express + Prisma · PostgreSQL · Railway.

**Toda la documentación vive en [`CLAUDE.md`](./CLAUDE.md):** stack, estructura, modelos, endpoints, roles, flujo de migraciones, despliegue, reglas de negocio ("Reglas de negocio del paquete") y notas técnicas.

- Diccionario de datos: [`docs/database-dictionary.md`](./docs/database-dictionary.md) (generado con `cd server && npm run docs:dictionary`).
- Plan de implementación en curso: [`docs/brief-implementacion.md`](./docs/brief-implementacion.md).

```bash
cd server && npm run dev     # backend en :3000
cd client && npm run dev     # frontend en :5173
cd server && npm test        # pruebas (no requieren base de datos)
```
