// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import XLSX from 'xlsx';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

const require = createRequire(import.meta.url);
const { TABLES, REDACTED } = require('../../src/services/dataDictionary.js');

let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

// Todas las tablas responden vacío salvo las que el test llene a mano.
function mockAllTables(overrides = {}) {
  for (const t of TABLES) {
    prismaMock[t.delegate] = {
      ...(prismaMock[t.delegate] || {}),
      findMany: vi.fn().mockResolvedValue(overrides[t.delegate] || []),
    };
  }
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/system', (await import('../../src/routes/system.js')).default);
});

beforeEach(() => {
  resetPrisma();
});

describe('GET /api/system/export/database', () => {
  it('TEACHER → 403', async () => {
    const token = authAs('TEACHER');
    mockAllTables();
    const res = await request(app).get('/api/system/export/database').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('PHYSICAL_TRAINER (Coordinador) → 403', async () => {
    const token = authAs('PHYSICAL_TRAINER');
    mockAllTables();
    const res = await request(app).get('/api/system/export/database').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('formato desconocido → 400', async () => {
    const token = authAs('ADMIN');
    mockAllTables();
    const res = await request(app).get('/api/system/export/database?format=sql').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('ADMIN → xlsx con una hoja por tabla, diccionario y sin hash de contraseña', async () => {
    const token = authAs('ADMIN');
    // El mock de auth pisa users.findMany, así que se define después.
    mockAllTables({
      student: [{ id: 's1', name: 'Ana', birthDate: new Date('2010-05-04T00:00:00Z'), classesAcquired: 40, active: true, createdAt: new Date('2026-01-02T15:00:00Z') }],
      costRecord: [{ id: 'c1', sessionId: 'x1', payeeType: 'PROFESSOR', total: '45000.00', rate: '45000.00', effectiveUnits: '1.0', presentCount: 3, period: '2026-08-1', payStatus: 'PAYABLE', createdAt: new Date() }],
    });
    prismaMock.user.findMany = vi.fn().mockResolvedValue([
      { id: 'u1', email: 'admin@stmc.co', passwordHash: '$2a$10$secreto', role: 'ADMIN', active: true, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const res = await request(app)
      .get('/api/system/export/database?format=xlsx')
      .set('Authorization', `Bearer ${token}`)
      .buffer()
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/base-de-datos-\d{4}-\d{2}-\d{2}\.xlsx/);

    const wb = XLSX.read(res.body, { type: 'buffer' });
    for (const t of TABLES) expect(wb.SheetNames, `hoja ${t.table}`).toContain(t.table);
    expect(wb.SheetNames).toEqual(expect.arrayContaining(['Overview', 'Data Dictionary', 'Enums']));

    const users = XLSX.utils.sheet_to_json(wb.Sheets.users);
    expect(users[0].password_hash).toBe(REDACTED);
    expect(JSON.stringify(users)).not.toContain('secreto');

    const students = XLSX.utils.sheet_to_json(wb.Sheets.students);
    expect(students[0].birth_date).toBe('2010-05-04'); // columna `date` → solo fecha
    expect(students[0].name).toBe('Ana');

    const costs = XLSX.utils.sheet_to_json(wb.Sheets.cost_records);
    expect(costs[0].total).toBe(45000); // numeric → número, no texto
  });

  it('ADMIN → json con meta y todas las tablas', async () => {
    const token = authAs('ADMIN');
    mockAllTables({ student: [{ id: 's1', name: 'Ana', createdAt: new Date('2026-01-02T15:00:00Z') }] });
    prismaMock.user.findMany = vi.fn().mockResolvedValue([]);

    const res = await request(app)
      .get('/api/system/export/database?format=json')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = JSON.parse(res.text);
    expect(Object.keys(body.data).sort()).toEqual(TABLES.map((t) => t.table).sort());
    expect(body.meta.totalRows).toBe(1);
    expect(body.data.students[0].name).toBe('Ana');
    expect(body.data.students[0].deactivated_at).toBeNull();
  });
});
