import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deployFunction } from '../deploy-functions.js';

describe('deployFunction', () => {
  it('выкладывает собранный файл через Management API без проверки JWT шлюзом', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dep-')), 'index.js');
    fs.writeFileSync(file, 'Deno.serve(() => new Response("ok"));');
    const calls: { url: string; method: string; form: FormData }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method), form: init.body as FormData });
      return new Response(JSON.stringify({ slug: 'health', version: 3 }), { status: 201 });
    }) as typeof fetch;

    const res = await deployFunction({ projectRef: 'abc', token: '', fetchImpl }, 'health', file);

    expect(res).toEqual({ slug: 'health', version: 3 });
    expect(calls[0].url).toBe('https://api.supabase.com/v1/projects/abc/functions/deploy?slug=health');
    expect(calls[0].method).toBe('POST');
    const metadata = JSON.parse(String(calls[0].form.get('metadata')));
    expect(metadata).toEqual({ name: 'health', entrypoint_path: 'index.js', verify_jwt: false });
    const sent = calls[0].form.get('file') as File;
    expect(sent.name).toBe('index.js');
    expect(await sent.text()).toContain('Deno.serve');
  });
});
