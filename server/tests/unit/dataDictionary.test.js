import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { TABLES, ENUMS } = require('../../src/services/dataDictionary.js');

// El diccionario se escribe a mano (en inglés, con la semántica de negocio que
// el schema no puede expresar), así que este test es el guardián contra la
// deriva: parsea schema.prisma y exige que cada modelo, columna y enum esté
// documentado — y que no sobre nada.
const schemaPath = path.join(__dirname, '../../src/prisma/schema.prisma');
const schema = fs
  .readFileSync(schemaPath, 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

const SCALARS = /^(String|Int|Boolean|DateTime|Decimal|Json|Float|BigInt|Bytes)$/;
const enumNames = [...schema.matchAll(/enum\s+(\w+)\s*\{/g)].map((m) => m[1]);

function parseModels() {
  const models = [];
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(schema))) {
    const [, name, body] = m;
    const table = (body.match(/@@map\("([^"]+)"\)/) || [])[1] || name;
    const fields = [];
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('@@')) continue;
      const f = line.match(/^(\w+)\s+([\w[\]?]+)/);
      if (!f) continue;
      const [, field, type] = f;
      const base = type.replace(/[[\]?]/g, '');
      const isList = type.endsWith('[]');
      const isEnum = enumNames.includes(base);
      // Solo columnas: escalares y enums no-lista. Las relaciones se documentan aparte.
      if (isList || (!SCALARS.test(base) && !isEnum)) continue;
      const column = (line.match(/@map\("([^"]+)"\)/) || [])[1] || field;
      fields.push({ field, column, optional: type.includes('?') });
    }
    models.push({ name, table, fields });
  }
  return models;
}

const models = parseModels();

describe('data dictionary — cobertura del schema', () => {
  it('documenta todos los modelos, sin sobrar ninguno', () => {
    const documented = TABLES.map((t) => t.model).sort();
    expect(documented).toEqual(models.map((m) => m.name).sort());
  });

  it('cada tabla apunta al @@map real y a un delegate de Prisma válido', () => {
    for (const m of models) {
      const t = TABLES.find((x) => x.model === m.name);
      expect(t.table, `tabla física de ${m.name}`).toBe(m.table);
      // delegate = nombre del modelo en lowerCamelCase (convención de Prisma Client)
      expect(t.delegate, `delegate de ${m.name}`).toBe(m.name[0].toLowerCase() + m.name.slice(1));
    }
  });

  it('documenta cada columna con su nombre SQL y su nulabilidad', () => {
    for (const m of models) {
      const t = TABLES.find((x) => x.model === m.name);
      const doc = new Map(t.columns.map((c) => [c.field, c]));
      expect([...doc.keys()].sort(), `columnas de ${m.name}`).toEqual(m.fields.map((f) => f.field).sort());
      for (const f of m.fields) {
        const c = doc.get(f.field);
        expect(c.column, `${m.name}.${f.field} → columna SQL`).toBe(f.column);
        expect(c.nullable, `${m.name}.${f.field} → nulable`).toBe(f.optional);
        expect(c.description?.length, `${m.name}.${f.field} → descripción`).toBeGreaterThan(0);
      }
    }
  });

  it('documenta todos los enums con todos sus valores', () => {
    expect(ENUMS.map((e) => e.name).sort()).toEqual([...enumNames].sort());
    for (const name of enumNames) {
      const body = schema.match(new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`))[1];
      const values = body
        .split('\n')
        .map((l) => l.trim().split(/\s|\/\//)[0])
        .filter(Boolean);
      const documented = ENUMS.find((e) => e.name === name).values.map(([v]) => v);
      expect(documented, `valores de ${name}`).toEqual(values);
    }
  });

  it('marca como sensible el hash de contraseña (nunca sale en un export)', () => {
    const users = TABLES.find((t) => t.model === 'User');
    expect(users.columns.find((c) => c.field === 'passwordHash').sensitive).toBe(true);
  });
});
