import { nowSec, secret, sql } from '../_shared/env.js';
import { teamView } from './handler.js';

Deno.serve((req) => teamView(req, { sql, sessionSecret: secret('SESSION_SECRET'), nowSec: nowSec() }));
