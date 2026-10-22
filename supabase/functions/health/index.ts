import { sql } from '../_shared/env.js';
import { health } from './handler.js';

Deno.serve(() =>
  health({ sql, secrets: { TELEGRAM_BOT_TOKEN: Deno.env.get('TELEGRAM_BOT_TOKEN'), SESSION_SECRET: Deno.env.get('SESSION_SECRET') }, now: new Date() })
);
