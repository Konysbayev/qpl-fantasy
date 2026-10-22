import { nowSec, secret, sql } from '../_shared/env.js';
import { squadSave } from './handler.js';

Deno.serve((req) => squadSave(req, { sql, sessionSecret: secret('SESSION_SECRET'), nowSec: nowSec() }));
