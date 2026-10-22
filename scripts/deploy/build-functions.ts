// Серверлік функцияларды esbuild-пен бір файлға жинайды: Node стиліндегі импорттар (.js → .ts) Deno-ға түсінікті болады.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export const FUNCTIONS_DIR = path.join(import.meta.dirname, '..', '..', 'supabase', 'functions');

export async function buildFunctions(names: string[], dir: string = FUNCTIONS_DIR): Promise<string[]> {
  const out: string[] = [];
  for (const name of names) {
    const outfile = path.join(dir, name, 'dist', 'index.js');
    await build({
      entryPoints: [path.join(dir, name, 'index.ts')],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      // npm: пакеттерін Deno өзі жүктейді
      external: ['npm:*'],
      logLevel: 'warning'
    });
    out.push(outfile);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = process.argv.slice(2);
  if (names.length === 0) throw new Error('Укажите функции: build-functions.ts health team-view …');
  for (const f of await buildFunctions(names)) console.log(`собрано: ${path.relative(process.cwd(), f)}`);
}
