// Функцияларды жинап, Management API арқылы жариялайды. JWT-ті шлюз тексермейді: функциялар өз сессиясын тексереді.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFunctions } from './build-functions.js';
import { envOpts, managementFetch, type ManagementOpts } from './management.js';

export async function deployFunction(opts: ManagementOpts, name: string, bundle: string): Promise<unknown> {
  const form = new FormData();
  form.append('metadata', JSON.stringify({ name, entrypoint_path: 'index.js', verify_jwt: false }));
  form.append('file', new File([fs.readFileSync(bundle)], 'index.js', { type: 'application/javascript' }));
  const res = await managementFetch(opts, `/functions/deploy?slug=${encodeURIComponent(name)}`, { method: 'POST', body: form }, `функция ${name}`);
  return res.json();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = process.argv.slice(2);
  if (names.length === 0) throw new Error('Укажите функции: deploy-functions.ts health team-view …');
  const opts = envOpts();
  const bundles = await buildFunctions(names);
  for (const [i, name] of names.entries()) {
    await deployFunction(opts, name, bundles[i]);
    console.log(`выложено: ${name} (${path.relative(process.cwd(), bundles[i])})`);
  }
}
