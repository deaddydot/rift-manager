// The extended trait catalogue (115 traits). Every trait carries a data-only effect profile (`fx`) that the
// generic consumers read — nothing here is flavour only:
//   • match engine  → sim/traitSim.ts (through sim/hidden.ts): rating deltas, performance rolls, in-game form, tilt
//   • quick sim     → management/traitEffects.ts `traitPower` (season/series.ts teamPowerFor)
//   • management    → management/traitEffects.ts (training, locker room, merch, sponsors, salaries, approaches)
//                     and management/personaTick.ts (streaming, media, travel, fatigue, morale, chemistry)
// `w` is the assignment weight (management/persona.ts) from attributes, hidden attributes and the personal profile.
// Only type imports here: traits.ts merges this table at load time.
import type { TraitDef } from './traits';
import type { HiddenAttributes, Player, PlayerAttributes, PlayerPersona, Role } from './types';

export type TraitGroup =
  | 'laning' | 'draft' | 'teamfight' | 'macro' | 'vision' | 'objectives' | 'pool' | 'clutch' | 'consistency' | 'health' | 'mental' | 'style'
  | 'roaming' | 'role' | 'training' | 'leadership' | 'media' | 'pro' | 'travel' | 'contract' | 'rivalry' | 'mentoring' | 'career';

export const TRAIT_GROUP_LABEL: Record<TraitGroup, string> = {
  laning: 'Laning', draft: 'Draft & matchups', teamfight: 'Teamfighting', macro: 'Macro', vision: 'Vision', objectives: 'Objectives', pool: 'Champion pool',
  clutch: 'Clutch & pressure', consistency: 'Consistency', health: 'Health & stamina', mental: 'Mental', style: 'Play style', roaming: 'Roaming', role: 'Role specialist',
  training: 'Training', leadership: 'Leadership & locker room', media: 'Media, fans & streaming', pro: 'Professionalism', travel: 'Travel & home', contract: 'Contracts & loyalty',
  rivalry: 'Rivalries', mentoring: 'Mentoring', career: 'Rookie & veteran',
};

/** Numeric sim ratings a trait can shift at game start (fields of SimPlayerInput). */
export type SimStat = 'mech' | 'lane' | 'farm' | 'tf' | 'macro' | 'vision' | 'pathing' | 'obj' | 'aggression' | 'consistency' | 'clutch' | 'shotcalling'
  | 'mastery' | 'farsight' | 'mistakes' | 'composure' | 'snowball' | 'resilience';

export interface TraitFx {
  // ---- match engine (sim/traitSim.ts) — perf values are multipliers around 1.0 (0.03 ≈ a clear, visible edge)
  in?: Partial<Record<SimStat, number>>;     // effective-rating deltas at game start
  perf?: number;                             // every game
  big?: number;                              // playoffs, finals, internationals
  small?: number;                            // all other matches
  sd?: number;                               // game-to-game variance multiplier
  floor?: boolean;                           // bad rolls are softened
  early?: number;                            // in-game form before 14:00
  late?: number;                             // after 28:00
  long?: number;                             // after 35:00
  closing?: number;                          // after 28:00 while the team is ahead
  behind?: number;                           // while behind (scaled by the deficit)
  tilt?: number;                             // death-tilt multiplier
  calm?: number;                             // tilt-recovery multiplier
  champ?: { arch: string[]; perf: number };  // champion archetype / class specialists
  meta?: number;                             // + on high-presence picks, − off-meta (negative: the reverse)
  mastery?: { lo?: number; hi?: number };    // comfort < 110 / comfort ≥ 160 (0..200 scale)
  matchup?: { bad?: number };                // × lane-matchup edge when counter-picked (+ softens, − amplifies)
  opp?: { stronger?: number; weaker?: number }; // opponents ≥ 3 rating points stronger / weaker
  contractYear?: number;                     // final contract year: rating lift (sim) and training bonus
  // ---- management (management/traitEffects.ts, management/personaTick.ts)
  train?: number;                            // training-gain multiplier delta (+0.1 = +10%)
  decline?: number;                          // aging-decline multiplier
  trainAge?: [number, number, number];       // [fromAge, toAge, delta] training bonus within an age band
  focus?: Partial<Record<keyof PlayerAttributes, number>>; // training weight multipliers per attribute
  learn?: number;                            // champion-learning speed delta
  youth?: number;                            // training delta for teammates under 22
  withMentor?: number;                       // training delta while a mentor / veteran is on the roster
  fatigue?: number;                          // weekly fatigue
  morale?: number;                           // weekly morale
  teamMorale?: number;                       // weekly morale for the whole roster
  chem?: number;                             // weekly team chemistry
  peace?: number;                            // weekly drama-heat reduction for all pairs (user club)
  trust?: number;                            // trust-in-manager baseline
  compat?: number;                           // locker-room compatibility with every teammate (-1..1 scale)
  foreign?: number;                          // compatibility with teammates from other countries
  sameRole?: number;                         // compatibility with teammates of the same role
  stream?: number;                           // stream-appeal points
  output?: number;                           // stream output multiplier (hours)
  merch?: number;                            // merch star power
  sponsor?: number;                          // sponsor appeal for the club
  media?: number;                            // weekly media tendency: + good press, − gaffes
  hype?: number;                             // weekly team hype (user club)
  rep?: number;                              // weekly reputation drift
  salary?: number;                           // asking-salary multiplier delta
  stay?: number;                             // re-signing discount with their own club
  home?: number;                             // weekly morale at a club in their home region
  abroad?: number;                           // weekly morale when playing abroad
  incident?: number;                         // weekly off-field incident weight
  incidentMul?: number;                      // incident weight multiplier
  approach?: Record<string, number>;         // multipliers on locker-room approach kinds (people.ts)
  travel?: number;                           // weekly fatigue during international events
  travelMorale?: number;                     // weekly morale during international events
  offRole?: number;                          // off-role penalty multiplier
}

/** What trait assignment looks at. */
export interface AssignCtx {
  p: Player; a: PlayerAttributes; h: HiddenAttributes; s: PlayerPersona;
  age: number; ovr: number; role: Role; rep: number; maxMastery: number;
}

export interface TraitSpec extends TraitDef { group: TraitGroup; fx: TraitFx; w: (x: AssignCtx) => number; excl?: string[] }

// assignment weight helpers: 1 at the threshold, +1 per 20 points above (or below), floor 0.05
const hi = (v: number, at: number) => Math.max(0.05, 1 + (v - at) / 20);
const lo = (v: number, at: number) => Math.max(0.05, 1 + (at - v) / 20);
const is = (x: AssignCtx, roles: Role[], other = 0) => (roles.includes(x.role) ? 1 : other);
const laner: Role[] = ['top', 'mid', 'adc'];

const mk = (kind: TraitDef['kind']) => (t: Omit<TraitSpec, 'kind'>): TraitSpec => ({ ...t, kind });
const pos = mk('positive'), neu = mk('neutral'), neg = mk('negative');

