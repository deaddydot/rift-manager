// Real pre-2026 honours, so the title-history reactions (legacy.ts) know that T1 arrive at Worlds 2026 chasing a
// four-peat, that Samsung swept SKT's 2017 three-peat bid, or that Viper already owns a ring from EDG.
// International finals are complete (Worlds 2011-2025, MSI 2015-2025, First Stand 2025); domestic data is limited
// to facts that are safe through 2025 (a last title or "never won it"), everything else is learned in-save.
// Team ids are the current organisations; `wAs` / `lAs` = the name they played under back then.

export type RealEv = 'worlds' | 'msi' | 'fst' | 'ewc';
export interface RealFinal { s: number; ev: RealEv; w: string | null; l: string | null; sc?: string; wAs?: string; lAs?: string; d?: string }

const W = (s: number, w: string | null, l: string | null, sc: string | undefined, d: string, wAs?: string, lAs?: string): RealFinal => ({ s, ev: 'worlds', w, l, sc, d, wAs, lAs });
const M = (s: number, w: string | null, l: string | null, sc: string, d: string, wAs?: string, lAs?: string): RealFinal => ({ s, ev: 'msi', w, l, sc, d, wAs, lAs });

export const REAL_FINALS: RealFinal[] = [
  W(2011, 'fnc-lec', null, undefined, '06-20', undefined, 'against All authority'),
  W(2012, null, null, '3-1', '10-13', 'Taipei Assassins', 'Azubu Frost'),
  W(2013, 't1-lck', null, '3-0', '10-04', 'SK Telecom T1', 'Royal Club'),
  W(2014, 'gen-lck', null, '3-1', '10-19', 'Samsung White', 'Star Horn Royal Club'),
  W(2015, 't1-lck', null, '3-1', '10-31', 'SK Telecom T1', 'KOO Tigers'),
  W(2016, 't1-lck', 'gen-lck', '3-2', '10-29', 'SK Telecom T1', 'Samsung Galaxy'),
  W(2017, 'gen-lck', 't1-lck', '3-0', '11-04', 'Samsung Galaxy', 'SK Telecom T1'),
  W(2018, 'ig-lpl', 'fnc-lec', '3-0', '11-03'),
  W(2019, null, 'g2-lec', '3-0', '11-10', 'FunPlus Phoenix'),
  W(2020, 'dk-lck', null, '3-1', '10-31', 'DAMWON Gaming', 'Suning'),
  W(2021, 'edg-lpl', 'dk-lck', '3-2', '11-06', undefined, 'DWG KIA'),
  W(2022, 'krx-lck', 't1-lck', '3-2', '11-05', 'DRX'),
  W(2023, 't1-lck', 'wbg-lpl', '3-0', '11-19'),
  W(2024, 't1-lck', 'blg-lpl', '3-2', '11-02'),
  W(2025, 't1-lck', 'kt-lck', '3-2', '11-09'),
  M(2015, 'edg-lpl', 't1-lck', '3-2', '05-10', undefined, 'SK Telecom T1'),
  M(2016, 't1-lck', null, '3-0', '05-15', 'SK Telecom T1', 'Counter Logic Gaming'),
  M(2017, 't1-lck', 'g2-lec', '3-1', '05-21', 'SK Telecom T1'),
  M(2018, null, 'krx-lck', '3-1', '05-20', 'Royal Never Give Up', 'Kingzone DragonX'),
  M(2019, 'g2-lec', 'tl-lcs', '3-0', '05-19'),
  M(2021, null, 'dk-lck', '3-2', '05-23', 'Royal Never Give Up', 'DWG KIA'),
  M(2022, null, 't1-lck', '3-2', '05-29', 'Royal Never Give Up'),
  M(2023, 'jdg-lpl', 'blg-lpl', '3-1', '05-21'),
  M(2024, 'gen-lck', 'blg-lpl', '3-1', '05-19'),
  M(2025, 'gen-lck', 't1-lck', '3-2', '07-12'),
  { s: 2025, ev: 'fst', w: 'hle-lck', l: 'kc-lec', sc: '3-1', d: '03-16' },
  { s: 2024, ev: 'ewc', w: 't1-lck', l: null },
];

/** Seasons in which each event was held before the save (MSI 2020 was cancelled). EWC is incomplete → no streak / first-ever claims. */
export const REAL_EDITIONS: Record<RealEv, number[]> = {
  worlds: Array.from({ length: 15 }, (_, i) => 2011 + i),
  msi: [2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025],
  fst: [2025],
  ewc: [],
};
/** Events whose real history is complete (safe for "first ever", droughts and streaks). */
export const REAL_COMPLETE: Record<string, boolean> = { worlds: true, msi: true, fst: true };

