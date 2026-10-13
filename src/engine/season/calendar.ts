// Season calendar templates, modelled on the real 2026 LoL esports season (dates from
// Leaguepedia). Each template becomes a Competition when a season is created; teams are
// resolved from `seedRule` when the competition starts.
import type { StageSpec } from './formats';

export interface Qualification { event: string; count: number; from?: number } // placements [from .. from+count)
export interface CompTemplate {
  id: string;            // unique within a season, e.g. 'LCK-r12'
  name: string;
  short: string;
  kind: 'league' | 'playoffs' | 'international' | 'cup' | 'qualifier';
  league?: string;
  region?: string;
  tier: number;
  start: string;         // MM-DD
  end: string;
  stages: StageSpec[];   // with MM-DD dates
  seedRule: string;      // see resolveSeeds()
  qualifies?: Qualification[];
  prizePool: number;     // USD
  prizeSplit?: number[];
  tags: string[];
  points?: boolean;      // contributes to combined standings (e.g. LCK rounds)
}

const RR = (id: string, name: string, start: string, end: string, bestOf: number, rounds = 1, extra: Partial<StageSpec> = {}): StageSpec =>
  ({ id, name, format: 'roundRobin', bestOf, start, end, rounds, ...extra });
const DE = (id: string, name: string, start: string, end: string, bestOf: number, extra: Partial<StageSpec> = {}): StageSpec =>
  ({ id, name, format: 'doubleElim', bestOf, start, end, finalBestOf: 5, ...extra });
const SE = (id: string, name: string, start: string, end: string, bestOf: number, extra: Partial<StageSpec> = {}): StageSpec =>
  ({ id, name, format: 'singleElim', bestOf, start, end, finalBestOf: 5, ...extra });

const WEEKEND = [0, 5, 6];
const LCK_DAYS = [0, 3, 4, 5, 6];
const LPL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Split + playoffs pair for a league. */
function split(league: string, key: string, name: string, tier: number, reg: [string, string], po: [string, string] | null, opts: {
  bo?: number; rounds?: number; poBo?: number; poSize?: number; poFormat?: 'doubleElim' | 'singleElim'; qualifies?: Qualification[]; prize?: number; tags?: string[]; days?: number[];
} = {}): CompTemplate[] {
  const out: CompTemplate[] = [{
    id: `${league}-${key}`, name: `${name}`, short: `${league} ${key.toUpperCase()}`, kind: 'league', league, tier, start: reg[0], end: reg[1],
    stages: [RR('rs', 'Regular Season', reg[0], reg[1], opts.bo ?? 1, opts.rounds ?? 1, { matchDays: opts.days })],
    seedRule: `league:${league}`, prizePool: po ? 0 : opts.prize ?? 0, tags: opts.tags ?? [], qualifies: po ? undefined : opts.qualifies,
  }];
  if (po) {
    const size = opts.poSize ?? 6;
    const fmt = opts.poFormat ?? 'doubleElim';
    out.push({
      id: `${league}-${key}-po`, name: `${name} Playoffs`, short: `${league} ${key.toUpperCase()} PO`, kind: 'playoffs', league, tier, start: po[0], end: po[1],
      stages: [fmt === 'doubleElim' ? DE('po', 'Playoffs', po[0], po[1], opts.poBo ?? 3, { matchDays: opts.days }) : SE('po', 'Playoffs', po[0], po[1], opts.poBo ?? 3, { matchDays: opts.days })],
      seedRule: `top:${league}-${key}:${size}`, prizePool: opts.prize ?? 0, tags: [...(opts.tags ?? []), 'playoffs'], qualifies: opts.qualifies,
    });
  }
  return out;
}

