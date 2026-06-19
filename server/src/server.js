import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`Servidor de Asistencia de Tenis (v2) escuchando en el puerto ${env.port} [${env.nodeEnv}]`);
});