/** Domestic titles: only what is safe through 2025 — the last league title (and count) or "never won the league". */
export const REAL_DOMESTIC: Record<string, { last?: [number, string]; as?: string; count?: number; never?: boolean }> = {
  't1-lck': { last: [2022, 'LCK Spring'], count: 10 },
  'dk-lck': { last: [2021, 'LCK Summer'], as: 'DWG KIA', count: 3 },
  'kt-lck': { last: [2018, 'LCK Summer'] },
  'krx-lck': { last: [2018, 'LCK Spring'], as: 'Kingzone DragonX' },
  'fnc-lec': { last: [2018, 'EU LCS Summer'] },
  'ns-lck': { never: true }, 'bro-lck': { never: true }, 'dns-lck': { never: true }, 'bfx-lck': { never: true },
  'nip-lpl': { never: true }, 'tt-lpl': { never: true },
  'vit-lec': { never: true }, 'gx-lec': { never: true }, 'th-lec': { never: true }, 'sk-lec': { never: true }, 'navi-lec': { never: true },
  'sen-lcs': { never: true }, 'dig-lcs': { never: true }, 'sr-lcs': { never: true }, 'dsg-lcs': { never: true }, 'lyon-lcs': { never: true },
};

type T = [number, string | null][];
/** Personal international titles of players in the database (player id → event → [season, team id or null]). */
export const REAL_PLAYER_TITLES: Record<string, Partial<Record<RealEv, T>>> = {
  'p:Faker': { worlds: [[2013, 't1-lck'], [2015, 't1-lck'], [2016, 't1-lck'], [2023, 't1-lck'], [2024, 't1-lck'], [2025, 't1-lck']], msi: [[2016, 't1-lck'], [2017, 't1-lck']] },
  'p:Keria': { worlds: [[2023, 't1-lck'], [2024, 't1-lck'], [2025, 't1-lck']] },
  'p:Oner': { worlds: [[2023, 't1-lck'], [2024, 't1-lck'], [2025, 't1-lck']] },
  'p:Gumayusi': { worlds: [[2023, 't1-lck'], [2024, 't1-lck'], [2025, 't1-lck']] },
  'p:Zeus': { worlds: [[2023, 't1-lck'], [2024, 't1-lck']], fst: [[2025, 'hle-lck']] },
  'p:Doran (Choi Hyeon-jun)': { worlds: [[2025, 't1-lck']] },
  'p:Peyz': { msi: [[2024, 'gen-lck']] },
  'p:Chovy': { msi: [[2024, 'gen-lck'], [2025, 'gen-lck']] },
  'p:Canyon': { worlds: [[2020, 'dk-lck']], msi: [[2024, 'gen-lck'], [2025, 'gen-lck']] },
  'p:Kiin': { msi: [[2024, 'gen-lck'], [2025, 'gen-lck']] },
  'p:Ruler': { worlds: [[2017, 'gen-lck']], msi: [[2023, 'jdg-lpl'], [2025, 'gen-lck']] },
  'p:Duro': { msi: [[2025, 'gen-lck']] },
  'p:Lehends': { msi: [[2024, 'gen-lck']] },
  'p:Kingen': { worlds: [[2022, 'krx-lck']] },
  'p:Zeka (Kim Geon-woo)': { worlds: [[2022, 'krx-lck']], fst: [[2025, 'hle-lck']] },
  'p:ShowMaker': { worlds: [[2020, 'dk-lck']] },
  'p:Scout': { worlds: [[2021, 'edg-lpl']] },
  'p:Viper (Park Do-hyeon)': { worlds: [[2021, 'edg-lpl']], fst: [[2025, 'hle-lck']] },
  'p:Meiko': { worlds: [[2021, 'edg-lpl']] },
  'p:Jiejie': { worlds: [[2021, 'edg-lpl']] },
  'p:CoreJJ': { worlds: [[2017, 'gen-lck']] },
  'p:Rookie': { worlds: [[2018, 'ig-lpl']] },
  'p:TheShy': { worlds: [[2018, 'ig-lpl']] },
  'p:JackeyLove': { worlds: [[2018, 'ig-lpl']] },
  'p:Tian': { worlds: [[2019, null]] },
  'p:Crisp': { worlds: [[2019, null]] },
  'p:Caps': { msi: [[2019, 'g2-lec']] },
  'p:Wunder': { msi: [[2019, 'g2-lec']] },
  'p:Mikyx': { msi: [[2019, 'g2-lec']] },
  'p:GALA': { msi: [[2021, null], [2022, null]] },
  'p:Xiaohu': { msi: [[2018, null], [2021, null], [2022, null]] },
  'p:Wei (Yan Yang-Wei)': { msi: [[2021, null], [2022, null]] },
  'p:Breathe': { msi: [[2022, null]] },
  'p:Kanavi': { msi: [[2023, 'jdg-lpl']], fst: [[2025, 'hle-lck']] },
  'p:Knight (Zhuo Ding)': { msi: [[2023, 'jdg-lpl']] },
  'p:Delight': { fst: [[2025, 'hle-lck']] },
};
/** Names of clubs that are not in the database (for "won it with X" lines). */
export const PLAYER_TITLE_CLUB: Record<string, string> = { 'p:Tian': 'FunPlus Phoenix', 'p:Crisp': 'FunPlus Phoenix', 'p:GALA': 'RNG', 'p:Xiaohu': 'RNG', 'p:Wei (Yan Yang-Wei)': 'RNG', 'p:Breathe': 'RNG' };
