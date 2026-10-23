// Турлар арасындағы баға өзгерісі (спецификация 4.3): алдыңғы өзгерістен бергі таза сатып алулар бойынша, тур сайын бір рет.
import type postgres from 'postgres';
import { clampPrice, priceDelta } from '../../core/src/squad.js';

export async function applyPriceChanges(sql: postgres.Sql, seasonId: string, gameweekId: string, now: Date): Promise<{ changed: number } | null> {
  return sql.begin(async (tx) => {
    const [prev] = await tx<{ applied_at: Date }[]>`select pc.applied_at from price_changes pc join gameweeks g on g.id = pc.gameweek_id
      where g.season_id = ${seasonId} order by pc.applied_at desc limit 1`;
    // Жол алдымен жазылады: қатар келген екі шақырудың екіншісі ештеңе өзгертпейді
    const [claimed] = await tx`insert into price_changes (gameweek_id, applied_at, changed) values (${gameweekId}, ${now}, 0)
      on conflict (gameweek_id) do nothing returning gameweek_id`;
    if (!claimed) return null;

    const [season] = await tx<{ price_steps: [number, number][] }[]>`select price_steps from seasons where id = ${seasonId}`;
    const [{ managers }] = await tx<{ managers: number }[]>`select count(distinct s.user_id)::int as managers
      from squads s join gameweeks g on g.id = s.gameweek_id where g.season_id = ${seasonId}`;
    const since = prev?.applied_at ?? new Date(0);
    const moves = await tx<{ player_id: string; price: number; net: number }[]>`
      with m as (
        select t.player_in as player_id, 1 as d from transfers t join gameweeks g on g.id = t.gameweek_id
          where g.season_id = ${seasonId} and t.created_at > ${since} and t.created_at <= ${now}
        union all
        select t.player_out, -1 from transfers t join gameweeks g on g.id = t.gameweek_id
          where g.season_id = ${seasonId} and t.created_at > ${since} and t.created_at <= ${now}
      )
      select m.player_id, p.price, sum(m.d)::int as net from m join players p on p.id = m.player_id group by m.player_id, p.price`;

    let changed = 0;
    for (const m of moves) {
      const price = clampPrice(m.price + priceDelta(m.net, managers, { steps: season.price_steps }));
      if (price === m.price) continue;
      await tx`update players set price = ${price} where id = ${m.player_id}`;
      changed++;
    }
    await tx`update price_changes set changed = ${changed} where gameweek_id = ${gameweekId}`;
    return { changed };
  }) as Promise<{ changed: number } | null>;
}
