import { nowSec, secret, sql } from '../_shared/env.js';
import { transferCommit } from './handler.js';

Deno.serve((req) => transferCommit(req, { sql, sessionSecret: secret('SESSION_SECRET'), nowSec: nowSec() }));