// ------------------------------------------------------------------ tier 1
const LCK: CompTemplate[] = [
  {
    id: 'LCK-cup', name: 'LCK Cup', short: 'LCK Cup', kind: 'cup', league: 'LCK', tier: 1, start: '01-14', end: '03-01',
    stages: [RR('grp', 'Group Battle', '01-14', '02-08', 3, 1, { matchDays: LCK_DAYS }), DE('po', 'Playoffs', '02-13', '03-01', 3, { matchDays: LCK_DAYS, seedsFrom: 'grp', advance: 6 } as Partial<StageSpec>)],
    seedRule: 'league:LCK', qualifies: [{ event: 'FST', count: 2 }], prizePool: 0, tags: ['split1'],
  },
  { id: 'LCK-r12', name: 'LCK Rounds 1-2', short: 'LCK R1-2', kind: 'league', league: 'LCK', tier: 1, start: '04-01', end: '05-31', stages: [RR('rs', 'Rounds 1-2', '04-01', '05-31', 3, 2, { matchDays: LCK_DAYS })], seedRule: 'league:LCK', prizePool: 0, tags: ['split2'], points: true },
  { id: 'LCK-rtm', name: 'LCK Road to MSI', short: 'Road to MSI', kind: 'playoffs', league: 'LCK', tier: 1, start: '06-06', end: '06-14', stages: [DE('po', 'Road to MSI', '06-06', '06-14', 5)], seedRule: 'top:LCK-r12:4', qualifies: [{ event: 'MSI', count: 2 }], prizePool: 0, tags: ['split2', 'playoffs'] },
  { id: 'LCK-r34', name: 'LCK Rounds 3-4', short: 'LCK R3-4', kind: 'league', league: 'LCK', tier: 1, start: '07-29', end: '08-23', stages: [RR('rs', 'Rounds 3-4', '07-29', '08-23', 3, 2, { matchDays: LCK_DAYS })], seedRule: 'league:LCK', prizePool: 0, tags: ['split3'], points: true },
  { id: 'LCK-po', name: 'LCK Season Playoffs', short: 'LCK Playoffs', kind: 'playoffs', league: 'LCK', tier: 1, start: '08-29', end: '09-13', stages: [DE('po', 'Season Playoffs', '08-29', '09-13', 5)], seedRule: 'combined:LCK-r12+LCK-r34:6', qualifies: [{ event: 'WORLDS', count: 4 }], prizePool: 0, tags: ['split3', 'playoffs', 'finals'] },
];

const LPL: CompTemplate[] = [
  ...split('LPL', 's1', 'LPL Split 1', 1, ['01-14', '02-07'], ['02-09', '03-08'], { bo: 3, poBo: 5, poSize: 8, qualifies: [{ event: 'FST', count: 2 }], days: LPL_DAYS, tags: ['split1'] }),
  ...split('LPL', 's2', 'LPL Split 2', 1, ['04-04', '05-17'], ['05-23', '06-14'], { bo: 3, poBo: 5, poSize: 8, qualifies: [{ event: 'MSI', count: 2 }], days: LPL_DAYS, tags: ['split2'] }),
  ...split('LPL', 's3', 'LPL Split 3', 1, ['07-22', '08-23'], ['08-28', '09-13'], { bo: 3, poBo: 5, poSize: 8, qualifies: [{ event: 'WORLDS', count: 3 }], days: LPL_DAYS, tags: ['split3', 'finals'] }),
  { id: 'LPL-rf', name: 'LPL Regional Finals', short: 'LPL Regionals', kind: 'qualifier', league: 'LPL', tier: 1, start: '09-17', end: '09-19', stages: [SE('rf', 'Regional Finals', '09-17', '09-19', 5)], seedRule: 'placements:LPL-s3-po:4:3', qualifies: [{ event: 'WORLDS', count: 1 }], prizePool: 0, tags: ['split3'] },
];

const LEC: CompTemplate[] = [
  ...split('LEC', 'versus', 'LEC Versus', 1, ['01-17', '02-08'], ['02-16', '03-01'], { bo: 1, poBo: 3, poSize: 8, qualifies: [{ event: 'FST', count: 1 }], days: WEEKEND, tags: ['split1'] }),
  ...split('LEC', 'spring', 'LEC Spring', 1, ['03-28', '05-10'], ['05-23', '06-07'], { bo: 3, poBo: 5, poSize: 6, qualifies: [{ event: 'MSI', count: 2 }], days: WEEKEND, tags: ['split2'] }),
  ...split('LEC', 'summer', 'LEC Summer', 1, ['07-24', '08-30'], ['09-05', '09-20'], { bo: 3, poBo: 5, poSize: 6, qualifies: [{ event: 'WORLDS', count: 3 }], days: WEEKEND, tags: ['split3', 'finals'] }),
];

