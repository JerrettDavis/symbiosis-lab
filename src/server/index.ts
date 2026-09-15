import { createLab } from './app.js';
import { number } from '../engine/validation.js';
const port = number(Number(process.env.PORT ?? 8080), 'PORT', 1, 65535, true);
const app = createLab({ dataDir: process.env.DATA_DIR ?? 'data', autosave: process.env.AUTOSAVE !== 'false', running: process.env.PAUSED !== 'true' });
app.server.on('error', err => { console.error(`Could not start the server: ${err.message}. Check HOST and PORT.`); process.exit(1); });
app.server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`Symbiosis Lab: http://localhost:${port} | seed ${app.world.config.seed} | tick ${app.world.tick}`));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (stopping) return; stopping = true;
  app.stop().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
});
