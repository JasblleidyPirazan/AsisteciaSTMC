// Qué falta de la TRIPLE COINCIDENCIA del asistente en una sesión, como códigos
// que el frontend traduce a texto (professor | assistant | assistant_mismatch |
// coordinator). Fuente única compartida por la cola de validación y la
// liquidación, para que ambas expliquen lo mismo.
//
// Refleja la regla del motor de costos (con auto-validación): en clase REGULAR
// consolidada (MATCHED) profesor y coordinador ya coincidieron en el asistente.
function assistantMissing(session) {
  const s = session || {};
  const professorReported = !!s.assistantId;         // el profesor registró un asistente
  const assistantConfirmed = !!s.assistantConfirmedId; // el asistente marcó su acompañamiento
  const matches = professorReported && s.assistantId === s.assistantConfirmedId;
  const coordinatorOk = !!s.coordinatorValidatedAt ||
    (s.kind === 'REGULAR' && s.consolidationStatus === 'MATCHED');

  const missing = [];
  if (!professorReported) missing.push('professor');
  if (!assistantConfirmed) missing.push('assistant');
  else if (!matches) missing.push('assistant_mismatch');
  if (!coordinatorOk) missing.push('coordinator');
  return missing;
}

module.exports = { assistantMissing };
