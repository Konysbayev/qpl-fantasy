// Құрамдар мен трансферлер серверде (спецификация 4.1, 4.3, 8): дедлайн, бюджет, клуб лимиті, айыппұл, Wildcard — бәрін сервер шешеді.
import type postgres from 'postgres';
import { canUseWildcard, nextFreeTransfers, transferPenalty, validateSquad, type SquadPlayer } from '../../core/src/squad.js';
import { isValidFormation } from '../../core/src/team-score.js';
import type { Position } from '../../core/src/types.js';

export type SquadFailure = 'deadline_passed' | 'invalid_squad' | 'invalid_lineup' | 'not_owned' | 'wildcard_unavailable' | 'no_open_gameweek';
export type Result<T> = { ok: true; value: T } | { ok: false; error: SquadFailure; details?: string[] };

export interface PickInput {
  playerId: string;
  slot: number;
  isCaptain: boolean;
  isVice: boolean;
}

export interface TransferRequest {
  requestId: string;
  // Клиент өзгертіп отырған тур: ол жабылып қалса — deadline_passed
  gameweek: number;
  out: string[];
  in: string[];
  wildcard: boolean;
}

export interface Gameweek {
  id: string;
  number: number;
  deadline: Date;
}

type Tx = postgres.TransactionSql;
type PlayerRow = { id: string; position: Position; club_id: string; price: number };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: SquadFailure, details?: string[]): Result<never> => (details ? { ok: false, error, details } : { ok: false, error });

// Транзакцияны кері қайтарып, нәтижені сыртқа шығару үшін
class Abort extends Error {
  constructor(readonly result: Result<never>) {
    super(result.ok ? '' : result.error);
  }
}

export async function activeSeasonId(sql: postgres.Sql | Tx): Promise<string | null> {
  const [s] = await sql<{ id: string }[]>`select id from seasons where status = 'active' order by year desc limit 1`;
  return s?.id ?? null;
}

export async function currentGameweek(sql: postgres.Sql | Tx, seasonId: string, now: Date): Promise<Gameweek | null> {
  const [g] = await sql<Gameweek[]>`select id, number, deadline from gameweeks
    where season_id = ${seasonId} and deadline > ${now} order by deadline limit 1`;
  return g ?? null;
}

export async function userHasSquad(sql: postgres.Sql, userId: string): Promise<boolean> {
  const seasonId = await activeSeasonId(sql);
  if (!seasonId) return false;
  const [r] = await sql`select 1 from squads s join gameweeks g on g.id = s.gameweek_id where s.user_id = ${userId} and g.season_id = ${seasonId} limit 1`;
  return Boolean(r);
}

async function openGameweek(sql: postgres.Sql, now: Date, gameweek: number): Promise<Result<Gameweek>> {
  const seasonId = await activeSeasonId(sql);
  const gw = seasonId ? await currentGameweek(sql, seasonId, now) : null;
  if (!gw) return fail('no_open_gameweek');
  if (gw.number !== gameweek) return fail('deadline_passed');
  return ok(gw);
}

export async function ensureSquad(sql: postgres.Sql, userId: string, gameweekId: string): Promise<string | null> {
  return sql.begin((tx) => ensureSquadTx(tx, userId, gameweekId));
}

// Жаңа тур ашылғанда құрам алдыңғысынан көшіріледі: банк сол, тегін трансфер +1 (ең көбі 5); өткізіп алған турлар да толтырылады
export async function ensureSquadTx(tx: Tx, userId: string, gameweekId: string): Promise<string | null> {
  const [existing] = await tx<{ id: string }[]>`select id from squads where user_id = ${userId} and gameweek_id = ${gameweekId}`;
  if (existing) return existing.id;
  const [target] = await tx<{ season_id: string; deadline: Date }[]>`select season_id, deadline from gameweeks where id = ${gameweekId}`;
  if (!target?.deadline) return null;
  const [prev] = await tx<{ id: string; bank: number; free_transfers: number; deadline: Date }[]>`
    select s.id, s.bank, s.free_transfers, g.deadline from squads s join gameweeks g on g.id = s.gameweek_id
    where s.user_id = ${userId} and g.season_id = ${target.season_id} and g.deadline < ${target.deadline}
    order by g.deadline desc limit 1`;
  if (!prev) return null;

  const between = await tx<{ id: string }[]>`select id from gameweeks where season_id = ${target.season_id}
    and deadline > ${prev.deadline} and deadline <= ${target.deadline} order by deadline`;
  let cur = { id: prev.id, bank: prev.bank, free_transfers: prev.free_transfers };
  for (const gw of between) {
    const [created] = await tx<typeof cur[]>`insert into squads (user_id, gameweek_id, bank, free_transfers)
      values (${userId}, ${gw.id}, ${cur.bank}, ${nextFreeTransfers(cur.free_transfers)})
      on conflict (user_id, gameweek_id) do nothing returning id, bank, free_transfers`;
    if (created) {
      await tx`insert into squad_picks (squad_id, player_id, slot, is_captain, is_vice)
        select ${created.id}, player_id, slot, is_captain, is_vice from squad_picks where squad_id = ${cur.id}`;
      cur = created;
    } else {
      [cur] = await tx<typeof cur[]>`select id, bank, free_transfers from squads where user_id = ${userId} and gameweek_id = ${gw.id}`;
    }
  }
  return cur.id;
}