const LIST: TraitSpec[] = [
  // ------------------------------------------------------------------ laning
  pos({ id: 'lane_bully', name: 'Lane Bully', group: 'laning', desc: 'Punishes every misstep in lane: stronger laning and trades, extra edge in the first 14 minutes.',
    fx: { in: { lane: 4, aggression: 6 }, early: 0.015 }, w: (x) => hi(x.a.laning, 66) * hi(x.a.aggression, 55) * is(x, laner, 0.3), excl: ['passive_laner', 'slow_starter'] }),
  neu({ id: 'passive_laner', name: 'Passive Laner', group: 'laning', desc: 'Concedes pressure to farm safely: fewer lane mistakes and more CS, but rarely wins lane.',
    fx: { in: { lane: -3, farm: 3, mistakes: -4, aggression: -8 } }, w: (x) => lo(x.a.aggression, 45) * is(x, laner, 0.3), excl: ['lane_bully', 'lane_kingdom', 'bloodthirsty'] }),
  pos({ id: 'wave_whisperer', name: 'Wave Whisperer', group: 'laning', desc: 'Freezes, slow pushes and crash timings: more farm and better macro off the wave.',
    fx: { in: { farm: 3, macro: 2, lane: 1 } }, w: (x) => hi(x.a.farming, 64) * hi(x.a.macro, 62) * is(x, laner, 0.15) }),
  neg({ id: 'lane_drifter', name: 'Lane Drifter', group: 'laning', hidden: true, desc: 'Wanders off lane at the wrong times, bleeding CS and experience.',
    fx: { in: { farm: -4, lane: -2, pathing: 1 } }, w: (x) => lo(x.a.farming, 60) * lo(x.a.macro, 60) * is(x, laner), excl: ['lane_glued', 'wave_whisperer'] }),

  // ------------------------------------------------------------------ draft & matchups
  pos({ id: 'matchup_expert', name: 'Matchup Expert', group: 'draft', hidden: true, desc: 'Knows every matchup by heart: losing lane matchups hurt far less when counter-picked.',
    fx: { matchup: { bad: 0.25 } }, w: (x) => hi(x.a.adaptability, 64) * hi(x.a.laning, 62) * is(x, ['top', 'mid', 'adc', 'support']), excl: ['counterpick_victim'] }),
  neg({ id: 'counterpick_victim', name: 'Counter-Pick Victim', group: 'draft', hidden: true, desc: 'Falls apart in losing matchups: being counter-picked hurts twice as much.',
    fx: { matchup: { bad: -0.25 } }, w: (x) => lo(x.a.adaptability, 60) * is(x, ['top', 'mid', 'adc', 'support']), excl: ['matchup_expert'] }),
  neg({ id: 'draft_diva', name: 'Draft Diva', group: 'draft', hidden: true, desc: 'Sulks when not given their picks: plays worse on low-mastery champions and their morale slowly dips.',
    fx: { mastery: { lo: -0.02 }, morale: -0.2 }, w: (x) => hi(x.h.ego, 62), excl: ['team_player', 'flex_player'] }),

  // ------------------------------------------------------------------ teamfight
  pos({ id: 'frontline_anchor', name: 'Frontline Anchor', group: 'teamfight', desc: 'Holds the front line without flinching: better teamfighting and composure in fights.',
    fx: { in: { tf: 4, composure: 6 } }, w: (x) => hi(x.a.teamfight, 64) * is(x, ['top', 'jungle', 'support'], 0.15) }),
  pos({ id: 'backline_sniper', name: 'Backline Sniper', group: 'teamfight', desc: 'Finds the perfect angle from the back line: higher teamfight damage and positioning.',
    fx: { in: { tf: 3, mech: 2 } }, w: (x) => hi(x.a.teamfight, 65) * is(x, ['adc', 'mid'], 0.1) }),
  neg({ id: 'trigger_happy', name: 'Trigger Happy', group: 'teamfight', hidden: true, desc: 'Starts fights before the team is ready: far more aggression and costly mistakes.',
    fx: { in: { aggression: 12, mistakes: 8, tf: -2 } }, w: (x) => hi(x.a.aggression, 62) * lo(x.h.composure, 55), excl: ['calculated', 'survivor', 'patient_hunter'] }),
  pos({ id: 'peel_specialist', name: 'Peel Specialist', group: 'teamfight', desc: 'Protects the carries first: steadier teamfights and fewer picks on the back line.',
    fx: { in: { tf: 3, mistakes: -3 } }, w: (x) => hi(x.a.teamfight, 60) * is(x, ['support', 'top'], 0.1) }),

  // ------------------------------------------------------------------ macro
  pos({ id: 'map_reader', name: 'Map Reader', group: 'macro', desc: 'Always knows where the enemy jungler is: better macro and vision.',
    fx: { in: { macro: 4, vision: 2 } }, w: (x) => hi(x.a.macro, 67) }),
  neg({ id: 'autopilot', name: 'Autopilot', group: 'macro', hidden: true, desc: 'Switches off in long games: weaker macro and slipping performance after 28 minutes.',
    fx: { in: { macro: -3 }, late: -0.015 }, w: (x) => lo(x.a.macro, 58) * lo(x.h.workEthic, 58) * 0.6 }),
  pos({ id: 'side_lane_specialist', name: 'Side-Lane Specialist', group: 'macro', desc: 'Manages side waves late in the game: more farm, better macro and late-game impact.',
    fx: { in: { farm: 2, macro: 2 }, late: 0.01 }, w: (x) => is(x, laner) * hi(x.a.farming, 62) * hi(x.a.macro, 58) }),
  neu({ id: 'greedy_farmer', name: 'Greedy Farmer', group: 'macro', desc: 'Farms side waves while fights break out: more gold, weaker teamfights.',
    fx: { in: { farm: 4, tf: -2, macro: -1 } }, w: (x) => hi(x.a.farming, 62) * lo(x.a.teamfight, 66) * is(x, ['top', 'jungle', 'mid', 'adc']), excl: ['team_player'] }),

  // ------------------------------------------------------------------ vision
  pos({ id: 'control_warder', name: 'Control Ward Enjoyer', group: 'vision', desc: 'Never leaves base without control wards: better vision control.',
    fx: { in: { vision: 5 } }, w: (x) => hi(x.a.vision, 62), excl: ['blind_spot'] }),
  pos({ id: 'vision_denier', name: 'Vision Denier', group: 'vision', desc: 'Sweeps relentlessly — the enemy plays blind around objectives.',
    fx: { in: { vision: 4, macro: 1 } }, w: (x) => hi(x.a.vision, 63) * is(x, ['support', 'jungle'], 0.2), excl: ['blind_spot'] }),
  neg({ id: 'blind_spot', name: 'Blind Spot', group: 'vision', hidden: true, desc: 'Walks into unwarded territory: worse vision and more face-checks.',
    fx: { in: { vision: -5, mistakes: 4 } }, w: (x) => lo(x.a.vision, 58), excl: ['vision_wizard', 'control_warder', 'vision_denier'] }),

  // ------------------------------------------------------------------ objectives
  pos({ id: 'dragon_hunter', name: 'Dragon Hunter', group: 'objectives', desc: 'Prioritises every drake: better objective control and setup.',
    fx: { in: { obj: 5, aggression: 2 } }, w: (x) => hi(x.a.objectives, 63) * is(x, ['jungle', 'support', 'adc'], 0.3), excl: ['smite_nerves'] }),
  neg({ id: 'smite_nerves', name: 'Smite Nerves', group: 'objectives', hidden: true, desc: 'Loses smite duels and fumbles objective timers, worst of all on the big stage.',
    fx: { in: { obj: -6 }, big: -0.006 }, w: (x) => is(x, ['jungle']) * lo(x.h.composure, 55), excl: ['baron_thief', 'dragon_hunter'] }),
  neu({ id: 'baron_gambler', name: 'Baron Gambler', group: 'objectives', hidden: true, desc: 'Calls risky Barons: game-ending reads — or a thrown lead.',
    fx: { in: { farsight: 8, mistakes: 3 } }, w: (x) => hi(x.a.aggression, 55) * hi(x.h.farsight, 52) * is(x, ['jungle', 'support', 'mid'], 0.4) }),

  // ------------------------------------------------------------------ champion pool
  neu({ id: 'meta_chaser', name: 'Meta Chaser', group: 'pool', desc: 'Lives on the meta: better on high-presence champions, worse on off-meta picks.',
    fx: { meta: 0.02 }, w: (x) => hi(x.a.adaptability, 56), excl: ['pocket_picker'] }),
  neu({ id: 'pocket_picker', name: 'Pocket Picker', group: 'pool', desc: 'Brings surprise off-meta picks: stronger on niche champions, a touch weaker on meta ones.',
    fx: { meta: -0.02 }, w: (x) => hi(x.a.mechanics, 62) * 0.8, excl: ['meta_chaser'] }),
  neg({ id: 'comfort_zone', name: 'Comfort Zone', group: 'pool', desc: 'Struggles away from their best champions: clearly weaker on picks below pro-ready comfort (110).',
    fx: { mastery: { lo: -0.03, hi: 0.005 } }, w: (x) => lo(x.a.adaptability, 58), excl: ['champion_ocean', 'quick_study', 'flex_player'] }),
  pos({ id: 'quick_study', name: 'Quick Study', group: 'pool', desc: 'Learns champions fast: champion training 60% faster, less-practised picks hurt less.',
    fx: { learn: 0.6, mastery: { lo: 0.012 } }, w: (x) => hi(x.a.adaptability, 63) * hi(x.s.smarts, 50), excl: ['comfort_zone', 'one_trick'] }),
  pos({ id: 'signature_pick', name: 'Signature Pick', group: 'pool', desc: 'Plays their signature champions (comfort 160+) at an elite level.',
    fx: { mastery: { hi: 0.03 } }, w: (x) => (x.maxMastery >= 155 ? 1.1 : 0.15) }),
  pos({ id: 'flex_player', name: 'Flex Player', group: 'pool', desc: 'Comfortable on other roles: off-role penalties are halved.',
    fx: { offRole: 0.5, in: { mastery: 2 } }, w: (x) => hi(x.a.adaptability, 60) * (x.p.secondaryRoles?.length ? 2 : 0.35), excl: ['comfort_zone', 'one_trick', 'draft_diva'] }),

  // ------------------------------------------------------------------ clutch & pressure
  pos({ id: 'closer', name: 'Closer', group: 'clutch', desc: 'Ends games: plays up when the team is ahead after 28 minutes.',
    fx: { closing: 0.025 }, w: (x) => hi(x.a.clutch, 63) * hi(x.h.farsight, 52), excl: ['fails_to_close', 'throw_merchant'] }),
  neg({ id: 'fails_to_close', name: 'Fails to Close', group: 'clutch', hidden: true, desc: 'Gets nervous with the finish line in sight: plays down when ahead late in games.',
    fx: { closing: -0.025 }, w: (x) => lo(x.a.clutch, 58), excl: ['closer', 'game_ender'] }),
  pos({ id: 'clutch_gene', name: 'Clutch Gene', group: 'clutch', hidden: true, desc: 'Lives for the big moments: better composure and performance in playoffs and internationals.',
    fx: { big: 0.02, in: { clutch: 5 } }, w: (x) => hi(x.a.clutch, 67), excl: ['big_stage_nerves', 'regular_season_merchant', 'scrim_hero', 'wide_eyed'] }),
  neg({ id: 'regular_season_merchant', name: 'Regular-Season Merchant', group: 'clutch', hidden: true, desc: 'Shines in the regular season, fades when it matters most.',
    fx: { small: 0.012, big: -0.03 }, w: (x) => lo(x.a.clutch, 60), excl: ['ice_veins', 'clutch_gene'] }),
  pos({ id: 'never_say_die', name: 'Never Say Die', group: 'clutch', hidden: true, desc: 'Fights hardest when the team is far behind.',
    fx: { behind: 0.035 }, w: (x) => hi(x.h.resilience, 60) }),
  neu({ id: 'showman', name: 'Showman', group: 'clutch', desc: 'Plays to the crowd: lifts on the big stage and draws stream viewers, but forces the odd flashy play.',
    fx: { big: 0.012, stream: 8, in: { mistakes: 2 } }, w: (x) => hi(x.s.charisma, 60) * hi(x.h.ego, 52), excl: ['camera_shy'] }),

  // ------------------------------------------------------------------ consistency
  pos({ id: 'metronome', name: 'Metronome', group: 'consistency', desc: 'Ruthlessly consistent: much smaller swings from game to game.',
    fx: { sd: 0.6, in: { consistency: 3 } }, w: (x) => hi(x.a.consistency, 67), excl: ['coinflip'] }),
  neg({ id: 'slow_starter', name: 'Slow Starter', group: 'consistency', desc: 'Needs time to warm up: weaker before 14 minutes, slightly stronger late.',
    fx: { early: -0.025, late: 0.008 }, w: (x) => lo(x.a.laning, 62) * is(x, ['top', 'mid', 'adc', 'jungle'], 0.4), excl: ['fast_starter', 'lane_bully', 'early_jungler'] }),
  neu({ id: 'fast_starter', name: 'Fast Starter', group: 'consistency', desc: 'Explosive early game that fades: stronger before 14 minutes, weaker after 28.',
    fx: { early: 0.025, late: -0.012 }, w: (x) => hi(x.a.laning, 60), excl: ['slow_starter', 'scaling_adc', 'farming_jungler'] }),
  pos({ id: 'floor_raiser', name: 'Floor Raiser', group: 'consistency', hidden: true, desc: 'Never has a truly bad game: poor performances are softened.',
    fx: { floor: true }, w: (x) => hi(x.a.consistency, 63) * hi(x.h.composure, 55), excl: ['coinflip'] }),

  // ------------------------------------------------------------------ health & stamina
  pos({ id: 'endurance', name: 'Endurance', group: 'health', desc: 'Stays sharp in marathon games past 35 minutes.',
    fx: { long: 0.025 }, w: (x) => hi(x.s.stamina, 62), excl: ['low_stamina'] }),
  neg({ id: 'low_stamina', name: 'Low Stamina', group: 'health', hidden: true, desc: 'Concentration fades in very long games (35+ minutes) and fatigue builds faster.',
    fx: { long: -0.025, fatigue: 0.5 }, w: (x) => lo(x.s.stamina, 45), excl: ['endurance', 'iron_body', 'gym_rat'] }),
  neg({ id: 'wrist_issues', name: 'Wrist Issues', group: 'health', hidden: true, desc: 'Chronic wrist strain: wrist problems are three times as likely and mechanics suffer slightly.',
    fx: { in: { mech: -2 }, approach: { wrist: 3, wrist_worse: 1.5 } }, w: (x) => hi(x.h.injuryProne, 62) * 0.8, excl: ['iron_body'] }),
  pos({ id: 'iron_body', name: 'Iron Body', group: 'health', desc: 'Rarely hurt or sick: injury and illness problems are uncommon and fatigue recovers faster.',
    fx: { fatigue: -1, approach: { sick: 0.35, sick_worse: 0.35, wrist: 0.35, wrist_worse: 0.35, back: 0.35, burnout: 0.5, health: 0.5 } },
    w: (x) => lo(x.h.injuryProne, 42) * hi(x.s.stamina, 60), excl: ['wrist_issues', 'burnout_risk', 'low_stamina'] }),
  neg({ id: 'burnout_risk', name: 'Burnout Risk', group: 'health', hidden: true, desc: 'Pushes too hard for too long: extra weekly fatigue and burnout is far more likely.',
    fx: { fatigue: 1, approach: { burnout: 2.5 } }, w: (x) => hi(x.h.workEthic, 64) * lo(x.s.stamina, 55), excl: ['iron_body'] }),

  // ------------------------------------------------------------------ mental
  pos({ id: 'unshakeable', name: 'Unshakeable', group: 'mental', hidden: true, desc: 'Deaths don’t get to them: much less tilt and higher composure.',
    fx: { tilt: 0.45, in: { composure: 8 } }, w: (x) => hi(x.h.composure, 66), excl: ['tilter', 'rage_typer'] }),
  pos({ id: 'zen_master', name: 'Zen Master', group: 'mental', desc: 'Shakes off setbacks quickly: in-game tilt fades twice as fast.',
    fx: { calm: 2 }, w: (x) => hi(x.h.composure, 60) * hi(x.h.professionalism, 55), excl: ['hot_headed', 'rage_typer'] }),
  pos({ id: 'short_memory', name: 'Short Memory', group: 'mental', desc: 'Forgets bad games quickly: tilt fades faster and morale bounces back each week.',
    fx: { calm: 1.5, morale: 0.3 }, w: (x) => hi(x.h.resilience, 56) }),
  neg({ id: 'rage_typer', name: 'Rage Typer', group: 'mental', hidden: true, desc: 'Loses it in all-chat and comms: extra tilt, friction with teammates, the odd incident.',
    fx: { tilt: 1.35, compat: -0.06, incident: 0.008 }, w: (x) => lo(x.h.composure, 48) * hi(x.h.ego, 55), excl: ['zen_master', 'unshakeable', 'model_pro'] }),
  neg({ id: 'blame_shifter', name: 'Blame Shifter', group: 'mental', hidden: true, desc: 'Never their fault: hurts relationships and trust in the staff.',
    fx: { compat: -0.1, trust: -4 }, w: (x) => hi(x.h.ego, 62) * lo(x.h.professionalism, 56), excl: ['team_player', 'glue_guy', 'captain'] }),

  // ------------------------------------------------------------------ play style
  pos({ id: 'calculated', name: 'Calculated', group: 'style', desc: 'Takes only good risks: fewer punishable mistakes, lower aggression.',
    fx: { in: { mistakes: -6, aggression: -6 } }, w: (x) => lo(x.h.mistakes, 45) * hi(x.h.composure, 55), excl: ['trigger_happy', 'coinflip', 'bloodthirsty', 'overextender'] }),
  neu({ id: 'bloodthirsty', name: 'Bloodthirsty', group: 'style', desc: 'Hunts kills: more aggression and snowballing, more risk.',
    fx: { in: { aggression: 12, snowball: 6, mistakes: 4 } }, w: (x) => hi(x.a.aggression, 66), excl: ['calculated', 'passive_laner', 'patient_hunter'] }),
  pos({ id: 'patient_hunter', name: 'Patient Hunter', group: 'style', desc: 'Waits for the enemy to misstep, then strikes: fewer mistakes, stronger late.',
    fx: { in: { aggression: -5, mistakes: -4 }, late: 0.008 }, w: (x) => lo(x.a.aggression, 52) * hi(x.h.composure, 52), excl: ['trigger_happy', 'bloodthirsty'] }),
  neg({ id: 'overextender', name: 'Overextender', group: 'style', hidden: true, desc: 'Pushes one step too far, too often: frequent punishable mistakes.',
    fx: { in: { mistakes: 8, aggression: 4 } }, w: (x) => hi(x.a.aggression, 56) * lo(x.a.macro, 62), excl: ['survivor', 'calculated'] }),
  pos({ id: 'skirmisher', name: 'Skirmisher', group: 'style', desc: 'Thrives in 2v2s and 3v3s around the map: sharper mechanics in skirmishes.',
    fx: { in: { mech: 3, aggression: 5 } }, w: (x) => hi(x.a.mechanics, 67) * is(x, ['jungle', 'mid', 'top'], 0.35) }),

  // ------------------------------------------------------------------ roaming
  pos({ id: 'roam_timer', name: 'Roam Timer', group: 'roaming', desc: 'Perfectly timed roams after shoving the wave: better pathing and map impact.',
    fx: { in: { pathing: 5, macro: 1 } }, w: (x) => is(x, ['mid', 'support'], 0.15) * hi(x.a.pathing, 60), excl: ['lane_glued'] }),
  neu({ id: 'lane_glued', name: 'Lane-Glued', group: 'roaming', desc: 'Stays in lane no matter what: more farm, less map presence.',
    fx: { in: { pathing: -5, farm: 3, lane: 1 } }, w: (x) => is(x, laner) * lo(x.a.pathing, 58), excl: ['roam_timer', 'roaming_menace', 'lane_drifter'] }),
  pos({ id: 'counter_ganker', name: 'Counter-Ganker', group: 'roaming', desc: 'Tracks the enemy jungler and punishes every gank; steadier when behind.',
    fx: { in: { pathing: 3, vision: 2 }, behind: 0.01 }, w: (x) => is(x, ['jungle'], 0.15) * hi(x.a.pathing, 62) }),

  // ------------------------------------------------------------------ role specialists
  pos({ id: 'tank_specialist', name: 'Tank Specialist', group: 'role', desc: 'Elite on tanks, vanguards and wardens (performance boost on those champions).',
    fx: { champ: { arch: ['tank', 'vanguard', 'warden', 'engage_tank'], perf: 0.03 } }, w: (x) => is(x, ['top', 'support', 'jungle']) * lo(x.a.aggression, 62) }),
  pos({ id: 'bruiser_enjoyer', name: 'Bruiser Enjoyer', group: 'role', desc: 'Lives on juggernauts, divers and skirmishers (performance boost on bruisers).',
    fx: { champ: { arch: ['juggernaut', 'diver', 'skirmisher'], perf: 0.025 } }, w: (x) => is(x, ['top', 'jungle'], 0.05) * hi(x.a.aggression, 50) }),
  pos({ id: 'enchanter_specialist', name: 'Enchanter Specialist', group: 'role', desc: 'Peerless on enchanters — shields and heals at the perfect moment (performance boost on enchanters).',
    fx: { champ: { arch: ['enchanter'], perf: 0.035 } }, w: (x) => is(x, ['support']) * lo(x.a.aggression, 58) }),
  pos({ id: 'playmaker_support', name: 'Playmaker Support', group: 'role', desc: 'Hooks, flashes and engages that start fights (performance boost on catchers and engage supports).',
    fx: { champ: { arch: ['catcher', 'engage_tank'], perf: 0.03 } }, w: (x) => is(x, ['support']) * hi(x.a.aggression, 52) }),
  pos({ id: 'assassin_main', name: 'Assassin Main', group: 'role', desc: 'Assassins are their identity (performance boost on assassins).',
    fx: { champ: { arch: ['assassin'], perf: 0.035 } }, w: (x) => is(x, ['mid', 'jungle'], 0.05) * hi(x.a.mechanics, 63) }),
  pos({ id: 'control_mage', name: 'Control Mage Specialist', group: 'role', desc: 'Masters control, artillery and burst mages (performance boost on mages).',
    fx: { champ: { arch: ['control_mage', 'artillery', 'burst_mage', 'battlemage'], perf: 0.025 } }, w: (x) => is(x, ['mid'], 0.1) * lo(x.a.aggression, 62) }),
  pos({ id: 'early_jungler', name: 'Early-Game Jungler', group: 'role', desc: 'Plays for the first 14 minutes: sharper pathing and early pressure, fades later.',
    fx: { in: { pathing: 3 }, early: 0.03, late: -0.01 }, w: (x) => is(x, ['jungle']) * hi(x.a.aggression, 52), excl: ['farming_jungler', 'slow_starter'] }),
  neu({ id: 'farming_jungler', name: 'Farming Jungler', group: 'role', desc: 'Power-farms to scale: more gold, fewer early ganks, stronger late.',
    fx: { in: { farm: 5, pathing: -3 }, late: 0.012 }, w: (x) => is(x, ['jungle']) * lo(x.a.aggression, 56), excl: ['early_jungler', 'fast_starter'] }),
  pos({ id: 'scaling_adc', name: 'Scaling ADC', group: 'role', desc: 'A late-game hyper-carry: slightly weaker early, much stronger after 28 minutes (extra on hyper-carries).',
    fx: { early: -0.01, late: 0.03, champ: { arch: ['hypercarry_adc'], perf: 0.01 } }, w: (x) => is(x, ['adc']) * hi(x.a.farming, 60), excl: ['fast_starter'] }),

  // ------------------------------------------------------------------ training
  pos({ id: 'gym_rat', name: 'Gym Rat', group: 'training', desc: 'Lives in the gym: recovers from fatigue faster and trains a little better.',
    fx: { fatigue: -2, train: 0.04 }, w: (x) => hi(x.s.stamina, 56) * hi(x.h.professionalism, 52), excl: ['low_stamina', 'late_sleeper'] }),
  pos({ id: 'vod_addict', name: 'VOD Addict', group: 'training', desc: 'Reviews every game: macro, vision and shotcalling grow faster in training.',
    fx: { train: 0.04, focus: { macro: 1.6, vision: 1.6, shotcalling: 1.3 } }, w: (x) => hi(x.s.smarts, 58) * hi(x.h.workEthic, 56) }),
  neu({ id: 'soloq_warrior', name: 'Solo Queue Warrior', group: 'training', desc: 'Grinds solo queue all night: mechanics and laning grow faster, macro slower, more fatigue.',
    fx: { focus: { mechanics: 1.6, laning: 1.3, macro: 0.6 }, fatigue: 1 }, w: (x) => hi(x.a.mechanics, 62) * hi(x.h.workEthic, 52) }),
  neu({ id: 'scrim_hero', name: 'Scrim Hero', group: 'training', hidden: true, desc: 'A monster in scrims: trains 10% better, but plays slightly worse on the big stage.',
    fx: { train: 0.1, big: -0.015 }, w: (x) => lo(x.a.clutch, 62) * hi(x.h.workEthic, 56), excl: ['clutch_gene', 'ice_veins'] }),
  neg({ id: 'late_sleeper', name: 'Late Sleeper', group: 'training', desc: 'Keeps a nocturnal schedule: trains 8% worse and tires faster — but late-night streams pull viewers.',
    fx: { train: -0.08, fatigue: 1.5, stream: 5 }, w: (x) => lo(x.h.professionalism, 58) * (x.p.streamer ? 1.4 : 0.7), excl: ['gym_rat', 'model_pro'] }),
  neg({ id: 'coasting', name: 'Coasting', group: 'training', hidden: true, desc: 'Does the minimum in practice: training gains 20% lower.',
    fx: { train: -0.2, decline: 1.15 }, w: (x) => lo(x.h.workEthic, 50), excl: ['grinder', 'prodigy', 'gym_rat', 'vod_addict'] }),
  pos({ id: 'late_bloomer', name: 'Late Bloomer', group: 'training', hidden: true, desc: 'Keeps improving after most peak: +30% training gains from 22 to 26 and a gentler decline.',
    fx: { trainAge: [22, 26, 0.3], decline: 0.5 }, w: (x) => (x.age >= 18 && x.age < 26 ? 1 : 0) * hi(x.h.workEthic, 55), excl: ['early_peak'] }),
  neg({ id: 'early_peak', name: 'Early Peak', group: 'training', hidden: true, desc: 'Peaks early and declines sooner: 40% steeper decline and weaker gains after 24.',
    fx: { decline: 1.4, trainAge: [24, 99, -0.15] }, w: (x) => (x.age >= 19 ? 1 : 0.3) * lo(x.h.workEthic, 55), excl: ['late_bloomer'] }),

  // ------------------------------------------------------------------ leadership & locker room
  pos({ id: 'glue_guy', name: 'Glue Guy', group: 'leadership', desc: 'Holds the locker room together: better relationships with everyone and steady chemistry gains.',
    fx: { compat: 0.12, chem: 0.15 }, w: (x) => hi(x.s.humor, 56) * hi(x.s.charisma, 52) * lo(x.h.ego, 55), excl: ['toxic_presence', 'blame_shifter'] }),
  neg({ id: 'toxic_presence', name: 'Toxic Presence', group: 'leadership', hidden: true, desc: 'Poisons the atmosphere: worse relationships, slowly eroding chemistry, more incidents.',
    fx: { compat: -0.15, chem: -0.2, incident: 0.01 }, w: (x) => hi(x.h.ego, 66) * lo(x.h.professionalism, 50) * 0.7, excl: ['glue_guy', 'captain', 'peacemaker', 'model_pro', 'team_player'] }),
  pos({ id: 'captain', name: 'Captain', group: 'leadership', desc: 'The natural leader: better shotcalling, a happier squad, staff trust and steady chemistry.',
    fx: { in: { shotcalling: 3 }, chem: 0.2, teamMorale: 0.25, compat: 0.04, trust: 3 }, w: (x) => hi(x.a.shotcalling, 64) * hi(x.s.charisma, 58) * (x.age >= 21 ? 1 : 0.25), excl: ['toxic_presence', 'blame_shifter', 'silent_comms'] }),
  neu({ id: 'class_clown', name: 'Class Clown', group: 'leadership', desc: 'The joker of the team house: great for chemistry and streams, a little distracting in practice.',
    fx: { compat: 0.06, chem: 0.08, stream: 6, train: -0.03 }, w: (x) => hi(x.s.humor, 64) }),
  pos({ id: 'coachable', name: 'Coachable', group: 'leadership', desc: 'Takes feedback well: trusts the staff more and gets 6% more from training.',
    fx: { trust: 6, train: 0.06 }, w: (x) => hi(x.h.professionalism, 58) * lo(x.h.ego, 55), excl: ['stubborn'] }),
  neg({ id: 'stubborn', name: 'Stubborn', group: 'leadership', desc: 'Does it their way: lower trust in the staff and 5% lower training gains.',
    fx: { trust: -6, train: -0.05 }, w: (x) => hi(x.h.ego, 61), excl: ['coachable'] }),
  pos({ id: 'team_player', name: 'Team Player', group: 'leadership', desc: 'Puts the team first: better relationships and rarely complains about playing time.',
    fx: { compat: 0.06, chem: 0.08, approach: { playtime: 0.5 } }, w: (x) => lo(x.h.ego, 48), excl: ['carry_mentality', 'blame_shifter', 'draft_diva', 'toxic_presence', 'greedy_farmer'] }),
  pos({ id: 'peacemaker', name: 'Peacemaker', group: 'leadership', desc: 'Defuses conflicts: locker-room drama cools down much faster while they are around.',
    fx: { peace: 5, compat: 0.04 }, w: (x) => hi(x.h.composure, 58) * hi(x.s.charisma, 50) * lo(x.h.ego, 55), excl: ['toxic_presence', 'hot_headed'] }),
  pos({ id: 'comms_leader', name: 'Comms Leader', group: 'leadership', desc: 'Clear, calm voice comms: better shotcalling lifts the whole team’s macro.',
    fx: { in: { shotcalling: 4 } }, w: (x) => hi(x.s.comms, 63), excl: ['silent_comms'] }),
  neg({ id: 'silent_comms', name: 'Silent Comms', group: 'leadership', desc: 'Barely talks in game: weaker shotcalling and coordination.',
    fx: { in: { shotcalling: -4, macro: -1 } }, w: (x) => lo(x.s.comms, 42), excl: ['comms_leader', 'shotcaller', 'captain'] }),

  // ------------------------------------------------------------------ media, fans & streaming
  pos({ id: 'content_machine', name: 'Content Machine', group: 'media', desc: 'Streams and posts constantly: 50% more stream output and appeal, a little extra fatigue.',
    fx: { output: 1.5, stream: 8, fatigue: 0.5 }, w: (x) => (x.p.streamer ? 2 : 0.25) * hi(x.s.online, 58), excl: ['camera_shy'] }),
  neg({ id: 'camera_shy', name: 'Camera Shy', group: 'media', desc: 'Uncomfortable on camera: streams draw half the audience, weaker sponsor appeal and media presence.',
    fx: { output: 0.5, stream: -8, sponsor: -0.03, media: -1 }, w: (x) => lo(x.s.charisma, 47) * lo(x.s.online, 50), excl: ['content_machine', 'showman', 'meme_lord', 'heartthrob', 'media_darling', 'brand_ambassador'] }),
  neu({ id: 'meme_lord', name: 'Meme Lord', group: 'media', desc: 'Every stream becomes a meme: a big boost to stream appeal and hype, the odd controversy.',
    fx: { stream: 12, hype: 0.2, incident: 0.004 }, w: (x) => hi(x.s.humor, 61) * hi(x.s.online, 55), excl: ['camera_shy'] }),
  pos({ id: 'heartthrob', name: 'Heartthrob', group: 'media', desc: 'A fan magnet: sells signature merch, draws stream viewers and sponsors.',
    fx: { stream: 10, merch: 1.2, sponsor: 0.03 }, w: (x) => hi(x.s.looks, 70) * hi(x.s.style, 50) * 0.9, excl: ['camera_shy'] }),
  pos({ id: 'media_darling', name: 'Media Darling', group: 'media', desc: 'Great in interviews: positive press, sponsor appeal and a slowly rising reputation.',
    fx: { media: 2, sponsor: 0.04, rep: 0.15 }, w: (x) => hi(x.s.media, 63) * hi(x.s.charisma, 55), excl: ['foot_in_mouth', 'camera_shy'] }),
  neg({ id: 'foot_in_mouth', name: 'Foot-in-Mouth', group: 'media', hidden: true, desc: 'Says the wrong thing on stream and in interviews: press controversies and fan backlash.',
    fx: { media: -2, incident: 0.012 }, w: (x) => lo(x.s.media, 45) * hi(x.s.online, 50), excl: ['media_darling', 'model_pro'] }),
  neu({ id: 'trash_talker', name: 'Trash Talker', group: 'media', desc: 'Talks big before every match: more hype and a sharper edge, but friction and the odd incident.',
    fx: { in: { aggression: 4 }, hype: 0.4, compat: -0.03, incident: 0.004 }, w: (x) => hi(x.h.ego, 58) * hi(x.s.charisma, 50) }),
  pos({ id: 'brand_ambassador', name: 'Brand Ambassador', group: 'media', desc: 'Sponsors love them: better sponsor offers for the club, and a premium on their own salary.',
    fx: { sponsor: 0.06, salary: 0.06 }, w: (x) => hi(x.s.media, 58) * hi(x.s.style, 55) * hi(x.rep, 55), excl: ['camera_shy'] }),
  neg({ id: 'hater_magnet', name: 'Hater Magnet', group: 'media', hidden: true, desc: 'Attracts online hate: online-abuse problems are far more common.',
    fx: { approach: { fans: 2.5 } }, w: (x) => hi(x.s.online, 56) * hi(x.h.ego, 52) }),
  pos({ id: 'fashion_icon', name: 'Fashion Icon', group: 'media', desc: 'Sets trends on and off stage: more merch sales, apparel-sponsor appeal and stream views.',
    fx: { merch: 0.8, sponsor: 0.02, stream: 3 }, w: (x) => hi(x.s.style, 70) }),

  // ------------------------------------------------------------------ professionalism
  pos({ id: 'model_pro', name: 'Model Professional', group: 'pro', desc: 'Never a problem off the Rift: incidents are rare and the staff trust them.',
    fx: { incidentMul: 0.3, trust: 3 }, w: (x) => hi(x.h.professionalism, 68), excl: ['party_animal', 'foot_in_mouth', 'rage_typer', 'always_late', 'toxic_presence', 'late_sleeper', 'bad_influence'] }),
  neg({ id: 'always_late', name: 'Always Late', group: 'pro', desc: 'Late to scrims and meetings: staff trust and team chemistry suffer.',
    fx: { trust: -3, chem: -0.08, compat: -0.03 }, w: (x) => lo(x.h.professionalism, 50), excl: ['model_pro'] }),

  // ------------------------------------------------------------------ travel & home
  neg({ id: 'jet_lag', name: 'Jet-Lag Prone', group: 'travel', hidden: true, desc: 'Struggles with long flights: heavy fatigue and lower morale during international events.',
    fx: { travel: 5, travelMorale: -1 }, w: (x) => lo(x.s.stamina, 55), excl: ['road_warrior'] }),
  pos({ id: 'road_warrior', name: 'Road Warrior', group: 'travel', desc: 'Loves the road: recovers on international trips and gets a morale boost.',
    fx: { travel: -3, travelMorale: 1 }, w: (x) => hi(x.s.stamina, 56) * (x.age >= 20 ? 1 : 0.5), excl: ['jet_lag', 'homebody'] }),
  neg({ id: 'homebody', name: 'Homebody', group: 'travel', desc: 'Misses home badly when playing abroad: homesickness is far more likely and morale dips.',
    fx: { approach: { homesick: 2.5 }, abroad: -0.4 }, w: (x) => (x.s.languages <= 1 ? 1 : 0.4) * lo(x.h.composure, 56), excl: ['globetrotter', 'road_warrior'] }),
  pos({ id: 'globetrotter', name: 'Globetrotter', group: 'travel', desc: 'At home anywhere: rarely homesick, settles quickly abroad and bonds across nationalities.',
    fx: { approach: { homesick: 0.3, language: 0.5 }, abroad: 0.2, foreign: 0.06 }, w: (x) => (x.s.languages >= 2 ? 1.4 : 0.4) * hi(x.h.composure, 50), excl: ['homebody'] }),
  pos({ id: 'polyglot', name: 'Polyglot', group: 'travel', desc: 'Speaks three or more languages: no language barriers, better bonds across the roster, clearer comms.',
    fx: { approach: { language: 0.2 }, foreign: 0.1, in: { shotcalling: 1 } }, w: (x) => (x.s.languages >= 3 ? 3 : 0), excl: ['language_barrier'] }),
  neg({ id: 'language_barrier', name: 'Language Barrier', group: 'travel', desc: 'Struggles with the team language abroad: language problems and weaker bonds with foreign teammates.',
    fx: { approach: { language: 2 }, foreign: -0.1 }, w: (x) => (x.s.languages <= 1 ? 0.7 : 0), excl: ['polyglot', 'globetrotter'] }),

  // ------------------------------------------------------------------ contracts & loyalty
  pos({ id: 'one_club', name: 'One-Club Player', group: 'contract', desc: 'Loyal to the crest: asks less to re-sign with their club and stays content there.',
    fx: { stay: 0.12, morale: 0.2, approach: { offer: 0.4 } }, w: (x) => hi(x.h.loyalty, 68), excl: ['mercenary'] }),
  neg({ id: 'mercenary', name: 'Mercenary', group: 'contract', desc: 'Follows the money: asks 15% more salary and listens to every offer.',
    fx: { salary: 0.15, approach: { offer: 2, raise: 1.5 } }, w: (x) => lo(x.h.loyalty, 45) * hi(x.h.ego, 50), excl: ['one_club', 'hometown_hero'] }),
  pos({ id: 'hometown_hero', name: 'Hometown Hero', group: 'contract', desc: 'Plays for their home region’s fans: happier at a home-region club and cheaper to keep there.',
    fx: { home: 0.4, stay: 0.05 }, w: (x) => hi(x.h.loyalty, 56) * hi(x.rep, 50), excl: ['mercenary'] }),
  neu({ id: 'contract_year', name: 'Contract-Year Player', group: 'contract', hidden: true, desc: 'Plays for the next deal: trains 10% harder and lifts their level in the final contract year.',
    fx: { contractYear: 2 }, w: (x) => hi(x.h.ego, 52) * 0.8 }),

  // ------------------------------------------------------------------ rivalries
  pos({ id: 'giant_slayer', name: 'Giant Slayer', group: 'rivalry', hidden: true, desc: 'Raises their level against stronger opponents.',
    fx: { opp: { stronger: 0.025 } }, w: (x) => hi(x.a.clutch, 58) * hi(x.h.resilience, 52), excl: ['flat_track_bully'] }),
  neu({ id: 'flat_track_bully', name: 'Flat-Track Bully', group: 'rivalry', hidden: true, desc: 'Feasts on weaker teams but shrinks against stronger ones.',
    fx: { opp: { weaker: 0.02, stronger: -0.02 } }, w: (x) => lo(x.a.clutch, 62), excl: ['giant_slayer'] }),
  neg({ id: 'grudge_holder', name: 'Grudge Holder', group: 'rivalry', desc: 'Never forgets a slight: rivalries with role competitors turn bitter and conflicts are more likely.',
    fx: { sameRole: -0.12, approach: { conflict: 1.5 } }, w: (x) => hi(x.h.ego, 58), excl: ['team_player'] }),

  // ------------------------------------------------------------------ mentoring
  pos({ id: 'patient_teacher', name: 'Patient Teacher', group: 'mentoring', desc: 'Explains everything twice: teammates under 22 train 8% better.',
    fx: { youth: 0.08, compat: 0.03 }, w: (x) => (x.age >= 22 ? 1 : 0.1) * hi(x.h.professionalism, 56) * hi(x.s.charisma, 48), excl: ['bad_influence'] }),
  neg({ id: 'bad_influence', name: 'Bad Influence', group: 'mentoring', hidden: true, desc: 'Teaches the kids the wrong habits: teammates under 22 train 8% worse.',
    fx: { youth: -0.08 }, w: (x) => lo(x.h.professionalism, 50) * (x.age >= 21 ? 1 : 0.3), excl: ['mentor', 'patient_teacher', 'model_pro'] }),
  pos({ id: 'eager_student', name: 'Eager Student', group: 'mentoring', desc: 'Soaks up advice: +12% training while a mentor or veteran is on the roster.',
    fx: { withMentor: 0.12 }, w: (x) => (x.age < 23 ? 1 : 0) * hi(x.h.workEthic, 53) }),

  // ------------------------------------------------------------------ rookie & veteran
  neu({ id: 'wide_eyed', name: 'Wide-Eyed Rookie', group: 'career', desc: 'Everything is new: nervous on big stages, but absorbs training fast (+10%).',
    fx: { big: -0.02, train: 0.1 }, w: (x) => (x.age < 21 ? 1.2 : 0), excl: ['fearless_rookie', 'clutch_gene'] }),
  pos({ id: 'fearless_rookie', name: 'Fearless Rookie', group: 'career', hidden: true, desc: 'Too young to feel pressure: plays up on the big stage and plays aggressively.',
    fx: { big: 0.015, in: { aggression: 5 } }, w: (x) => (x.age < 21 ? 1 : 0) * hi(x.h.composure, 52), excl: ['wide_eyed', 'big_stage_nerves'] }),
  pos({ id: 'grizzled_veteran', name: 'Grizzled Veteran', group: 'career', desc: 'Seen it all: calmer and smarter, a little slower on the keys, steady on the big stage.',
    fx: { in: { composure: 6, macro: 2, mech: -2 }, big: 0.008 }, w: (x) => (x.age >= 25 ? 1.2 : 0) }),
  neg({ id: 'fading_reflexes', name: 'Fading Reflexes', group: 'career', hidden: true, desc: 'The hands are slowing down: slightly weaker mechanics, worse in very long games.',
    fx: { in: { mech: -3 }, long: -0.01 }, w: (x) => (x.age >= 26 ? 0.8 : 0) }),
  pos({ id: 'prodigy', name: 'Prodigy', group: 'career', hidden: true, desc: 'A generational talent: +15% training gains until 22 and sharper mechanics.',
    fx: { trainAge: [0, 22, 0.15], in: { mech: 2 } }, w: (x) => (x.age < 21 && x.p.hidden.potential >= 135 ? 3 : 0), excl: ['coasting'] }),
];

