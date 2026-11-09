# Correo semanal de avance a acudientes

Cada semana se envía un correo a los acudientes de todos los estudiantes
**matriculados e inscritos**. El correo trae:

1. **Avance** del paquete: clases pagadas, recibidas, las que faltan y %.
2. **Reposiciones**: si tiene clases por reponer (canceladas por lluvia, canceladas por la
   Escuela y faltas justificadas), cuántas y de dónde salen, las que ya agendó, un botón a su
   **enlace personal** (`/reponer/…`) y los turnos con cupo de los próximos días. Si no tiene,
   el correo lo dice ("No tiene clases por reponer") y no lleva enlace.
3. **Detalle clase a clase** del semestre: fecha, grupo, registro (asistió, no asistió,
   justificada, lluvia, festivo…) y qué significa para su paquete.

Al final, después del aviso de inconsistencias, cierra con: "El semestre finaliza el
<fecha>. Participa en las jornadas de reposiciones que tendremos para completar tu paquete
de clases." La fecha es la **fecha de fin del semestre activo** (Configuración → Semestres).

Todas las cifras salen del ledger del estudiante: son las mismas que ve la Escuela en el sistema.

## Cómo está armado

```
Sistema (Railway)                         Google Apps Script (Gmail)
──────────────────                        ─────────────────────────
arma los correos  ──── feed con clave ──▶ los trae y los envía con MailApp
/api/notifications/weekly-progress/feed   todos los días 8 a. m.; la tanda
                                          arranca el día de envío
```

- El **sistema no envía correos**: solo los arma. Así se puede cambiar de servicio
  de envío sin tocar el contenido.
- La coordinación ve **la vista previa** en *Agendar reposiciones → 📧 Correo semanal*
  (lista de destinatarios, cada correo tal como llegará y quiénes no tienen correo).
- Quién recibe: estudiantes con estado ✅ Matriculado o 🔵 Inscrito (pago completo
  o parcial). No reciben: 📝 preinscritos (sin pagos), 🎓 graduados, de prueba,
  suspendidos ni inactivos. Se envía al correo del estudiante (o, si no tiene,
  al de la cuenta de padre vinculada). Los que no tienen correo aparecen aparte.
- Si el estudiante tiene reposiciones por agendar y aún no tenía enlace, se le crea al armar el correo.

## Puesta en marcha (una sola vez)

### 1. Clave del feed en Railway

1. Inventa una clave larga (mínimo 16 caracteres; mejor 32 letras y números al azar).
2. Railway → servicio → **Variables** → nueva variable `NOTIFY_API_KEY` = esa clave.
3. (Opcional) `APP_URL` = `https://asisteciastmc-production.up.railway.app` si los
   enlaces del correo deben usar otro dominio.

Sin `NOTIFY_API_KEY` el feed responde 503 y nadie puede leerlo.

### 2. Script de Google

1. Crea una hoja de cálculo de Google con la cuenta que va a enviar (p. ej. "Correo semanal STMC").
2. **Extensiones → Apps Script**. Borra lo que haya y pega el contenido de
   [`docs/apps-script/correo-semanal.gs`](apps-script/correo-semanal.gs).
3. **Configuración del proyecto** (engranaje):
   - Zona horaria: `(GMT-05:00) Bogotá`.
   - **Propiedades del script**:
     | Propiedad | Valor |
     |---|---|
     | `API_URL` | `https://asisteciastmc-production.up.railway.app/api/notifications/weekly-progress/feed` |
     | `API_KEY` | la misma clave de `NOTIFY_API_KEY` |
     | `TEST_EMAIL` | tu correo, para las pruebas |
     | `SEND_DAY` | día de envío: `1` lunes (por defecto) … `6` sábado, `0` domingo |
     | `REPLY_TO` | (opcional) correo al que responden los acudientes |
4. Elige la función **`vistaPrevia`** y dale *Ejecutar*. Google pide permisos
   (ver la hoja, conectarse a un servicio externo, enviar correo): acéptalos.
   En el registro verás cuántos correos saldrían.
5. Ejecuta **`probar`**: te llegan los 3 primeros correos a `TEST_EMAIL` con
   "[PRUEBA para …]" en el asunto. Revísalos.
6. Ejecuta **`configurar`**: crea el disparador diario de las 8 a. m. y la hoja "Envíos".

Desde ahí es automático. Para pararlo: función **`detener`**.

## Límites de envío

| Cuenta que envía | Correos por día con Apps Script |
|---|---|
| Gmail gratuita | 100 |
| Google Workspace | 1.500 |

Si la tanda de la semana supera el cupo del día, el script envía lo que puede y
**termina al día siguiente** sin repetir a nadie (la hoja "Envíos" registra cada
correo con su semana). Cuando la tanda termina, no vuelve a enviar hasta la
siguiente semana.

## Si más adelante se quiere otro servicio

El feed sirve a cualquier remitente. Alternativas, de menor a mayor cambio:

- **Google Workspace** (si la Escuela lo tiene): mismo script, cupo de 1.500/día.
- **Brevo** (300 correos/día gratis) o **Resend** (3.000/mes gratis, 100/día):
  se enviaría desde el propio servidor con su API y una tarea programada; requiere
  verificar el dominio de la Escuela (registros DNS) y agregar la clave del
  servicio en Railway. El contenido del correo no cambia.

## Para desarrolladores

- Armado del correo: `server/src/services/progressEmail.js` (`buildProgressEmail`, `isRecipient`, `classRows`; pura, unit-testeada).
- Rutas: `server/src/routes/notifications.js` — `GET /api/notifications/weekly-progress` (ADMIN/Coordinador) y `/feed` (`X-Api-Key`).
- Vista previa: `client/src/components/WeeklyEmailPanel.jsx`.
- Tests: `server/tests/unit/progressEmail.test.js`, `server/tests/integration/notifications.test.js`.
