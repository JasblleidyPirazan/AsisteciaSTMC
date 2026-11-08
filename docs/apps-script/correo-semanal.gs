/**
 * Correo semanal de avance — Escuela de Tenis Santa María
 *
 * El sistema (Railway) ARMA los correos; este script solo los TRAE y los ENVÍA
 * con la cuenta de Gmail dueña del script. Guía completa: docs/correo-semanal.md
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   API_URL     https://asisteciastmc-production.up.railway.app/api/notifications/weekly-progress/feed
 *   API_KEY     la misma clave que NOTIFY_API_KEY en Railway
 *   TEST_EMAIL  (opcional) a dónde llegan los correos de prueba
 *   SEND_DAY    (opcional) día de envío: 0=domingo, 1=lunes … 6=sábado. Por defecto 1 (lunes)
 *   REPLY_TO    (opcional) correo al que responden los acudientes
 *
 * Cómo funciona el límite diario de Gmail (100 correos en cuenta gratuita):
 * el disparador corre TODOS los días a las 8 a. m. El día de envío arranca la
 * tanda de la semana; si no alcanza el cupo del día, la termina al día siguiente
 * sin repetir a nadie (cada envío queda en la hoja "Envíos"). Cuando la tanda
 * termina, no vuelve a enviar hasta la semana siguiente.
 */

const SHEET_NAME = 'Envíos';
const SENDER_NAME = 'Escuela de Tenis Santa María';
const QUOTA_MARGIN = 3; // deja unos correos del día libres para uso normal

function props_() {
  return PropertiesService.getScriptProperties();
}

function cfg_() {
  const p = props_();
  const cfg = {
    url: p.getProperty('API_URL'),
    key: p.getProperty('API_KEY'),
    testEmail: p.getProperty('TEST_EMAIL'),
    sendDay: Number(p.getProperty('SEND_DAY') || 1),
    replyTo: p.getProperty('REPLY_TO') || '',
  };
  if (!cfg.url || !cfg.key) throw new Error('Faltan API_URL o API_KEY en las propiedades del script');
  return cfg;
}

// Trae del sistema los correos de hoy.
function fetchBatch_() {
  const c = cfg_();
  const res = UrlFetchApp.fetch(c.url, { headers: { 'X-Api-Key': c.key }, muteHttpExceptions: true });
  const body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200 || !body.success) {
    throw new Error('El sistema respondió ' + res.getResponseCode() + ': ' + (body.error || res.getContentText()));
  }
  return body.data;
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Semana', 'Enviado', 'Estudiante', 'Correo', 'Asunto', 'Por reponer', 'Por agendar', 'Resultado']);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Fecha (yyyy-MM-dd) del último día de envío: identifica la tanda de la semana.
function cycleKey_(sendDay) {
  const tz = Session.getScriptTimeZone();
  const d = new Date();
  const back = (d.getDay() - sendDay + 7) % 7;
  d.setDate(d.getDate() - back);
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function sentThisCycle_(sh, cycle) {
  const values = sh.getDataRange().getValues();
  const done = {};
  for (let i = 1; i < values.length; i++) {
    const week = values[i][0] instanceof Date
      ? Utilities.formatDate(values[i][0], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(values[i][0]);
    if (week === cycle && values[i][7] === 'OK') done[String(values[i][3]).toLowerCase() + '|' + values[i][2]] = true;
  }
  return done;
}

function send_(to, r, subjectPrefix) {
  const c = cfg_();
  const msg = { to: to, subject: (subjectPrefix || '') + r.subject, htmlBody: r.html, body: r.text, name: SENDER_NAME };
  if (c.replyTo) msg.replyTo = c.replyTo;
  MailApp.sendEmail(msg);
}

/** Lo corre el disparador diario. También se puede correr a mano. */
function enviarSemana() {
  const c = cfg_();
  const p = props_();
  const cycle = cycleKey_(c.sendDay);
  if (p.getProperty('CYCLE_DONE') === cycle) return; // la tanda de esta semana ya terminó

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const sh = sheet_();
    const done = sentThisCycle_(sh, cycle);
    const data = fetchBatch_();
    const tz = Session.getScriptTimeZone();
    let quota = MailApp.getRemainingDailyQuota() - QUOTA_MARGIN;
    let pending = 0;
    for (const r of data.recipients) {
      const id = r.to.toLowerCase() + '|' + r.name;
      if (done[id]) continue;
      if (quota <= 0) { pending++; continue; }
      let result = 'OK';
      try {
        send_(r.to, r);
        quota--;
      } catch (e) {
        result = 'ERROR: ' + e.message;
      }
      sh.appendRow([cycle, Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'), r.name, r.to, r.subject, r.pendientes, r.porAgendar, result]);
    }
    if (pending === 0) p.setProperty('CYCLE_DONE', cycle);
    console.log('Semana ' + cycle + ': ' + data.recipients.length + ' correos en total, ' + pending + ' quedan para mañana. Sin correo: ' + data.skipped.length);
  } finally {
    lock.releaseLock();
  }
}

/** Manda los 3 primeros correos SOLO a TEST_EMAIL para revisarlos. No marca nada como enviado. */
function probar() {
  const c = cfg_();
  if (!c.testEmail) throw new Error('Define TEST_EMAIL en las propiedades del script');
  const data = fetchBatch_();
  data.recipients.slice(0, 3).forEach(function (r) { send_(c.testEmail, r, '[PRUEBA para ' + r.to + '] '); });
  console.log('Enviados ' + Math.min(3, data.recipients.length) + ' de prueba a ' + c.testEmail + '. Total de la semana: ' + data.recipients.length + '. Cupo de hoy: ' + MailApp.getRemainingDailyQuota());
}

/** Solo cuenta: a cuántos se les enviaría hoy y cuántos no tienen correo. No envía. */
function vistaPrevia() {
  const data = fetchBatch_();
  console.log('Correos: ' + data.recipients.length + ' · Sin correo: ' + data.skipped.length + ' · Cupo de hoy: ' + MailApp.getRemainingDailyQuota());
  data.recipients.forEach(function (r) { console.log(r.name + ' → ' + r.to + ' · ' + r.subject); });
}

/** Crea el disparador diario (8 a. m.) y la hoja de registro. Correr UNA vez. */
function configurar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarSemana') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarSemana').timeBased().everyDays(1).atHour(8).create();
  sheet_();
  console.log('Listo: enviarSemana correrá todos los días a las 8 a. m.; envía la tanda el día ' + cfg_().sendDay + ' (0=dom … 6=sáb).');
}

/** Detiene los envíos automáticos. */
function detener() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarSemana') ScriptApp.deleteTrigger(t);
  });
  console.log('Envíos automáticos detenidos.');
}
