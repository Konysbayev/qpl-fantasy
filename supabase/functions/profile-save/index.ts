import { nowSec, secret, sql } from '../_shared/env.js';
import { profileSave } from './handler.js';

Deno.serve((req) => profileSave(req, { sql, sessionSecret: secret('SESSION_SECRET'), nowSec: nowSec() }));
