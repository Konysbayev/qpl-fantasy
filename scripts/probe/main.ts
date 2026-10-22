// Зондты нақты API-ға қосып іске асырады: кілтті ортадан оқиды, шикі жауаптар мен есепті файлға жазады.
import fs from 'node:fs';
import path from 'node:path';
import { createApiFootballClient } from '../../packages/api-football/src/client.js';
import { runProbe } from './probe.js';
import { renderReport } from './report.js';

const MAX_REQUESTS = 25;
const SAMPLE_FIXTURES = 3;
const PAUSE_MS = 7000; // тегін тариф: минутына 10 сұраныс

const apiKey = process.env.API_FOOTBALL_KEY;
if (!apiKey) {
  console.error('Нет ключа API_FOOTBALL_KEY: добавьте его в настройках среды и откройте новую сессию');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const rawDir = path.join('research', 'raw', date);
fs.mkdirSync(rawDir, { recursive: true });
let n = 0;

const findings = await runProbe(createApiFootballClient({ apiKey }), {
  targetSeason: new Date().getFullYear(),
  maxRequests: MAX_REQUESTS,
  sampleFixtures: SAMPLE_FIXTURES,
  wait: () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS)),
  onRaw: (name, body) => {
    n++;
    fs.writeFileSync(path.join(rawDir, `${String(n).padStart(2, '0')}-${name}.json`), JSON.stringify(body, null, 2));
  }
});

const reportPath = path.join('docs', 'research', `${date}-api-football-kpl.md`);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, renderReport(findings, date));
console.log(`Отчёт: ${reportPath}`);
