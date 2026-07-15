// mockPrisma MUST be imported before the service (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateCosts } from '../../src/services/costEngine.js';

// Triple coincidencia con AUTO-validación: el pago del asistente se habilita
// cuando coincide la información del asistente, el profesor y el coordinador.
// En clase regular consolidada (MATCHED), profesor y coordinador ya
// coincidieron vía doble reporte → basta la confirmación del asistente.

const RATES = [
  { key: 'rate_2_students', value: '30000' },
  { key: 'rate_3_students', value: '45000' },
  { key: 'rate_4_students', value: '60000' },
  { key: 'rate_5plus_students', value: '75000' },
  { key: 'assistant_fixed_rate', value: '12000' },
  { key: 'assistant_match_start_date', value: '2026-01-01' },
];

// Reportada el mismo día (18:00 UTC = 13:00 Bogotá) → sin suspensión por tardío.
function baseSession(overrides = {}) {
  return {
    id: 's1',
    kind: 'REGULAR',
    status: 'REALIZADA',
    effectiveUnits: '1.0',
    date: new Date('2026-07-10T00:00:00.000Z'),
    firstReportedAt: new Date('2026-07-10T18:00:00.000Z'),
    paymentUnlockedAt: null,
    consolidationStatus: 'MATCHED',
    coordinatorValidatedAt: null,
    assistantId: 'a1',
    assistantConfirmedId: 'a1',
    group: { professor: { id: 'p1' } },
    makeupProfessor: null,
    substituteProfessor: null,
    assistant: { id: 'a1' },
    attendanceRecords: [
      { status: 'PRESENTE', attendanceType: 'REGULAR' },
      { status: 'PRESENTE', attendanceType: 'REGULAR' },
    ],
    festivalProfessors: [],
    ...overrides,
  };
}

function assistantRecord() {
  const rows = prismaMock.costRecord.createMany.mock.calls[0][0].data;
  return rows.find((r) => r.payeeType === 'ASSISTANT');
}

beforeEach(() => {
  resetPrisma();
  prismaMock.classSession = { findUnique: vi.fn() };
  prismaMock.systemConfig = { findMany: vi.fn().mockResolvedValue(RATES) };
  prismaMock.costRecord = {
    deleteMany: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({}),
  };
});

describe('costEngine — auto-validación de la triple coincidencia', () => {
  it('REGULAR consolidada (MATCHED) + asistente confirmado → PAYABLE sin clic del coordinador', async () => {
    prismaMock.classSession.findUnique.mockResolvedValue(baseSession());
    await calculateCosts('s1');
    expect(assistantRecord().payStatus).toBe('PAYABLE');
  });

  it('REGULAR legada (sin consolidación) + confirmado pero sin validación → PENDING_MATCH', async () => {
    prismaMock.classSession.findUnique.mockResolvedValue(
      baseSession({ consolidationStatus: 'PENDING' })
    );
    await calculateCosts('s1');
    expect(assistantRecord().payStatus).toBe('PENDING_MATCH');
  });

  it('el asistente confirmado NO coincide con el reportado → PENDING_MATCH aunque esté consolidada', async () => {
    prismaMock.classSession.findUnique.mockResolvedValue(
      baseSession({ assistantConfirmedId: 'a2' })
    );
    await calculateCosts('s1');
    expect(assistantRecord().payStatus).toBe('PENDING_MATCH');
  });

  it('MAKEUP + confirmado, sin validación del coordinador → PENDING_MATCH', async () => {
    prismaMock.classSession.findUnique.mockResolvedValue(
      baseSession({ kind: 'MAKEUP', consolidationStatus: 'PENDING', group: null, makeupProfessor: { id: 'p1' } })
    );
    await calculateCosts('s1');
    expect(assistantRecord().payStatus).toBe('PENDING_MATCH');
  });

  it('MAKEUP + confirmado + validación del coordinador (manual o al reportar) → PAYABLE', async () => {
    prismaMock.classSession.findUnique.mockResolvedValue(
      baseSession({
        kind: 'MAKEUP', consolidationStatus: 'PENDING', group: null,
        makeupProfessor: { id: 'p1' }, coordinatorValidatedAt: new Date(),
      })
    );
    await calculateCosts('s1');
    expect(assistantRecord().payStatus).toBe('PAYABLE');
  });

  it('clases anteriores al corte assistant_match_start_date siguen PAYABLE', async () => {
    prismaMock.classSession.findUnique.mockResolvedValue(
      baseSession({
        date: new Date('2025-12-01T00:00:00.000Z'),
        firstReportedAt: new Date('2025-12-01T18:00:00.000Z'),
        consolidationStatus: 'PENDING',
        assistantConfirmedId: null,
      })
    );
    await calculateCosts('s1');
    expect(assistantRecord().payStatus).toBe('PAYABLE');
  });
});
