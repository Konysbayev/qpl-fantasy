// Функциялардың құпиялары: TELEGRAM_BOT_TOKEN — ортадан, SESSION_SECRET — ортадан не кездейсоқ (64 hex). Мәндер экранға шықпайды.
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { envOpts, managementFetch, type ManagementOpts } from './management.js';

const BOT_TOKEN = /^\d+:[A-Za-z0-9_-]{30,}$/;

export interface Secret {
  name: string;
  value: string;
}

export function buildSecrets(env: Record<string, string | undefined>): Secret[] {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Нет TELEGRAM_BOT_TOKEN в окружении');
  // Токен BotFather: цифры, двоеточие, ключ. Лишние символы (скобки из примера, кавычки, пробелы) ломают вход без явной ошибки
  if (!BOT_TOKEN.test(env.TELEGRAM_BOT_TOKEN)) throw new Error('TELEGRAM_BOT_TOKEN не похож на токен BotFather (123456789:AA…): уберите скобки, кавычки и пробелы');
  return [
    { name: 'TELEGRAM_BOT_TOKEN', value: env.TELEGRAM_BOT_TOKEN },
    // Жаңа құпия ескі сессияларды жарамсыз етеді: қосымша келесі ашылғанда қайта кіреді
    { name: 'SESSION_SECRET', value: env.SESSION_SECRET || randomBytes(32).toString('hex') }
  ];
}

export async function setSecrets(opts: ManagementOpts, secrets: Secret[]): Promise<string[]> {
  await managementFetch(opts, '/secrets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(secrets) }, 'секреты');
  return secrets.map((s) => s.name);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = await setSecrets(envOpts(), buildSecrets(process.env));
  console.log(`Секреты заданы: ${names.join(', ')}`);
}
