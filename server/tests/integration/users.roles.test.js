// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Role-escalation guard on POST /api/users: only a SUPERADMIN may create
// ADMIN / SUPERADMIN accounts; an ADMIN can only create staff roles.
let app;

// Auth returns the acting user by id; the duplicate-email check returns null.
function actAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn(({ where }) => {
      if (where?.id) return Promise.resolve({ id, email: `${role}@stmc.co`, role, active: true });
      return Promise.resolve(null); // no existing email
    }),
    create: vi.fn(({ data }) =>
      Promise.resolve({ id: 'new', email: data.email, role: data.role, active: true, createdAt: new Date() })
    ),
  };
  return tokenFor({ id, role });
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const usersRouter = (await import('../../src/routes/users.js')).default;
  app = await buildApp('/api/users', usersRouter);
});

beforeEach(() => resetPrisma());

function createUser(token, role) {
  return request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send({ email: 'nuevo@stmc.co', password: 'contra1234', role });
}

describe('POST /api/users — escalación de roles', () => {
  it('ADMIN puede crear personal (PHYSICAL_TRAINER) → 201', async () => {
    const res = await createUser(actAs('ADMIN'), 'PHYSICAL_TRAINER');
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalled();
  });

  it('ADMIN NO puede crear un SUPERADMIN → 403', async () => {
    const res = await createUser(actAs('ADMIN'), 'SUPERADMIN');
    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('ADMIN NO puede crear otro ADMIN → 403', async () => {
    const res = await createUser(actAs('ADMIN'), 'ADMIN');
    expect(res.status).toBe(403);
  });

  it('SUPERADMIN puede crear un ADMIN → 201', async () => {
    const res = await createUser(actAs('SUPERADMIN'), 'ADMIN');
    expect(res.status).toBe(201);
  });

  it('SUPERADMIN puede crear otro SUPERADMIN → 201', async () => {
    const res = await createUser(actAs('SUPERADMIN'), 'SUPERADMIN');
    expect(res.status).toBe(201);
  });
});
