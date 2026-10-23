import { nowSec, secret, sql } from '../_shared/env.js';
import { leaderboard } from './handler.js';

Deno.serve((req) => leaderboard(req, { sql, sessionSecret: secret('SESSION_SECRET'), nowSec: nowSec() }));
