import { describe, expect, it } from 'vitest';
import { buildSecrets, setSecrets } from '../set-secrets.js';

const TOKEN = `123456789:${'A'.repeat(35)}`;

describe('set-secrets', () => {
  it('токен бота берётся из окружения, секрет сессии генерируется (64 hex), если не задан', () => {
    const s = buildSecrets({ TELEGRAM_BOT_TOKEN: TOKEN });
    expect(s.find((x) => x.name === 'TELEGRAM_BOT_TOKEN')?.value).toBe(TOKEN);
    expect(s.find((x) => x.name === 'SESSION_SECRET')?.value).toMatch(/^[0-9a-f]{64}$/);
    expect(buildSecrets({ TELEGRAM_BOT_TOKEN: TOKEN, SESSION_SECRET: 'fixed' }).find((x) => x.name === 'SESSION_SECRET')?.value).toBe('fixed');
  });

  it('без токена бота — ошибка, ничего не отправляется', () => {
    expect(() => buildSecrets({})).toThrow('TELEGRAM_BOT_TOKEN');
  });

  it('токен в скобках, кавычках или с пробелом — ошибка, а не тихо неверный секрет', () => {
    for (const bad of [`<${TOKEN}>`, `"${TOKEN}"`, ` ${TOKEN}`, `Bearer ${TOKEN}`, '123:ABC']) {
      expect(() => buildSecrets({ TELEGRAM_BOT_TOKEN: bad })).toThrow('BotFather');
    }
  });

  it('шлёт секреты одним запросом на /secrets; в ответе только имена, без значений', async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response('', { status: 201 });
    }) as typeof fetch;
    const names = await setSecrets({ projectRef: 'abc', token: '', fetchImpl }, [{ name: 'TELEGRAM_BOT_TOKEN', value: '123:ABC' }, { name: 'SESSION_SECRET', value: 'x'.repeat(64) }]);
    expect(calls[0].url).toBe('https://api.supabase.com/v1/projects/abc/secrets');
    expect(JSON.parse(calls[0].body)).toEqual([{ name: 'TELEGRAM_BOT_TOKEN', value: '123:ABC' }, { name: 'SESSION_SECRET', value: 'x'.repeat(64) }]);
    expect(names).toEqual(['TELEGRAM_BOT_TOKEN', 'SESSION_SECRET']);
  });
});