// Негізгі 11 (1–11) және қосалқы (12–15): әр орын бір рет, схема дұрыс, капитан мен вице — негізгіде, әртүрлі
function lineupErrors(picks: PickInput[], positions: Map<string, Position>): string[] {
  const errors: string[] = [];
  const slots = picks.map((p) => p.slot).sort((a, b) => a - b);
  if (slots.length !== 15 || slots.some((s, i) => s !== i + 1)) errors.push('slots');
  const xi = picks.filter((p) => p.slot >= 1 && p.slot <= 11);
  if (!isValidFormation(xi.map((p) => positions.get(p.playerId)!))) errors.push('formation');
  const captains = picks.filter((p) => p.isCaptain);
  const vices = picks.filter((p) => p.isVice);
  if (captains.length !== 1 || vices.length !== 1 || captains[0] === vices[0] || !xi.includes(captains[0]) || !xi.includes(vices[0])) errors.push('captain');
  return errors;
}

async function loadPlayers(tx: Tx, ids: string[]): Promise<PlayerRow[]> {
  return tx<PlayerRow[]>`select id, position, club_id, price from players where id = any(${ids}::uuid[])`;
}

const asSquadPlayers = (rows: PlayerRow[]): SquadPlayer[] => rows.map((p) => ({ id: p.id, position: p.position, clubId: p.club_id, price: p.price }));

async function run<T>(sql: postgres.Sql, fn: (tx: Tx) => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return (await sql.begin(fn)) as Result<T>;
  } catch (err) {
    if (err instanceof Abort) return err.result;
    throw err;
  }
}

export async function createFirstSquad(sql: postgres.Sql, userId: string, now: Date, picks: PickInput[], gameweek: number): Promise<Result<{ squadId: string }>> {
  const open = await openGameweek(sql, now, gameweek);
  if (!open.ok) return open;
  const gw = open.value;
  return run(sql, async (tx) => {
    const [had] = await tx`select 1 from squads s join gameweeks g on g.id = s.gameweek_id
      join gameweeks cur on cur.id = ${gw.id} where s.user_id = ${userId} and g.season_id = cur.season_id limit 1`;
    if (had) return fail('invalid_squad', ['squad_exists']);

    const ids = [...new Set(picks.map((p) => p.playerId))];
    const players = await loadPlayers(tx, ids);
    if (ids.length !== picks.length || players.length !== ids.length) return fail('invalid_squad', ['size']);
    const squadErrors = validateSquad(asSquadPlayers(players));
    if (squadErrors.length > 0) return fail('invalid_squad', squadErrors);
    const lineup = lineupErrors(picks, new Map(players.map((p) => [p.id, p.position])));
    if (lineup.length > 0) return fail('invalid_lineup', lineup);

    const bank = 1000 - players.reduce((s, p) => s + p.price, 0);
    // Алғашқы тур шектеусіз, сондықтан тегін трансфер сақталмайды
    const [squad] = await tx<{ id: string }[]>`insert into squads (user_id, gameweek_id, bank, free_transfers)
      values (${userId}, ${gw.id}, ${bank}, 0) returning id`;
    await insertPicks(tx, squad.id, picks);
    return ok({ squadId: squad.id });
  });
}

async function insertPicks(tx: Tx, squadId: string, picks: PickInput[]): Promise<void> {
  for (const p of picks) {
    await tx`insert into squad_picks (squad_id, player_id, slot, is_captain, is_vice) values (${squadId}, ${p.playerId}, ${p.slot}, ${p.isCaptain}, ${p.isVice})`;
  }
}

export async function saveLineup(sql: postgres.Sql, userId: string, now: Date, picks: PickInput[], gameweek: number): Promise<Result<null>> {
  const open = await openGameweek(sql, now, gameweek);
  if (!open.ok) return open;
  return run(sql, async (tx) => {
    const squadId = await ensureSquadTx(tx, userId, open.value.id);
    if (!squadId) return fail('not_owned');
    await tx`select id from squads where id = ${squadId} for update`;
    const owned = new Set((await tx<{ player_id: string }[]>`select player_id from squad_picks where squad_id = ${squadId}`).map((r) => r.player_id));
    const sent = new Set(picks.map((p) => p.playerId));
    if (picks.length !== owned.size || sent.size !== owned.size || [...sent].some((id) => !owned.has(id))) return fail('not_owned');

    const players = await loadPlayers(tx, [...owned]);
    const lineup = lineupErrors(picks, new Map(players.map((p) => [p.id, p.position])));
    if (lineup.length > 0) return fail('invalid_lineup', lineup);
    await tx`delete from squad_picks where squad_id = ${squadId}`;
    await insertPicks(tx, squadId, picks);
    return ok(null);
  });
}