export const TRAIT_SPECS: Record<string, TraitSpec> = Object.fromEntries(LIST.map((t) => [t.id, t]));

/** Groups for the original 32 traits (traits.ts), so the UI can group everything. */
export const BASE_TRAIT_GROUP: Record<string, TraitGroup> = {
  game_ender: 'macro', shotcaller: 'leadership', ice_veins: 'clutch', big_stage_nerves: 'clutch', throw_merchant: 'clutch', coinflip: 'consistency',
  lane_kingdom: 'laning', farming_machine: 'laning', vision_wizard: 'vision', teamfight_maestro: 'teamfight', carry_mentality: 'style', weakside_hero: 'role',
  roaming_menace: 'roaming', champion_ocean: 'pool', one_trick: 'pool', flash_wizard: 'style', baron_thief: 'objectives', engage_lord: 'teamfight',
  hook_master: 'teamfight', dive_bomber: 'style', splitpush_king: 'macro', comeback_king: 'clutch', snowballer: 'style', tilter: 'mental', survivor: 'style',
  mentor: 'mentoring', grinder: 'training', party_animal: 'pro', fan_favorite: 'media', hot_headed: 'mental', veteran: 'career', rookie: 'career',
};

/** UI/catalogue view of the new traits (merged into TRAITS by traits.ts). */
export const MORE_TRAITS: Record<string, TraitDef> = Object.fromEntries(LIST.map((t) => [t.id, { id: t.id, name: t.name, desc: t.desc, kind: t.kind, hidden: t.hidden, group: t.group, excl: t.excl }]));

