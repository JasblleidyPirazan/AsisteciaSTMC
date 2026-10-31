// mockPrisma MUST be imported before the routers (require.cache injection).
import { prismaMock, resetPrisma, mockLedgerDeps } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Contrato de una sola cifra (brief §5): el mismo estudiante, con los mismos datos,
// muestra el mismo paquete / consumidas / pendientes en TODAS las pantallas, porque
// todas salen del ledger. Si alguien vuelve a calcular algo aparte, esta prueba falla.
let ledgerApp; let groupsApp; let reportsApp; let studentsApp;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

const d = (x) => new Date(`${x}T00:00:00.000Z`);
const NO_DAYS = { lunes: false, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false };
const G1 = {
  id: 'g1', code: 'G1', active: true, createdAt: d('2026-01-01'), ballLevel: 'Verde', subLevel: 'A',
  professor: { name: 'Ana' }, ...NO_DAYS, lunes: true, miercoles: true,
};
const SEM = { id: 'sem1', name: '2026-1', startDate: d('2026-03-01'), endDate: d('2026-06-30'), active: true, exclusions: [] };
const ARIA = {
  id: 'st1', name: 'Aria', document: '1', active: true, isTrial: false, birthDate: d('2012-01-01'),
  classesAcquired: 20, previousClasses: 2, classesStartDate: null,
  suspendedFrom: null, suspendedUntil: null, parentUserId: 'par1',
  enrollments: [{ groupId: 'g1', enrolledAt: d('2026-03-01'), weekdays: [], enrollmentType: 'PRIMARY', group: G1 }],
};
const sess = (id, date, over = {}) => ({
  id, groupId: 'g1', date: d(date), kind: 'REGULAR', status: 'REALIZADA', effectiveUnits: 1,
  cancellationCategory: null, consolidationStatus: 'MATCHED', ...over,
});
const rec = (status, session, attendanceType = 'REGULAR') => ({
  studentId: 'st1', status, attendanceType, justification: null, session,
});
// 3 presentes + 2 faltas + 1 justificada + una reposición doble vista = 7 consumidas
const RECORDS = [
  rec('PRESENTE', sess('a', '2026-03-02')), rec('PRESENTE', sess('b', '2026-03-04')), rec('PRESENTE', sess('c', '2026-03-09')),
  rec('AUSENTE', sess('d', '2026-03-11')), rec('AUSENTE', sess('e', '2026-03-16')),
  rec('JUSTIFICADA', sess('f', '2026-03-18')),
  rec('PRESENTE', sess('m', '2026-03-20', { kind: 'MAKEUP', groupId: null, effectiveUnits: 2 }), 'REPOSICION'),
];

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  ledgerApp = await buildApp('/api/ledger', (await import('../../src/routes/ledger.js')).default);
  groupsApp = await buildApp('/api/groups', (await import('../../src/routes/groups.js')).default);
  reportsApp = await buildApp('/api/reports', (await import('../../src/routes/reports.js')).default);
  studentsApp = await buildApp('/api/students', (await import('../../src/routes/students.js')).default);
});

beforeEach(async () => {
  resetPrisma();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-04-01T15:00:00.000Z'));
  prismaMock.studentEnrollment = { findMany: vi.fn().mockResolvedValue([{ student: ARIA }]) };
  await mockLedgerDeps({ semester: SEM, students: [ARIA], records: RECORDS, sessions: RECORDS.map((r) => r.session) });
});

afterEach(() => { vi.useRealTimers(); });

describe('una sola cifra en todas las pantallas', () => {
  it('ledger, roster del grupo, seguimiento y ficha coinciden', async () => {
    const auth = `Bearer ${authAs('ADMIN')}`;
    const { body: { data: ledger } } = await request(ledgerApp).get('/api/ledger/st1').set('Authorization', auth);
    const { body: roster } = await request(groupsApp).get('/api/groups/g1/students').set('Authorization', auth);
    const { body: tracking } = await request(reportsApp).get('/api/reports/students-tracking').set('Authorization', auth);
    const { body: debt } = await request(studentsApp).get('/api/students/st1/makeup-debt').set('Authorization', auth);

    // Verdad: 3 presentes + 2 faltas + reposición doble (2) = 7 de 22
    expect(ledger.consumidas.total).toBe(7);
    expect(ledger.paquete.total).toBe(22);
    expect(ledger.pendientes.total).toBe(15);

    const rosterRow = roster.data.find((s) => s.id === 'st1');
    const trackRow = tracking.data.rows.find((r) => r.id === 'st1');
    expect(rosterRow.classesSeen).toBe(ledger.consumidas.total);
    expect(rosterRow.classesAcquired).toBe(ledger.paquete.total);
    expect(trackRow.total).toBe(ledger.consumidas.total);
    expect(trackRow.acquired).toBe(ledger.paquete.total);

    // Todas las pantallas que adjuntan el ledger resumido dicen lo mismo
    for (const brief of [rosterRow.ledger, trackRow.ledger]) {
      expect(brief.consumidas.total).toBe(ledger.consumidas.total);
      expect(brief.pendientes).toEqual({
        total: ledger.pendientes.total,
        cubreCalendario: ledger.pendientes.cubreCalendario,
        agendadasAplicadas: ledger.pendientes.agendadasAplicadas,
        porAgendar: ledger.pendientes.porAgendar,
        deficit: ledger.pendientes.deficit,
      });
      expect(brief.semaforo).toBe(ledger.semaforo);
    }
    expect(debt.data.progress.remaining).toBe(ledger.pendientes.total);
  });

  it('las cuatro cubetas de pendientes suman el total', async () => {
    const { body: { data: l } } = await request(ledgerApp).get('/api/ledger/st1')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    const p = l.pendientes;
    expect(Math.round((p.cubreCalendario + p.agendadasAplicadas + p.porAgendar + p.deficit) * 10) / 10).toBe(p.total);
  });
});