export async function commitTransfers(
  sql: postgres.Sql, userId: string, now: Date, req: TransferRequest
): Promise<Result<{ penalty: number; freeLeft: number; bank: number }>> {
  const open = await openGameweek(sql, now, req.gameweek);
  if (!open.ok) return open;
  const gw = open.value;
  type Value = { penalty: number; freeLeft: number; bank: number };
  return run<Value>(sql, async (tx) => {
    // Сол сұрау қайталанса (желі «жыпылықтаса») — бұрынғы нәтиже, жаңа есептен шығару жоқ
    const [fresh] = await tx`insert into transfer_requests (request_id, user_id, gameweek_id) values (${req.requestId}, ${userId}, ${gw.id})
      on conflict (request_id) do nothing returning request_id`;
    if (!fresh) {
      const [prev] = await tx<{ user_id: string; result: Result<Value> }[]>`select user_id, result from transfer_requests where request_id = ${req.requestId}`;
      return prev.user_id === userId ? prev.result : fail('invalid_squad', ['request_id']);
    }

    const result = await applyTransfers(tx, userId, gw, req);
    if (!result.ok) throw new Abort(result);
    await tx`update transfer_requests set result = ${tx.json(result as never)} where request_id = ${req.requestId}`;
    return result;
  });
}

async function applyTransfers(tx: Tx, userId: string, gw: Gameweek, req: TransferRequest): Promise<Result<{ penalty: number; freeLeft: number; bank: number }>> {
  const squadId = await ensureSquadTx(tx, userId, gw.id);
  if (!squadId) return fail('invalid_squad', ['no_squad']);
  const [squad] = await tx<{ bank: number; free_transfers: number; chip: string | null }[]>`
    select bank, free_transfers, chip from squads where id = ${squadId} for update`;

  const n = req.out.length;
  if (n === 0 || req.in.length !== n || new Set(req.out).size !== n || new Set(req.in).size !== n) return fail('invalid_squad', ['size']);
  const owned = (await tx<{ player_id: string }[]>`select player_id from squad_picks where squad_id = ${squadId}`).map((r) => r.player_id);
  if (req.out.some((id) => !owned.includes(id))) return fail('not_owned');
  if (req.in.some((id) => owned.includes(id))) return fail('invalid_squad', ['duplicate']);

  const players = await loadPlayers(tx, [...owned, ...req.in]);
  const byId = new Map(players.map((p) => [p.id, p]));
  if (req.in.some((id) => !byId.has(id))) return fail('invalid_squad', ['unknown_player']);
  if (req.out.some((id, i) => byId.get(id)!.position !== byId.get(req.in[i])!.position)) return fail('invalid_squad', ['positions']);

  // Сату — ағымдағы бағамен (спецификация 4.3)
  const after = owned.map((id) => byId.get(req.in[req.out.indexOf(id)] ?? id)!);
  const bank = squad.bank + req.out.reduce((s, id) => s + byId.get(id)!.price, 0) - req.in.reduce((s, id) => s + byId.get(id)!.price, 0);
  const errors = validateSquad(asSquadPlayers(after), Number.POSITIVE_INFINITY);
  if (bank < 0) errors.push('budget');
  if (errors.length > 0) return fail('invalid_squad', errors);

  const [first] = await tx<{ gameweek_id: string }[]>`select s.gameweek_id from squads s join gameweeks g on g.id = s.gameweek_id
    where s.user_id = ${userId} and g.season_id = (select season_id from gameweeks where id = ${gw.id}) order by g.deadline limit 1`;
  const unlimited = first.gameweek_id === gw.id;
  let chip = squad.chip;
  if (req.wildcard && chip !== 'wildcard' && !unlimited) {
    const used = await tx<{ number: number }[]>`select g.number from squads s join gameweeks g on g.id = s.gameweek_id
      where s.user_id = ${userId} and s.chip = 'wildcard' and g.season_id = (select season_id from gameweeks where id = ${gw.id})`;
    if (!canUseWildcard(gw.number, used.map((u) => u.number))) return fail('wildcard_unavailable');
    chip = 'wildcard';
  }

  const { penalty, freeLeft } = transferPenalty(n, { freeTransfers: squad.free_transfers, unlimited, wildcard: chip === 'wildcard' });
  // Ақылы трансферлер — соңғылары, әрқайсысы −4
  const paid = Math.round(-penalty / 4);
  for (const [i, out] of req.out.entries()) {
    const inn = req.in[i];
    await tx`update squad_picks set player_id = ${inn} where squad_id = ${squadId} and player_id = ${out}`;
    await tx`insert into transfers (user_id, gameweek_id, player_out, player_in, price_out, price_in, penalty)
      values (${userId}, ${gw.id}, ${out}, ${inn}, ${byId.get(out)!.price}, ${byId.get(inn)!.price}, ${i >= n - paid ? -4 : 0})`;
  }
  await tx`update squads set bank = ${bank}, free_transfers = ${freeLeft}, chip = ${chip} where id = ${squadId}`;
  return ok({ penalty, freeLeft, bank });
}
