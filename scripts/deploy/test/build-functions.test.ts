import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFunctions } from '../build-functions.js';

describe('buildFunctions', () => {
  it('собирает функцию в один файл: свои модули внутри, npm: остаётся внешним импортом', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-'));
    fs.mkdirSync(path.join(root, 'lib'));
    fs.writeFileSync(path.join(root, 'lib', 'double.ts'), 'export const double = (n: number): number => n * 2;\n');
    fs.mkdirSync(path.join(root, 'functions', 'demo'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'functions', 'demo', 'index.ts'),
      "import postgres from 'npm:postgres@3.4.7';\nimport { double } from '../../lib/double.js';\nexport const x: number = double(21);\nexport const pg = postgres;\n"
    );

    const out = await buildFunctions(['demo'], path.join(root, 'functions'));

    expect(out).toEqual([path.join(root, 'functions', 'demo', 'dist', 'index.js')]);
    const code = fs.readFileSync(out[0], 'utf-8');
    expect(code).toContain('from "npm:postgres@3.4.7"');
    expect(code).toContain('n * 2');
    expect(code).not.toContain('../../lib');
  });
});
