import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildProgressEmail, isRecipient, classRows } = require('../../src/services/progressEmail.js');

function ledger(over = {}) {
  return {
    status: 'MATRICULADO',
    classesStartDate: '2026-08-01',
    paquete: { total: 40 },
    consumidas: { total: 12 },
    pendientes: { total: 28 },
    proyeccion: { fin: '2026-12-12' },
    reposicion: {
      lluvia: 1, otras: 0, justificadas: 1, repuestas: 0, pendientes: 2, agendadas: 1, porAgendar: 1,
      items: [
        { type: 'RAIN', date: '2026-10-02', groupCode: 'LMV1' },
        { type: 'JUSTIFIED', date: '2026-10-09', groupCode: 'LMV1' },
      ],
    },
    calendario: { items: [{ date: '2026-10-13', groupCode: 'LMV1', reason: 'Día de la Raza' }] },
    ...over,
  };
}

const records = [
  { date: '2026-10-05', kind: 'REGULAR', attendanceType: 'REGULAR', status: 'PRESENTE', groupCode: 'LMV1', units: 1 },
  { date: '2026-10-07', kind: 'REGULAR', attendanceType: 'REGULAR', status: 'AUSENTE', groupCode: 'LMV1', units: 1 },
  { date: '2026-10-09', kind: 'REGULAR', attendanceType: 'REGULAR', status: 'JUSTIFICADA', groupCode: 'LMV1', units: 1 },
  { date: '2026-07-20', kind: 'REGULAR', attendanceType: 'REGULAR', status: 'AUSENTE', groupCode: 'LMV1', units: 1 },
  { date: '2026-10-16', kind: 'MAKEUP', attendanceType: 'REGULAR', status: 'PRESENTE', title: 'Reposición doble', units: 2 },
];

describe('isRecipient', () => {
  it('matriculados e inscritos, tengan o no reposiciones', () => {
    expect(isRecipient(ledger())).toBe(true);
    expect(isRecipient(ledger({ reposicion: { ...ledger().reposicion, pendientes: 0 } }))).toBe(true);
    expect(isRecipient(ledger({ status: 'INSCRITO' }))).toBe(true);
    expect(isRecipient(null)).toBe(false);
  });
  it('deja fuera preinscritos, inactivos, suspendidos, de prueba y graduados', () => {
    for (const status of ['PREINSCRITO', 'INACTIVO', 'SUSPENDIDO', 'PRUEBA', 'GRADUADO']) expect(isRecipient(ledger({ status }))).toBe(false);
  });
});

describe('classRows', () => {
  const rows = classRows({ ledger: ledger(), records });
  const at = (d) => rows.find((r) => r.date === d);
  it('explica qué significa cada registro', () => {
    expect(at('2026-10-05').effect).toBe('Clase vista');
    expect(at('2026-10-07').effect).toBe('Cuenta como clase recibida');
    expect(at('2026-10-09').effect).toBe('Da derecho a reposición');
    expect(at('2026-07-20').effect).toMatch(/antes del inicio/);
    expect(at('2026-10-16').effect).toBe('Repone 2 clases');
  });
  it('agrega la lluvia (sin registro) y el festivo, sin duplicar la justificada', () => {
    expect(at('2026-10-02').mark).toBe('Cancelada por lluvia');
    expect(at('2026-10-13').effect).toMatch(/reprograma/);
    expect(rows.filter((r) => r.date === '2026-10-09')).toHaveLength(1);
  });
  it('ordena de la más reciente a la más antigua', () => {
    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort().reverse());
  });
});

describe('buildProgressEmail', () => {
  const base = {
    student: { name: 'Ana María Pérez', guardianName: 'Laura <Pérez>' },
    ledger: ledger(),
    records,
    reservations: [{ date: '2026-11-13', label: '5:15 p. m. – 6:00 p. m.' }],
    openSlots: [{ date: '2026-11-14', label: '1:30 p. m. – 2:15 p. m.', free: 3 }, { date: '2026-11-14', label: '2:15 p. m. – 3:00 p. m.', free: 0 }],
    bookingUrl: 'https://x.test/reponer/abc',
    semesterName: '2026-2',
    semesterEnd: '2026-12-12',
    today: '2026-11-08',
  };
  const mail = buildProgressEmail(base);

  it('asunto con el nombre y las clases por reponer', () => {
    expect(mail.subject).toBe('Avance de clases de Ana: 2 clases por reponer');
  });
  it('trae avance, reposiciones, enlace y turnos con cupo', () => {
    expect(mail.html).toContain('https://x.test/reponer/abc');
    expect(mail.html).toContain('Agendar mi reposición');
    expect(mail.html).toContain('1 cancelada por lluvia, 1 falta justificada');
    expect(mail.html).toContain('3 cupos');
    expect(mail.html).not.toContain('0 cupos'); // los turnos llenos no se ofrecen
    expect(mail.html).toContain('viernes 13 de nov');
    expect(mail.html).toContain('30 %');
    expect(mail.text).toContain('AVANCE: 12 de 40 clases (30 %)');
  });
  it('cierra pidiendo avisar inconsistencias (si no, la información se da por correcta)', () => {
    for (const out of [mail.html, mail.text]) {
      expect(out).toContain('responde este correo o comunícate con el Club');
      expect(out).toContain('se entiende que la información es correcta');
    }
  });
  it('no muestra la fecha estimada de fin y cierra con el fin del semestre', () => {
    for (const out of [mail.html, mail.text]) {
      expect(out).not.toMatch(/estimada/i);
      expect(out).toContain('El semestre finaliza el 12 de diciembre. Participa en las jornadas de reposiciones');
    }
    const end = mail.html.indexOf('El semestre finaliza');
    expect(end).toBeGreaterThan(mail.html.indexOf('se entiende que la información es correcta'));
  });
  it('escapa el HTML de los datos', () => {
    expect(mail.html).toContain('Laura &lt;Pérez&gt;');
    expect(mail.html).not.toContain('Laura <Pérez>');
  });
  it('sin nada por agendar no muestra el botón', () => {
    const m = buildProgressEmail({ ...base, ledger: ledger({ reposicion: { ...ledger().reposicion, porAgendar: 0 } }) });
    expect(m.html).not.toContain('Agendar mi');
    expect(m.html).toContain('ya están agendadas');
  });
  it('sin reposiciones: avance y detalle, sin enlace ni botón', () => {
    const none = { ...ledger().reposicion, lluvia: 0, justificadas: 0, pendientes: 0, agendadas: 0, porAgendar: 0, items: [] };
    const m = buildProgressEmail({ ...base, ledger: ledger({ reposicion: none }), reservations: [], bookingUrl: null });
    expect(m.subject).toBe('Avance de clases de Ana');
    expect(m.html).toContain('No tiene clases por reponer');
    expect(m.html).toContain('Detalle de clases');
    expect(m.html).not.toContain('reponer/');
    expect(m.html).not.toContain('Turnos con cupo');
    expect(m.text).not.toContain('null');
  });
});