// ------------------------------------------------------------------ aggregation (cached per trait list)
const NUM_KEYS = [
  'perf', 'big', 'small', 'sd', 'early', 'late', 'long', 'closing', 'behind', 'tilt', 'calm', 'meta', 'contractYear',
  'train', 'decline', 'learn', 'youth', 'withMentor', 'fatigue', 'morale', 'teamMorale', 'chem', 'peace', 'trust', 'compat', 'foreign', 'sameRole',
  'stream', 'output', 'merch', 'sponsor', 'media', 'hype', 'rep', 'salary', 'stay', 'home', 'abroad', 'incident', 'incidentMul', 'travel', 'travelMorale', 'offRole',
] as const satisfies readonly (keyof TraitFx)[];
export type FxNumKey = (typeof NUM_KEYS)[number];
const MULTIPLY = new Set<FxNumKey>(['sd', 'tilt', 'calm', 'output', 'decline', 'incidentMul', 'offRole']);
/** Summed (multipliers: multiplied) numeric effects of a trait list, plus the raw profiles of the extended traits in it. */
export interface FxTotal { any: boolean; num: Record<FxNumKey, number>; list: { id: string; fx: TraitFx }[] }
const totals = new Map<string, FxTotal>();
// fast path: remember the result on the array itself (re-checked by length / first / last, since trait lists only grow by push or get replaced)
const byArray = new WeakMap<readonly string[], { n: number; a?: string; b?: string; t: FxTotal }>();
export function fxTotal(traits: readonly string[]): FxTotal {
  const c = byArray.get(traits), n = traits.length;
  if (c && c.n === n && c.a === traits[0] && c.b === traits[n - 1]) return c.t;
  const t = totalOf(traits);
  byArray.set(traits, { n, a: traits[0], b: traits[n - 1], t });
  return t;
}
function totalOf(traits: readonly string[]): FxTotal {
  const key = traits.join(',');
  let t = totals.get(key);
  if (t) return t;
  const num = {} as Record<FxNumKey, number>;
  for (const k of NUM_KEYS) num[k] = MULTIPLY.has(k) ? 1 : 0;
  const list: FxTotal['list'] = [];
  for (const id of traits) {
    const fx = TRAIT_SPECS[id]?.fx;
    if (!fx) continue;
    list.push({ id, fx });
    for (const k of NUM_KEYS) { const v = fx[k]; if (typeof v === 'number') num[k] = MULTIPLY.has(k) ? num[k] * v : num[k] + v; }
  }
  t = { any: list.length > 0, num, list };
  if (totals.size > 5000) totals.clear();
  totals.set(key, t);
  return t;
}