const LCS: CompTemplate[] = [
  ...split('LCS', 'lockin', 'LCS Lock-In', 1, ['01-24', '02-15'], ['02-20', '03-01'], { bo: 1, poBo: 3, poSize: 4, qualifies: [{ event: 'FST', count: 1 }], days: WEEKEND, tags: ['split1'] }),
  ...split('LCS', 'spring', 'LCS Spring', 1, ['04-04', '05-17'], ['05-23', '06-14'], { bo: 1, rounds: 2, poBo: 5, poSize: 6, qualifies: [{ event: 'MSI', count: 2 }], days: WEEKEND, tags: ['split2'] }),
  ...split('LCS', 'summer', 'LCS Summer', 1, ['07-25', '09-06'], ['09-12', '10-04'], { bo: 1, rounds: 2, poBo: 5, poSize: 6, qualifies: [{ event: 'WORLDS', count: 2 }, { event: 'WORLDS-PI', count: 1, from: 2 }], days: WEEKEND, tags: ['split3', 'finals'] }),
  { id: 'LCS-promo', name: 'LCS Promotion', short: 'LCS Promotion', kind: 'qualifier', league: 'LCS', tier: 1, start: '10-05', end: '10-12', stages: [DE('promo', 'Promotion', '10-05', '10-12', 5)], seedRule: 'promotion:LCS:NACL', prizePool: 0, tags: ['promotion'] },
];

const LCP: CompTemplate[] = [
  ...split('LCP', 's1', 'LCP Split 1', 1, ['01-16', '02-08'], ['02-12', '03-01'], { bo: 3, poBo: 5, poSize: 6, qualifies: [{ event: 'FST', count: 1 }], days: WEEKEND, prize: 150_000, tags: ['split1'] }),
  ...split('LCP', 's2', 'LCP Split 2', 1, ['04-04', '05-17'], ['05-23', '06-07'], { bo: 3, poBo: 5, poSize: 6, qualifies: [{ event: 'MSI', count: 2 }], days: WEEKEND, prize: 200_000, tags: ['split2'] }),
  ...split('LCP', 's3', 'LCP Split 3', 1, ['07-25', '08-30'], ['09-03', '09-27'], { bo: 3, poBo: 5, poSize: 6, qualifies: [{ event: 'WORLDS', count: 1 }, { event: 'WORLDS-PI', count: 1, from: 1 }], days: WEEKEND, prize: 300_000, tags: ['split3', 'finals'] }),
  { id: 'LCP-promo', name: 'LCP Promotion', short: 'LCP Promotion', kind: 'qualifier', league: 'LCP', tier: 1, start: '11-17', end: '11-21', stages: [DE('promo', 'Promotion', '11-17', '11-21', 5)], seedRule: 'promotion:LCP:LJL,VCS,PCS', prizePool: 0, tags: ['promotion'] },
];

const CBLOL: CompTemplate[] = [
  ...split('CBLOL', 'cup', 'CBLOL Cup', 1, ['01-17', '02-15'], ['02-20', '03-01'], { bo: 1, poBo: 3, poSize: 4, qualifies: [{ event: 'FST', count: 1 }], days: WEEKEND, prize: 100_000, tags: ['split1'] }),
  ...split('CBLOL', 's1', 'CBLOL Split 1', 1, ['03-28', '05-03'], ['05-09', '06-06'], { bo: 1, rounds: 2, poBo: 5, poSize: 6, qualifies: [{ event: 'MSI', count: 1 }], days: WEEKEND, prize: 150_000, tags: ['split2'] }),
  ...split('CBLOL', 's2', 'CBLOL Split 2', 1, ['07-25', '08-30'], ['09-05', '10-10'], { bo: 1, rounds: 2, poBo: 5, poSize: 6, qualifies: [{ event: 'WORLDS', count: 1 }], days: WEEKEND, prize: 200_000, tags: ['split3', 'finals'] }),
  { id: 'CBLOL-promo', name: 'CBLOL Promotion', short: 'CBLOL Promotion', kind: 'qualifier', league: 'CBLOL', tier: 1, start: '10-12', end: '10-14', stages: [DE('promo', 'Promotion', '10-12', '10-14', 5)], seedRule: 'promotion:CBLOL:CD', prizePool: 0, tags: ['promotion'] },
];

