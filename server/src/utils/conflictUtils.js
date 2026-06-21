function computeDiff(canonicalRecords, challengerRecords) {
  const all = new Map();

  for (const r of canonicalRecords) {
    all.set(r.studentId, {
      studentId: r.studentId,
      name: r.name || r.studentId,
      canonical: r.status,
      challenger: null,
      conflict: false,
    });
  }

  for (const r of challengerRecords) {
    if (all.has(r.studentId)) {
      const entry = all.get(r.studentId);
      entry.challenger = r.status;
      entry.conflict = entry.canonical !== r.status;
    } else {
      all.set(r.studentId, {
        studentId: r.studentId,
        name: r.name || r.studentId,
        canonical: null,
        challenger: r.status,
        conflict: true,
      });
    }
  }

  // Students present in canonical but absent from challenger → also a conflict
  for (const entry of all.values()) {
    if (entry.challenger === null) entry.conflict = true;
  }

  return Array.from(all.values());
}

function hasConflict(diff) {
  return diff.some((d) => d.conflict);
}

module.exports = { computeDiff, hasConflict };
