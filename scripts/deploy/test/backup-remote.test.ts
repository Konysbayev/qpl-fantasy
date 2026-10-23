import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKUP_TABLES, backupRemote } from '../backup-remote.js';

describe('backupRemote', () => {
  it('выгружает каждую таблицу в свой JSON-файл и пишет сводку; таблицы из списка, без исходных страниц сайта', async () => {
    const queries: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const q = JSON.parse(String(init.body)).query as string;
      queries.push(q);
      const table = /from "?(\w+)"? t/.exec(q)?.[1];
      return new Response(JSON.stringify([{ rows: table === 'clubs' ? [{ id: 'c1', name_ru: 'Кайрат' }] : [] }]), { status: 201 });
    }) as typeof fetch;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    const summary = await backupRemote({ projectRef: 'abc', token: '', fetchImpl }, dir);

    expect(BACKUP_TABLES).toContain('squads');
    expect(BACKUP_TABLES).toEqual(expect.arrayContaining(['price_changes', 'notifications_sent', 'sync_state']));
    expect(BACKUP_TABLES).not.toContain('source_raw');
    expect(queries).toHaveLength(BACKUP_TABLES.length);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'clubs.json'), 'utf-8'))).toEqual([{ id: 'c1', name_ru: 'Кайрат' }]);
    expect(summary.clubs).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf-8')).clubs).toBe(1);
  });
});
