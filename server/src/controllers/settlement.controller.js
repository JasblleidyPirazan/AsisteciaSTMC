import { prisma } from '../lib/prisma.js';
import { forbidden } from '../lib/errors.js';

const CATEGORY_LABELS = {
  REGULAR_SENCILLA: 'Clases sencillas',
  REGULAR_DOBLE: 'Clases dobles',
  DOBLE_MITAD: 'Clases dobles (mitad)',
  REPOSICION_GRUPAL: 'Reposiciones grupales',
  EVENTO: 'Eventos especiales',
  ASISTENTE: 'Clases acompañadas',
};

const num = (v) => Number(v ?? 0);
const round2 = (v) => Math.round(v * 100) / 100;

// Construye el desglose de un conjunto de cost_records de un mismo beneficiario.
function buildBreakdown(records) {
  const byCategory = new Map();
  for (const r of records) {
    const key = r.category;
    const entry = byCategory.get(key) ?? { category: key, label: CATEGORY_LABELS[key] ?? key, count: 0, total: 0 };
    entry.count += 1;
    entry.total = round2(entry.total + num(r.total));
    byCategory.set(key, entry);
  }
  const breakdown = [...byCategory.values()];
  const total = round2(breakdown.reduce((s, e) => s + e.total, 0));
  return { breakdown, total };
}

// HU-LIQ-01: liquidación de todos los profesores/asistentes de una quincena.
export async function getSettlement(req, res) {
  const { period } = req.params;

  const records = await prisma.costRecord.findMany({
    where: { period },
    include: { payee: { select: { id: true, name: true, role: true } } },
  });

  const byPayee = new Map();
  for (const r of records) {
    const list = byPayee.get(r.payeeId) ?? [];
    list.push(r);
    byPayee.set(r.payeeId, list);
  }

  const people = [...byPayee.entries()].map(([payeeId, recs]) => {
    const { breakdown, total } = buildBreakdown(recs);
    return {
      payeeId,
      name: recs[0].payee.name,
      role: recs[0].payee.role,
      breakdown,
      total,
    };
  });

  res.json({
    period,
    people: people.sort((a, b) => a.name.localeCompare(b.name)),
    grandTotal: round2(people.reduce((s, p) => s + p.total, 0)),
  });
}

// HU-LIQ-02: liquidación propia del profesor/asistente autenticado.
export async function getMySettlement(req, res) {
  const { period } = req.params;

  if (!['TEACHER', 'ASSISTANT', 'ADMIN'].includes(req.user.role)) {
    throw forbidden('No tiene liquidación asociada');
  }

  const records = await prisma.costRecord.findMany({
    where: { period, payeeId: req.user.id },
    include: {
      session: { select: { date: true, group: { select: { code: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const { breakdown, total } = buildBreakdown(records);

  res.json({
    period,
    total,
    breakdown,
    sessions: records.map((r) => ({
      date: r.session?.date ?? null,
      group: r.session?.group?.code ?? null,
      category: CATEGORY_LABELS[r.category] ?? r.category,
      presentCount: r.presentCount,
      units: num(r.effectiveUnits),
      rate: num(r.rate),
      total: num(r.total),
    })),
  });
}
