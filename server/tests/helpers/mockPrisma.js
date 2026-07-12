// The server is CommonJS (no "type":"module"), so the route/middleware graph is
// wired with `const prisma = require('../lib/prisma')` and those nested requires
// go through Node's native require.cache — which vitest's vi.mock does NOT
// intercept. To mock the DB we pre-seed require.cache with a stable mock object
// BEFORE any consumer module is loaded. Consumers capture this object by
// reference at import time and read `prisma.<model>.<method>` fresh on each
// call, so mutating the mock per-test is enough.
//
// Importing this module (statically, before importing any router) performs the
// injection as a side effect.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const prismaMock = {};

const prismaPath = require.resolve('../../src/lib/prisma');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prismaMock,
};

// Wipe every model accessor between tests (keeps the same object reference).
export function resetPrisma() {
  for (const key of Object.keys(prismaMock)) delete prismaMock[key];
}