// ------------------------------------------------------------------ tier 2 / 3
const LCKCL: CompTemplate[] = [
  ...split('LCKCL', 'kickoff', 'LCK CL Kickoff', 2, ['01-12', '02-20'], ['02-24', '03-03'], { bo: 3, poBo: 3, poSize: 4, prize: 30_000, days: LCK_DAYS }),
  { id: 'LCKCL-r12', name: 'LCK CL Rounds 1-2', short: 'CL R1-2', kind: 'league', league: 'LCKCL', tier: 2, start: '03-30', end: '05-29', stages: [RR('rs', 'Rounds 1-2', '03-30', '05-29', 3, 2, { matchDays: LCK_DAYS })], seedRule: 'league:LCKCL', prizePool: 0, tags: [], points: true },
  { id: 'LCKCL-r34', name: 'LCK CL Rounds 3-4', short: 'CL R3-4', kind: 'league', league: 'LCKCL', tier: 2, start: '07-27', end: '08-21', stages: [RR('rs', 'Rounds 3-4', '07-27', '08-21', 3, 2, { matchDays: LCK_DAYS })], seedRule: 'league:LCKCL', prizePool: 0, tags: [], points: true },
  { id: 'LCKCL-po', name: 'LCK CL Playoffs', short: 'CL Playoffs', kind: 'playoffs', league: 'LCKCL', tier: 2, start: '08-31', end: '09-15', stages: [DE('po', 'Season Playoffs', '08-31', '09-15', 5)], seedRule: 'combined:LCKCL-r12+LCKCL-r34:6', prizePool: 60_000, tags: ['playoffs', 'finals'] },
];

function regional(league: string, tier: number, name: string, splits: { key: string; label: string; reg: [string, string]; po: [string, string]; feeds?: string }[], opts: { bo?: number; poSize?: number; prize?: number } = {}): CompTemplate[] {
  return splits.flatMap((s) => split(league, s.key, `${name} ${s.label}`, tier, s.reg, s.po, {
    bo: opts.bo ?? 1, poBo: 3, poSize: opts.poSize ?? 4, prize: opts.prize ?? (tier === 2 ? 25_000 : 5_000), days: WEEKEND,
    qualifies: s.feeds ? [{ event: s.feeds, count: 1 }] : undefined, tags: s.feeds ? ['feeder'] : [],
  }));
}

const ERL_SPLITS = [
  { key: 'winter', label: 'Winter', reg: ['01-13', '02-22'] as [string, string], po: ['02-26', '03-08'] as [string, string] },
  { key: 'spring', label: 'Spring', reg: ['04-08', '05-17'] as [string, string], po: ['05-21', '06-03'] as [string, string], feeds: 'EM-spring' },
  { key: 'summer', label: 'Summer', reg: ['07-21', '08-23'] as [string, string], po: ['08-27', '09-13'] as [string, string], feeds: 'EM-summer' },
];
const TWO_SPLITS = (feed?: string) => [
  { key: 'spring', label: 'Spring', reg: ['03-26', '05-15'] as [string, string], po: ['05-20', '06-05'] as [string, string] },
  { key: 'summer', label: 'Summer', reg: ['07-16', '08-23'] as [string, string], po: ['08-27', '09-11'] as [string, string], feeds: feed },
];
const T3_SPLITS = [
  { key: 'spring', label: 'Spring', reg: ['03-02', '04-26'] as [string, string], po: ['04-30', '05-10'] as [string, string] },
  { key: 'summer', label: 'Summer', reg: ['07-06', '08-30'] as [string, string], po: ['09-03', '09-13'] as [string, string] },
];

