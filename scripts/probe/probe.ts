// ҚПЛ бойынша API-Football-ты тексеретін зонд. Дискіге жазбайды: сырт әлеммен тек client пен onRaw арқылы байланысады.
import type { ApiFootballClient, ApiResult } from '../../packages/api-football/src/client.js';
import { assessFixture, findKpl, seasonCoverage, type FixtureAssessment, type SeasonCoverage } from '../../packages/api-football/src/coverage.js';
import type { FixtureEntry, LeagueEntry, StatusInfo, TeamPlayers } from '../../packages/api-football/src/types.js';

export interface ProbeFindings {
  account: { plan: string; requestsToday: number; limitDay: number } | null;
  league: { id: number; name: string } | null;
  seasons: SeasonCoverage[];
  target: { year: number; accessible: boolean; blockedBy?: 'plan' | 'other'; blockedMessage?: string };
  sampleSeason: number | null;
  fixturesInSeason: number;
  fixtures: FixtureAssessment[];
  live: { checked: boolean; liveNow: number; error?: string };
  requestsUsed: number;
  problems: string[];
}

export interface ProbeOptions {
  targetSeason: number;
  maxRequests: number;
  sampleFixtures: number;
  wait: () => Promise<void>;
  onRaw: (name: string, body: unknown) => void;
}

const FINISHED = new Set(['FT', 'AET', 'PEN']);

class LimitReached extends Error {}

// /status жауабында аккаунт иесінің аты мен email-і бар: оны сақталатын файлдарға жібермейміз
function withoutAccount(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const body = raw as { response?: unknown };
  if (!body.response || typeof body.response !== 'object' || Array.isArray(body.response) || !('account' in body.response)) return raw;
  const { account: _account, ...rest } = body.response as Record<string, unknown>;
  return { ...body, response: rest };
}

export function parseAllowedSeasons(message: string): { from: number; to: number } | null {
  const m = /from (\d{4}) to (\d{4})/i.exec(message);
  return m ? { from: Number(m[1]), to: Number(m[2]) } : null;
}

export async function runProbe(client: ApiFootballClient, opts: ProbeOptions): Promise<ProbeFindings> {
  const f: ProbeFindings = {
    account: null,
    league: null,
    seasons: [],
    target: { year: opts.targetSeason, accessible: false },
    sampleSeason: null,
    fixturesInSeason: 0,
    fixtures: [],
    live: { checked: false, liveNow: 0 },
    requestsUsed: 0,
    problems: []
  };

  // Әр сұраныс алдында лимитті тексеріп, үзіліс жасап, шикі жауапты сақтаймыз
  async function call<T>(name: string, path: string, params?: Record<string, string | number>): Promise<ApiResult<T>> {
    if (client.requestCount() >= opts.maxRequests) throw new LimitReached();
    if (client.requestCount() > 0) await opts.wait();
    const r = await client.get<T>(path, params);
    if (r.raw !== undefined) opts.onRaw(name, withoutAccount(r.raw));
    return r;
  }

  try {
    const status = await call<StatusInfo>('status', '/status');
    if (status.ok) {
      f.account = { plan: status.response.subscription.plan, requestsToday: status.response.requests.current, limitDay: status.response.requests.limit_day };
    } else {
      f.problems.push(`/status: ${status.message}`);
    }

    const leagues = await call<LeagueEntry[]>('leagues', '/leagues', { country: 'Kazakhstan' });
    if (!leagues.ok) {
      f.problems.push(`/leagues: ${leagues.message}`);
      return f;
    }
    const kpl = findKpl(leagues.response);
    if (!kpl) {
      f.problems.push('Премьер-лига Казахстана не найдена в ответе /leagues');
      return f;
    }
    f.league = { id: kpl.league.id, name: kpl.league.name };
    f.seasons = kpl.seasons
      .map((s) => seasonCoverage(kpl, s.year))
      .filter((s): s is SeasonCoverage => s !== undefined)
      .sort((a, b) => a.year - b.year);

    let list = await call<FixtureEntry[]>(`fixtures-${opts.targetSeason}`, '/fixtures', { league: kpl.league.id, season: opts.targetSeason });
    f.sampleSeason = opts.targetSeason;
    if (list.ok) {
      f.target.accessible = true;
    } else {
      f.target.blockedMessage = list.message;
      f.target.blockedBy = list.errorKey === 'plan' ? 'plan' : 'other';
      const allowed = list.errorKey === 'plan' ? parseAllowedSeasons(list.message) : null;
      f.sampleSeason = allowed?.to ?? null;
      if (!allowed) {
        f.problems.push(`/fixtures ${opts.targetSeason}: ${list.message}`);
        return f;
      }
      list = await call<FixtureEntry[]>(`fixtures-${allowed.to}`, '/fixtures', { league: kpl.league.id, season: allowed.to });
      if (!list.ok) {
        f.problems.push(`/fixtures ${allowed.to}: ${list.message}`);
        return f;
      }
    }
    f.fixturesInSeason = list.response.length;

    const sample = list.response
      .filter((x) => FINISHED.has(x.fixture.status.short))
      .sort((a, b) => b.fixture.date.localeCompare(a.fixture.date))
      .slice(0, opts.sampleFixtures);

    for (const item of sample) {
      const id = item.fixture.id;
      const detail = await call<FixtureEntry[]>(`fixture-${id}`, '/fixtures', { id });
      if (!detail.ok || detail.response.length === 0) {
        f.problems.push(`Матч ${id} пропущен: ${detail.ok ? 'пустой ответ' : detail.message}`);
        continue;
      }
      const players = await call<TeamPlayers[]>(`players-${id}`, '/fixtures/players', { fixture: id });
      if (!players.ok) f.problems.push(`Игроки матча ${id}: ${players.message}`);
      f.fixtures.push(assessFixture(detail.response[0], players.ok ? players.response : null));
    }

    const live = await call<FixtureEntry[]>('live', '/fixtures', { live: 'all' });
    f.live = live.ok
      ? { checked: true, liveNow: live.response.filter((x) => x.league?.id === kpl.league.id).length }
      : { checked: true, liveNow: 0, error: live.message };
  } catch (err) {
    if (!(err instanceof LimitReached)) throw err;
    f.problems.push(`Достигнут лимит запросов зонда (${opts.maxRequests})`);
  } finally {
    f.requestsUsed = client.requestCount();
  }
  return f;
}
