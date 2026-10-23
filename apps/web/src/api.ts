// Сервермен байланыс: кіру мен жеке деректер — функциялар арқылы (сессия токенімен), ашық деректер — REST арқылы (anon кілтпен).
import type { PickInput, Result, TeamView, TransferRequest, TransferResult } from '../../../packages/core/src/api-types.js';
import type { ClubKit, Position } from '../../../packages/core/src/types.js';
import type { Lang } from './i18n/useT.js';
import { tg } from './telegram.js';

export type { PickInput, Result, TeamView, TransferRequest, TransferResult };

export interface Session {
  token: string;
  user: { id: string; displayName: string; lang: Lang; notify: boolean; teamName: string | null };
}

export interface ClubRow {
  id: string;
  sourceId: number | null;
  nameRu: string;
  nameKz: string | null;
  code: string;
  logoUrl: string | null;
  kit: ClubKit | null;
}

export interface PlayerRow {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  clubId: string;
  price: number;
  status: string;
  points: number;
  minutes: number;
  selectedPct: number;
}

export interface SeasonStats {
  points: number;
  minutes: number;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  yellow: number;
  red: number;
}

export interface GameweekRow {
  id: string;
  number: number;
  deadline: string | null;
}

export interface FixtureRow {
  id: string;
  gameweek: number;
  kickoff: string;
  status: string;
  homeClubId: string;
  awayClubId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface PlayerMatchRow {
  gameweek: number;
  points: number;
  minutes: number;
  kickoff: string;
}

export type MatchEventKind = 'goal' | 'penalty_goal' | 'own_goal' | 'penalty_missed' | 'yellow' | 'second_yellow' | 'red' | 'sub';

export interface MatchEventRow {
  minute: number;
  kind: MatchEventKind;
  clubId: string;
  // «А. Фамилия»; ауыстыруда — кірген ойыншы
  player: string | null;
  // Гол — пас берген; ауыстыру — шыққан ойыншы
  other: string | null;
}

export interface LeaderRow {
  rank: number;
  teamName: string | null;
  gwPoints: number;
  total: number;
  me: boolean;
}

export interface Leaderboard {
  gameweek: number | null;
  status: string | null;
  total: number;
  rows: LeaderRow[];
  me: LeaderRow | null;
}

export const LEADERBOARD_PAGE = 50;

// Сервердің пән саласындағы қатесінен басқа: сессия жоқ немесе желі үзілді
export type ApiResult<T> = Result<T> | { ok: false; error: 'unauthorized' | 'network' | 'rate_limited' };

export interface ApiConfig {
  supabaseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
  initData: () => string;
  // Функция базамен бір аймақта іске қосылады: әйтпесе әр сұрау құрлықтар арқылы жүріп, экран секундтап күтеді
  functionRegion?: string;
}

type Raw = Record<string, unknown>;

export function createApi(config: ApiConfig) {
  const doFetch = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let token: string | null = null;

  async function rest<R>(path: string): Promise<R> {
    const res = await doFetch(`${config.supabaseUrl}/rest/v1/${path}`, { headers: { apikey: config.anonKey, authorization: `Bearer ${config.anonKey}` } });
    if (!res.ok) throw new Error(`REST ${path.split('?')[0]}: HTTP ${res.status}`);
    return (await res.json()) as R;
  }

  async function login(): Promise<Session> {
    const res = await send<Session>('auth-telegram', { method: 'POST', body: { initData: config.initData() } });
    if (res.status !== 200) throw new Error(`login: HTTP ${res.status}`);
    token = res.body.token;
    return res.body;
  }

  // Сессия мерзімі өтсе (401) — initData арқылы қайта кіріп, сұрауды бір рет қайталаймыз
  async function call<R>(name: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<{ status: number; body: R }> {
    const res = await send<R>(name, init);
    if (res.status !== 401 || !token) return res;
    try {
      await login();
    } catch {
      return res;
    }
    return send<R>(name, init);
  }

  async function send<R>(name: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<{ status: number; body: R }> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const url = new URL(`${config.supabaseUrl}/functions/v1/${name}`);
    if (config.functionRegion) url.searchParams.set('forceFunctionRegion', config.functionRegion);
    const res = await doFetch(url.toString(), {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as R };
  }

  async function command<T>(name: string, body: unknown): Promise<ApiResult<T>> {
    try {
      const res = await call<ApiResult<T> | null>(name, { method: 'POST', body });
      if (res.status === 401) return { ok: false, error: 'unauthorized' };
      if (res.body && typeof res.body === 'object' && 'ok' in res.body) return res.body;
      return { ok: false, error: 'network' };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  return {
    login,

    async teamView(): Promise<TeamView> {
      const res = await call<TeamView>('team-view', { method: 'GET' });
      if (res.status !== 200) throw new Error(`team-view: HTTP ${res.status}`);
      return res.body;
    },

    saveLineup(p: { gameweek: number; picks: PickInput[] }): Promise<ApiResult<unknown>> {
      return command('squad-save', p);
    },

    transfer(r: TransferRequest): Promise<ApiResult<TransferResult>> {
      return command('transfer-commit', r);
    },

    saveProfile(p: { lang?: Lang; notify?: boolean; teamName?: string }): Promise<ApiResult<{ lang: Lang; notify: boolean; teamName: string | null }>> {
      return command('profile-save', p);
    },

    async leaderboard(offset: number): Promise<Leaderboard> {
      const res = await call<Leaderboard>(`leaderboard?offset=${offset}&limit=${LEADERBOARD_PAGE}`, { method: 'GET' });
      if (res.status !== 200) throw new Error(`leaderboard: HTTP ${res.status}`);
      return res.body;
    },

    async clubs(): Promise<ClubRow[]> {
      const rows = await rest<Raw[]>('clubs?select=id,source_id,name_ru,name_kz,code,logo_url,kit&order=name_ru');
      return rows.map((r) => ({
        id: r.id as string, sourceId: (r.source_id as number | null) ?? null, nameRu: r.name_ru as string, nameKz: (r.name_kz as string | null) ?? null,
        code: (r.code as string | null) ?? '', logoUrl: (r.logo_url as string | null) ?? null, kit: (r.kit as ClubKit | null) ?? null
      }));
    },

    async players(): Promise<PlayerRow[]> {
      const [players, season, selection] = await Promise.all([
        rest<Raw[]>('players?select=id,first_name,last_name,position,club_id,price,status&status=neq.left'),
        rest<Raw[]>('player_season_stats?select=player_id,points,minutes'),
        rest<Raw[]>('player_selection?select=player_id,selected_pct')
      ]);
      const stats = new Map(season.map((s) => [s.player_id as string, s]));
      const pct = new Map(selection.map((s) => [s.player_id as string, s.selected_pct as number]));
      return players.map((p) => ({
        id: p.id as string, firstName: p.first_name as string, lastName: p.last_name as string, position: p.position as Position,
        clubId: p.club_id as string, price: p.price as number, status: p.status as string,
        points: (stats.get(p.id as string)?.points as number | undefined) ?? 0,
        minutes: (stats.get(p.id as string)?.minutes as number | undefined) ?? 0,
        selectedPct: pct.get(p.id as string) ?? 0
      }));
    },

    // Фото тек player_photo көрінісі арқылы: жалауша өшсе, бос (карточкада бос орын)
    async playerPhoto(playerId: string): Promise<string | null> {
      const [r] = await rest<Raw[]>(`player_photo?player_id=eq.${encodeURIComponent(playerId)}&select=url`);
      return (r?.url as string | undefined) ?? null;
    },

    async seasonStats(playerId: string): Promise<SeasonStats | null> {
      const [r] = await rest<Raw[]>(`player_season_stats?player_id=eq.${encodeURIComponent(playerId)}`);
      if (!r) return null;
      return {
        points: r.points as number, minutes: r.minutes as number, appearances: r.appearances as number, goals: r.goals as number,
        assists: r.assists as number, cleanSheets: r.clean_sheets as number, yellow: r.yellow as number, red: r.red as number
      };
    },

    async playerMatches(playerId: string): Promise<PlayerMatchRow[]> {
      const rows = await rest<Raw[]>(`player_match_stats?player_id=eq.${encodeURIComponent(playerId)}&select=points,minutes,fixtures!inner(kickoff,status,gameweeks!inner(number))&fixtures.status=eq.finished`);
      return rows.map((r) => {
        const f = r.fixtures as { kickoff: string; gameweeks: { number: number } };
        return { gameweek: f.gameweeks.number, points: r.points as number, minutes: r.minutes as number, kickoff: f.kickoff };
      }).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    },

    async gameweeks(): Promise<GameweekRow[]> {
      const rows = await rest<Raw[]>('gameweeks?select=id,number,deadline,seasons!inner(status)&seasons.status=eq.active&order=number');
      return rows.map((r) => ({ id: r.id as string, number: r.number as number, deadline: (r.deadline as string | null) ?? null }));
    },

    async matchEvents(fixtureId: string): Promise<MatchEventRow[]> {
      const rows = await rest<Raw[]>(`match_events?fixture_id=eq.${encodeURIComponent(fixtureId)}&select=minute,kind,club_id,player:player_id(first_name,last_name),other:other_player_id(first_name,last_name)&order=idx`);
      const name = (p: unknown) => {
        const n = p as { first_name: string | null; last_name: string } | null;
        if (!n) return null;
        return n.first_name ? `${n.first_name.trim()[0]}. ${n.last_name}` : n.last_name;
      };
      return rows.map((r) => ({ minute: r.minute as number, kind: r.kind as MatchEventKind, clubId: r.club_id as string, player: name(r.player), other: name(r.other) }));
    },

    async fixtures(gw?: number): Promise<FixtureRow[]> {
      const filter = gw === undefined ? '' : `&gameweeks.number=eq.${gw}`;
      const rows = await rest<Raw[]>(`fixtures?select=id,kickoff,status,home_club_id,away_club_id,home_score,away_score,gameweeks!inner(number,seasons!inner(status))&gameweeks.seasons.status=eq.active${filter}&order=kickoff`);
      return rows.map((r) => ({
        id: r.id as string, gameweek: (r.gameweeks as { number: number }).number, kickoff: r.kickoff as string, status: r.status as string,
        homeClubId: r.home_club_id as string, awayClubId: r.away_club_id as string,
        homeScore: (r.home_score as number | null) ?? null, awayScore: (r.away_score as number | null) ?? null
      }));
    }
  };
}

export type Api = ReturnType<typeof createApi>;

export const api: Api = createApi({
  supabaseUrl: (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? '',
  anonKey: (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  // Supabase жобасының аймағы (Сеул)
  functionRegion: (import.meta.env?.VITE_SUPABASE_FUNCTION_REGION as string | undefined) ?? 'ap-northeast-2',
  initData: () => tg().initData
});
