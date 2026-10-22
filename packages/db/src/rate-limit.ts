// Сұрау жиілігі: минуттық терезеде кілт бойынша санайды; шектен асса — false. Ескі терезелер тазаланады.
import type postgres from 'postgres';

export async function hitRateLimit(sql: postgres.Sql, key: string, now: Date, limit: number): Promise<boolean> {
  const window = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const [row] = await sql<{ hits: number }[]>`insert into rate_limits (key, window_start, hits) values (${key}, ${window}, 1)
    on conflict (key, window_start) do update set hits = rate_limits.hits + 1 returning hits`;
  // Кейде (шамамен әр жүзінші сұрауда) бір сағаттан ескі жазбаларды өшіреміз
  if (row.hits === 1 && Math.random() < 0.01) await sql`delete from rate_limits where window_start < ${new Date(window.getTime() - 3_600_000)}`;
  return row.hits <= limit;
}