export const ERL_LEAGUES = ['LFL', 'PRM', 'LES', 'TCL', 'NLC', 'RL', 'LIT', 'ROL', 'HLL', 'EBL', 'HM', 'LPLOL', 'AL'];

/** Leagues whose clubs are all academies of the league above (no promotion series or slot sales into them). */
export const ACADEMY_LEAGUES = new Set(['LCKCL', 'LCKAS']);

export function seasonTemplates(leagueIds: string[], leagueNames: Record<string, string>, parents: Record<string, string | undefined> = {}): CompTemplate[] {
  const t: CompTemplate[] = [...LCK, ...LPL, ...LEC, ...LCS, ...LCP, ...CBLOL, ...LCKCL];
  t.push(...regional('NACL', 2, 'NACL', TWO_SPLITS('LCS-promo'), { bo: 1, poSize: 6, prize: 50_000 }));
  t.push(...regional('CD', 2, 'Circuito Desafiante', TWO_SPLITS('CBLOL-promo'), { bo: 1, poSize: 6, prize: 30_000 }));
  for (const l of ['LJL', 'VCS', 'PCS']) if (leagueIds.includes(l)) t.push(...regional(l, 2, leagueNames[l] ?? l, TWO_SPLITS('LCP-promo'), { bo: 3, poSize: 4, prize: 60_000 }));
  for (const l of ERL_LEAGUES) if (leagueIds.includes(l)) t.push(...regional(l, 2, leagueNames[l] ?? l, ERL_SPLITS, { bo: 1, poSize: 4 }));
  for (const l of leagueIds) {
    if (t.some((x) => x.league === l)) continue;
    t.push(...regional(l, 3, leagueNames[l] ?? l, T3_SPLITS, { bo: 1, poSize: 4, prize: 5_000 }));
    // promotion series into the tier-2 league above: its last-placed team vs the top 3 of this league's summer playoffs
    const up = parents[l];
    if (up && leagueIds.includes(up) && !ACADEMY_LEAGUES.has(up) && !ACADEMY_LEAGUES.has(l)) {
      t.push({ id: `${l}-promo`, name: `${leagueNames[up] ?? up} Promotion`, short: `${leagueNames[up] ?? up} Promo`, kind: 'qualifier', league: up, tier: 2, start: '10-14', end: '10-18',
        stages: [DE('promo', 'Promotion', '10-14', '10-18', 3)], seedRule: `promotion:${up}:${l}`, prizePool: 0, tags: ['promotion'] });
    }
  }
  // ---------------- internationals
  t.push(
    {
      id: 'FST', name: 'First Stand', short: 'First Stand', kind: 'international', tier: 0, region: 'INTL', start: '03-16', end: '03-22',
      stages: [{ id: 'grp', name: 'Group Stage', format: 'gsl', bestOf: 5, start: '03-16', end: '03-20', groups: 2 }, SE('ko', 'Knockout Stage', '03-21', '03-22', 5, { seedsFrom: 'grp', advance: 4 } as Partial<StageSpec>)],
      seedRule: 'intl:FST', prizePool: 1_000_000, prizeSplit: [0.4, 0.2, 0.12, 0.12, 0.04, 0.04, 0.04, 0.04], tags: ['international', 'fst'],
    },
    {
      id: 'MSI', name: 'Mid-Season Invitational', short: 'MSI', kind: 'international', tier: 0, region: 'INTL', start: '06-28', end: '07-12',
      stages: [DE('pi', 'Play-In', '06-28', '07-01', 5), DE('br', 'Bracket Stage', '07-03', '07-12', 5, { seedsFrom: 'pi' } as Partial<StageSpec>)],
      seedRule: 'intl:MSI', prizePool: 2_000_000, prizeSplit: [0.3, 0.17, 0.1, 0.08, 0.06, 0.06, 0.045, 0.045, 0.03, 0.03, 0.03], tags: ['international', 'msi'],
    },
    {
      id: 'EWC', name: 'Esports World Cup', short: 'EWC', kind: 'international', tier: 0, region: 'INTL', start: '07-15', end: '07-19',
      stages: [{ id: 'grp', name: 'Group Stage', format: 'gsl', bestOf: 1, start: '07-15', end: '07-16', groups: 4 }, SE('ko', 'Playoffs', '07-17', '07-19', 3, { seedsFrom: 'grp', advance: 8 } as Partial<StageSpec>)],
      seedRule: 'intl:EWC', prizePool: 2_000_000, prizeSplit: [0.3, 0.15, 0.08, 0.08, 0.05, 0.05, 0.05, 0.05, 0.025, 0.025, 0.025, 0.025, 0.0125, 0.0125, 0.0125, 0.0125], tags: ['international', 'ewc'],
    },
    {
      id: 'KESPA', name: 'KeSPA Cup', short: 'KeSPA Cup', kind: 'cup', tier: 1, region: 'KR', league: 'LCK', start: '07-20', end: '08-18',
      stages: [{ id: 'grp', name: 'Group Stage', format: 'gsl', bestOf: 3, start: '07-20', end: '08-05', groups: 4 }, SE('ko', 'Playoffs', '08-10', '08-18', 3, { seedsFrom: 'grp', advance: 8 } as Partial<StageSpec>)],
      seedRule: 'kespa', prizePool: 200_000, tags: ['cup'],
    },
    {
      id: 'EM-spring', name: 'EMEA Masters Spring', short: 'EM Spring', kind: 'international', tier: 2, region: 'EMEA', start: '06-08', end: '06-15',
      stages: [{ id: 'grp', name: 'Group Stage', format: 'gsl', bestOf: 1, start: '06-08', end: '06-11', groups: 4 }, SE('ko', 'Bracket', '06-12', '06-15', 3, { seedsFrom: 'grp', advance: 8 } as Partial<StageSpec>)],
      seedRule: 'intl:EM-spring', prizePool: 150_000, tags: ['emea_masters'],
    },
    {
      id: 'EM-summer', name: 'EMEA Masters Summer', short: 'EM Summer', kind: 'international', tier: 2, region: 'EMEA', start: '09-26', end: '10-11',
      stages: [{ id: 'grp', name: 'Group Stage', format: 'gsl', bestOf: 1, start: '09-26', end: '10-01', groups: 4 }, SE('ko', 'Bracket', '10-03', '10-11', 3, { seedsFrom: 'grp', advance: 8 } as Partial<StageSpec>)],
      seedRule: 'intl:EM-summer', prizePool: 200_000, tags: ['emea_masters'],
    },
    {
      id: 'WORLDS', name: 'World Championship', short: 'Worlds', kind: 'international', tier: 0, region: 'INTL', start: '10-15', end: '11-14',
      stages: [
        SE('pi', 'Play-In', '10-15', '10-18', 5),
        { id: 'swiss', name: 'Swiss Stage', format: 'swiss', bestOf: 1, start: '10-23', end: '10-31', rounds: 5, advance: 1, seedsFrom: 'pi' },
        SE('ko', 'Knockout Stage', '11-03', '11-14', 5, { seedsFrom: 'swiss', advance: 8 } as Partial<StageSpec>),
      ],
      seedRule: 'intl:WORLDS', prizePool: 5_000_000, prizeSplit: [0.2, 0.14, 0.09, 0.09, 0.06, 0.06, 0.06, 0.06, 0.03, 0.03, 0.03, 0.03, 0.025, 0.025, 0.025, 0.025, 0.02], tags: ['international', 'worlds'],
    },
  );
  return t.filter((c) => !c.league || leagueIds.includes(c.league));
}

/** International slot allocation (region league id -> slots) used by intl seed rules. */
export const INTL_SLOTS: Record<string, Record<string, number>> = {
  FST: { LCK: 2, LPL: 2, LEC: 1, LCS: 1, LCP: 1, CBLOL: 1 },
  MSI: { LCK: 2, LPL: 2, LEC: 2, LCS: 2, LCP: 2, CBLOL: 1 },
  WORLDS: { LCK: 4, LPL: 4, LEC: 3, LCS: 2, LCP: 1, CBLOL: 1 },
  'WORLDS-PI': { LCS: 1, LCP: 1 },
};
