# Carpeta de datos de importación

Coloca aquí el Excel de matrícula con el nombre **`matricula.xlsx`** y corre:

```bash
cd server
npm run import:enrollment            # importa data/matricula.xlsx
npm run import:enrollment -- --dry-run   # solo muestra qué haría, sin escribir
# o con una ruta explícita:
node src/scripts/importEnrollment.js /ruta/a/otro.xlsx
```

Requisitos:
- `DATABASE_URL` apuntando a la base (local o la de Railway).
- Las columnas nuevas del modelo (documento, teléfono, acudiente, fecha de
  nacimiento) ya deben existir: se crean solas con `prisma db push` al desplegar,
  o corre `npm run db:push` antes del import.

El script hace **upsert** (actualiza existentes por documento, agrega nuevos, no
borra los que ya no estén). Los archivos `.xlsx` de esta carpeta **no se suben al
repositorio** (contienen datos personales).
