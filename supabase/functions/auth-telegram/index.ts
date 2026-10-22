import { nowSec, secret, sql } from '../_shared/env.js';
import { authTelegram } from './handler.js';

Deno.serve((req) => authTelegram(req, { sql, botToken: secret('TELEGRAM_BOT_TOKEN'), sessionSecret: secret('SESSION_SECRET'), nowSec: nowSec() }));
