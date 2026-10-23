import { createPoliteFetcher } from '../../../packages/kffleague/src/fetcher.js';
import { telegramSender } from '../../../packages/db/src/notify.js';
import { recordRequest } from '../../../packages/db/src/sync.js';
import { secret, sql } from '../_shared/env.js';
import { cronTick } from './handler.js';

Deno.serve((req) =>
  cronTick(req, {
    sql,
    cronSecret: secret('CRON_SECRET'),
    now: new Date(),
    fetcher: (maxRequests) => createPoliteFetcher({ maxRequests, onRequest: () => recordRequest(sql) }),
    send: telegramSender(secret('TELEGRAM_BOT_TOKEN'), secret('APP_URL'))
  })
);
