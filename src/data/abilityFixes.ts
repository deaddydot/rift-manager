// Hand-checked corrections to the generated ability data. The crowd control in champions.json is parsed
// from ability descriptions by keyword matching (scripts/build-champions.mjs, CC_PATTERNS), which misfires:
// a "stun" or "knock" anywhere in the text — a passive, a self-slow while charging, a conditional effect,
// an ally's knock-up — became the ability's CC (Taliyah's Q got a 3 s stun, Janna's shield a 4 s knock-up),
// and real CC that the text phrased differently ("suspends", "draws in", "berserk") was missed. Charge /
// ammo abilities (Caitlyn's traps, Teemo's shrooms, Gangplank's barrels) came through with the delay
// between charges instead of their recharge.
//
// Every champion's Q/W/E/R was audited against the live kits (2025–26 patches). Conventions:
//  - cc is what an ability does to the enemies it hits. Conditional CC uses the outcome that normally
//    happens in a fight (Vayne's Condemn → knock-back, not the wall stun); self buffs, dashes, shields → null.
//  - knock-backs / knock-asides → 'knockup'; drags toward the caster → 'pull'; duration ≈ rank 3.
//  - charge / ammo / resource-gated abilities get the effective time between casts in a fight (never under
//    ~4 s when the ability has hard CC).
// Applied when the game data loads, so the sim and the Champions page both see the corrected values.
import type { CCType } from '../engine/types';

export interface AbilityFix {
  /** the ability's crowd control (null = it has none) */
  cc?: { type: CCType; duration: number; amount?: number } | null;
  /** cooldown per rank; for charge abilities, the effective time between casts in a fight */
  cooldown?: number[];
  note?: string;
}
type Slot = 'Q' | 'W' | 'E' | 'R';

export const ABILITY_FIXES: Record<string, Partial<Record<Slot, AbilityFix>>> = {
  Aatrox: {
    R: { cc: null, note: 'World Ender only fears nearby minions — no champion CC (data: 3 s fear)' },
  },
  Ahri: {
    W: { cc: null, note: 'Fox-Fire: homing damage, no charm (the charm is E)' },
  },
  Akali: {
    E: { cc: null, note: 'Shuriken Flip: mark + dash, no root' },
  },
  Akshan: {
    E: { cc: null, note: 'Heroic Swing: a swing/dash, no polymorph' },
  },
  Alistar: {
    Q: { cc: { type: 'knockup', duration: 1 }, note: 'Pulverize knocks up for 1 s' },
  },
  Amumu: {
    Q: { cooldown: [10, 9.5, 9, 8.5, 8], note: 'Bandage Toss: 2 charges — data had the 3 s delay between charges' },
  },
  Annie: {
    R: { cc: { type: 'stun', duration: 1.5 }, note: 'Pyromania stun is normally spent on the Tibbers drop (AoE stun) — was missing' },
  },
  Aphelios: {
    R: { cc: null, note: 'Moonlight Vigil applies the weapon effects, no root' },
  },
  Ashe: {
    Q: { cooldown: [8, 8, 8, 8, 8], note: "Ranger's Focus needs 4 Focus stacks (≈6 s active, then restack) — not a 0 s recast" },
    R: { cc: { type: 'stun', duration: 2 }, note: 'Crystal Arrow stuns 1–3.5 s by distance; ~2 s at typical range' },
  },
  AurelionSol: {
    W: { cc: null, note: 'Astral Flight: flight, no root' },
    E: { cc: { type: 'slow', duration: 2, amount: 0.25 }, note: 'Singularity drags enemies toward its centre (was missing)' },
  },
  Aurora: {
    R: { cc: { type: 'slow', duration: 2, amount: 0.5 }, note: 'Between Worlds: slow + enemies trapped in the zone — not a 3.5 s knock-up' },
  },
  Bard: {
    W: { cooldown: [10, 10, 10, 10, 10], note: "Caretaker's Shrine: limited shrine charges — data had 0 s (heal spam)" },
    E: { cc: null, note: 'Magical Journey: a portal, no root' },
  },
  Belveth: {
    Q: { cooldown: [4, 4, 3.5, 3.5, 3], note: 'Void Surge: 4 directions on 16–12 s each (AS-reduced) — one dash every ~3–4 s, not 1 s' },
    W: { cc: { type: 'knockup', duration: 0.75 }, note: 'Above and Below knocks up, then slows' },
    R: { cooldown: [60, 55, 50], note: 'Endless Banquet needs Void Coral from a takedown — about once per fight (data: 1 s)' },
  },
  Blitzcrank: {
    Q: { cc: { type: 'pull', duration: 0.65 }, note: 'Rocket Grab: 0.65 s stun while pulling to Blitzcrank' },
    W: { cc: null, note: 'Overdrive: the slow is on Blitzcrank himself afterwards' },
  },
  Briar: {
    E: { cc: { type: 'knockup', duration: 0.5 }, note: 'Chilling Scream: slow / knock-back when fully charged; the stun needs terrain' },
    R: { cc: { type: 'fear', duration: 1.5 }, note: 'Certain Death fears nearby enemies on arrival — not a knock-up' },
  },
  Caitlyn: {
    W: { cooldown: [12, 10.5, 9, 7.5, 6], note: 'Yordle Snap Trap: 2–5 charges, 30–12 s recharge — effective time between traps (data: 0.5 s)' },
    E: { cc: { type: 'slow', duration: 1, amount: 0.5 }, note: '90 Caliber Net slows 50% for 1 s — no root' },
  },
  Camille: {
    E: { cc: { type: 'stun', duration: 0.75 }, note: 'Hookshot: the wall dash stuns 0.75 s on impact — not a polymorph' },
  },
  Cassiopeia: {
    W: { cc: { type: 'slow', duration: 2, amount: 0.3 }, note: 'Miasma grounds (no dashes) and slows — no root' },
  },
  Chogath: {
    Q: { cc: { type: 'knockup', duration: 1 }, note: 'Rupture knocks up for 1 s, then slows' },
  },
  Corki: {
    R: { cooldown: [6, 5, 4], note: 'Missile Barrage: ammo (2 s between missiles, stock recharges 20/16/12 s) — effective rate' },
  },
  Darius: {
    E: { cc: { type: 'pull', duration: 0.5 }, note: 'Apprehend pulls enemies in (then slows)' },
    R: { cc: null, note: 'Noxian Guillotine: execute dash, no fear (data: 3 s fear)' },
  },
  Diana: {
    R: { cc: { type: 'pull', duration: 0.5 }, note: 'Moonfall draws nearby enemies in and slows them' },
  },
  Draven: {
    E: { cc: { type: 'knockup', duration: 0.5 }, note: 'Stand Aside knocks aside, then slows' },
    R: { cc: null, note: 'Whirling Death: damage only' },
  },
  Ekko: {
    R: { cc: null, note: 'Chronobreak: rewind + damage, no knock-up' },
  },
  Fiora: {
    W: { cc: { type: 'slow', duration: 1.5, amount: 0.5 }, note: 'Riposte stuns only if it parries a disable; normally a 50% slow' },
  },
  Galio: {
    Q: { cc: null, note: 'Winds of War: damage only' },
    E: { cc: { type: 'knockup', duration: 0.75 }, note: 'Justice Punch knocks up the first champion hit (was missing)' },
    R: { cc: { type: 'knockup', duration: 0.75 }, note: "Hero's Entrance knocks up on landing (was missing)" },
  },
  Gangplank: {
    E: { cooldown: [8, 7, 6, 5.5, 5], note: 'Powder Keg: 3 barrel charges recharging 18–14 s — data had 0.5 s' },
  },
  Gnar: {
    E: { cc: null, note: 'Hop: bounce off units, no root' },
  },
  Gragas: {
    R: { cc: { type: 'knockup', duration: 0.5 }, note: 'Explosive Cask knocks enemies back (was missing)' },
  },
  Graves: {
    W: { cc: { type: 'slow', duration: 0.5, amount: 0.15 }, note: 'Smoke Screen nearsights (not modelled) and slows 15% — not a blind' },
  },
  Hecarim: {
    E: { cc: { type: 'knockup', duration: 0.5 }, note: 'Devastating Charge knocks the target back' },
    R: { cc: { type: 'fear', duration: 1.25 }, note: 'Onslaught of Shadows fears 0.75–1.5 s by distance — not a knock-up' },
  },
  Heimerdinger: {
    Q: { cooldown: [8, 7.5, 7, 6.5, 6], note: 'Turret kits: 3 stored, ~20 s each — not a 1 s recast' },
  },
  Hwei: {
    E: { cc: { type: 'root', duration: 1.25 }, note: 'Subject: Torment — Gaze of the Abyss (EW) roots / Grim Visage (EQ) fears (was missing)' },
  },
  Illaoi: {
    R: { cc: null, note: 'Leap of Faith: damage + tentacles, no knock-up' },
  },
  Irelia: {
    R: { cc: { type: 'slow', duration: 1.5, amount: 0.6 }, note: "Vanguard's Edge: the blade wall slows 90% and disarms — no 2.5 s knock-up" },
  },
  Ivern: {
    W: { cooldown: [12, 11, 10, 9, 8], note: 'Brushmaker: 3 charges, 40–24 s recharge — data had 0.5 s' },
  },
  Janna: {
    E: { cc: null, note: 'Eye of the Storm: a shield — no CC (data: 4 s knock-up)' },
  },
  JarvanIV: {
    R: { cc: { type: 'root', duration: 1.5 }, note: "Cataclysm: the arena traps the target (can't walk out) — no knock-up" },
  },
  Jayce: {
    E: { cc: { type: 'knockup', duration: 0.5 }, note: 'Thundering Blow knocks back — not a root' },
  },
  Jhin: {
    E: { cooldown: [14, 12.5, 11, 9.5, 8], note: 'Captive Audience: 2 trap charges, 28–16 s recharge — data had 2 s' },
  },
  Kassadin: {
    R: { cooldown: [6, 4.5, 3], note: 'Riftwalk: each recast doubles the mana cost — a few casts per fight' },
  },
  Kennen: {
    R: { cc: { type: 'stun', duration: 1.25 }, note: 'Slicing Maelstrom stacks Mark of the Storm → AoE stun (was missing)' },
  },
  Khazix: {
    Q: { cc: null, note: 'Taste Their Fear: isolation damage, no fear' },
    E: { cc: null, note: 'Leap: damage, no fear' },
  },
  Kindred: {
    W: { cc: null, note: "Wolf's Frenzy: no slow" },
  },
  Kled: {
    Q: { cc: { type: 'pull', duration: 0.5 }, note: 'Bear Trap tether yanks the target in, then slows — no 2.5 s knock-up' },
  },
  KogMaw: {
    R: { cooldown: [4, 3.5, 3], note: 'Living Artillery: 2/1.5/1 s recast but stacking mana cost — a few per fight' },
  },
  KSante: {
    Q: { cc: { type: 'slow', duration: 0.5, amount: 0.8 }, note: 'Ntofo Strikes slows 80% for 0.5 s; only every third cast pulls/stuns (data: stun every 3.5 s)' },
    R: { cc: { type: 'knockup', duration: 1 }, note: 'All Out roots and kicks the target back (through walls) — a displacement' },
  },
  LeeSin: {
    E: { cc: { type: 'slow', duration: 2, amount: 0.5 }, note: 'Tempest → Cripple slows (was missing)' },
  },
  Malzahar: {
    R: { cc: { type: 'suppress', duration: 2.5 }, note: 'Nether Grasp suppresses for the full 2.5 s channel' },
  },
  Maokai: {
    Q: { cc: { type: 'knockup', duration: 0.5 }, note: 'Bramble Smash knocks back nearby enemies and slows — not a stun' },
  },
  MasterYi: {
    R: { cc: null, note: 'Highlander makes Yi slow-immune; no enemy slow' },
  },
  Milio: {
    Q: { cc: { type: 'knockup', duration: 0.75 }, note: 'Ultra Mega Fire Kick: brief knock-back + stun' },
    E: { cooldown: [11, 10.5, 10, 9.5, 9], note: 'Warm Hugs: 2 charges — data had 0.5 s between charges' },
    R: { cc: null, note: 'Breath of Life heals/cleanses allies — no enemy CC (data: 3 s knock-up)' },
  },
  Mordekaiser: {
    E: { cc: { type: 'pull', duration: 0.5 }, note: "Death's Grasp pulls enemies toward him" },
  },
  Nami: {
    Q: { cc: { type: 'knockup', duration: 1.5 }, note: 'Aqua Prison suspends for 1.5 s (was missing)' },
    R: { cc: { type: 'knockup', duration: 0.5 }, note: 'Tidal Wave knocks up 0.5 s, then slows 70%' },
  },
  Nautilus: {
    Q: { cc: { type: 'pull', duration: 0.75 }, note: 'Dredge Line pulls Nautilus and the target together, brief stun' },
  },
  Neeko: {
    R: { cc: { type: 'stun', duration: 1.25 }, note: 'Pop Blossom stuns 1.25 s' },
  },
  Nilah: {
    E: { cooldown: [13, 11, 9.5, 8, 6.5], note: 'Slipstream: 2 charges, 26–12 s recharge — data had 0.5 s' },
    R: { cc: { type: 'pull', duration: 0.5 }, note: 'Apotheosis draws enemies in at the end — no 3 s knock-up' },
  },
  Nocturne: {
    Q: { cc: null, note: 'Duskbringer: damage + Dusk Trail, no slow' },
    R: { cc: null, note: 'Paranoia: darkness + dash, no knock-up' },
    // E (Unspeakable Horror) is right as parsed: tethered fear 1.25–2.25 s
  },
  Nunu: {
    Q: { cc: null, note: 'Consume: bite + heal, no stun' },
    W: { cc: { type: 'knockup', duration: 1 }, note: 'Biggest Snowball Ever knocks up 0.5–1.5 s by size' },
    E: { cc: { type: 'root', duration: 1 }, note: 'Snowball Barrage: Snowbound enemies are briefly rooted (0.5–1.5 s)' },
  },
  Ornn: {
    Q: { cc: { type: 'slow', duration: 2, amount: 0.4 }, note: 'Volcanic Rupture slows; the pillar only knocks up when Ornn charges into it (data: 4 s knock-up)' },
    W: { cc: null, note: "Bellows Breath applies Brittle (the knock-back comes from Ornn's next attack)" },
    E: { cc: { type: 'knockup', duration: 0.75 }, note: 'Searing Charge knocks up only when it hits terrain/a pillar' },
    R: { cc: { type: 'knockup', duration: 1 }, note: 'Call of the Forge God: the recast knocks up' },
  },
  Pyke: {
    Q: { cc: { type: 'pull', duration: 0.5 }, note: 'Bone Skewer hooks and pulls the target in' },
  },
  Quinn: {
    Q: { cc: null, note: 'Blinding Assault nearsights champions (blinds only minions/monsters)' },
    R: { cc: null, note: 'Behind Enemy Lines: travel form, no root' },
  },
  Rakan: {
    W: { cc: { type: 'knockup', duration: 1 }, note: 'Grand Entrance knocks up — not a polymorph' },
    E: { cc: null, note: 'Battle Dance: dash to an ally + shield' },
  },
  Rammus: {
    Q: { cc: { type: 'knockup', duration: 0.5 }, note: 'Powerball knocks back and slows' },
  },
  RekSai: {
    W: { cc: { type: 'knockup', duration: 1 }, cooldown: [10, 10, 10, 10, 10], note: 'Un-burrow knocks up (same target once per 10 s) — was missing' },
    R: { cc: null, note: 'Void Rush: untargetable execute dash, no knock-up' },
  },
  Rell: {
    W: { cc: { type: 'knockup', duration: 1 }, note: 'Crash Down knocks up' },
    R: { cc: { type: 'pull', duration: 0.75 }, note: 'Magnet Storm pulls enemies inward (was missing)' },
  },
  Renata: {
    Q: { cc: { type: 'root', duration: 1 }, note: 'Handshake roots (the recast throws the target)' },
    R: { cc: { type: 'stun', duration: 1.5 }, note: 'Hostile Takeover berserks enemies — they lose control (modelled as a stun); was missing' },
  },
  Rengar: {
    E: { cc: { type: 'slow', duration: 1.75, amount: 0.5 }, note: 'Bola Strike slows; only the Ferocity-empowered version roots' },
  },
  Rumble: {
    E: { cooldown: [5, 4.75, 4.5, 4.25, 4], note: 'Electro Harpoon: 2 charges — data had 0.5 s between charges' },
  },
  Ryze: {
    R: { cc: null, note: 'Realm Warp: teleport, no root' },
  },
  Samira: {
    R: { cooldown: [45, 40, 35], note: 'Inferno Trigger needs an S style grade — about once per fight (data: 5 s)' },
  },
  Sejuani: {
    Q: { cc: { type: 'knockup', duration: 0.5 }, note: 'Arctic Assault knocks up briefly (was missing)' },
    W: { cc: null, note: "Winter's Wrath knocks back minions/monsters only; it builds Frost on champions" },
    E: { cooldown: [8, 7.5, 7, 6.5, 6], note: 'Permafrost needs 4 Frost stacks — effective rate, not the 1.5 s recast' },
  },
  Seraphine: {
    E: { cc: { type: 'slow', duration: 1.25, amount: 0.6 }, note: 'Beat Drop slows; roots/stuns only already-slowed/immobilised targets' },
  },
  Shyvana: {
    R: { cc: { type: 'knockup', duration: 0.5 }, cooldown: [60, 55, 50], note: "Dragon's Descent needs 100 Fury — about once per fight (data: 0 s); landing knocks back" },
  },
  Sion: {
    Q: { cc: { type: 'knockup', duration: 1 }, note: 'Decimating Smash (charged) knocks up then stuns' },
    E: { cc: { type: 'slow', duration: 2.5, amount: 0.5 }, note: 'Roar of the Slayer slows + shreds armour — no stun' },
    R: { cc: { type: 'knockup', duration: 1.25 }, note: 'Unstoppable Onslaught knocks up on impact' },
  },
  Sivir: {
    E: { cc: null, note: 'Spell Shield: no fear' },
  },
  Smolder: {
    E: { cc: null, note: 'Flap, Flap, Flap: flight + auto bolts, no root' },
  },
  Soraka: {
    E: { cc: { type: 'silence', duration: 1.5 }, note: 'Equinox silences in the zone; the root only catches those still inside at the end' },
  },
  Swain: {
    E: { cc: { type: 'root', duration: 1.4 }, note: 'Nevermove roots on the return — not a knock-up' },
  },
  Sylas: {
    E: { cc: { type: 'knockup', duration: 0.5 }, note: 'Abduct (E2) knocks up (was missing)' },
  },
  TahmKench: {
    Q: { cc: { type: 'slow', duration: 2, amount: 0.5 }, note: 'Tongue Lash slows 50% for 2 s; stuns only at 3 Acquired Taste stacks' },
    W: { cc: { type: 'knockup', duration: 1 }, note: 'Abyssal Dive knocks up on landing' },
  },
  Taliyah: {
    Q: { cc: null, note: 'Threaded Volley: damage only (data: 3 s stun on a 3–7 s cooldown)' },
    W: { cc: { type: 'knockup', duration: 0.75 }, note: 'Seismic Shove knocks up and displaces' },
    E: { cc: { type: 'slow', duration: 1.5, amount: 0.3 }, note: 'Unraveled Earth: slow; the stun only happens if they dash over it' },
    R: { cc: null, note: "Weaver's Wall: a wall, not a knock-up" },
  },
  Teemo: {
    R: { cooldown: [12, 10, 8], note: 'Noxious Trap: 3 shroom charges, 30–20 s recharge — data had 0.25 s' },
  },
  Thresh: {
    Q: { cc: { type: 'pull', duration: 1.5 }, note: 'Death Sentence: 1.5 s stun while pulling to Thresh' },
    W: { cc: null, note: 'Dark Passage: lantern + shield, no root' },
    E: { cc: { type: 'knockup', duration: 0.5 }, note: 'Flay knocks enemies back/forward, then slows' },
    R: { cc: { type: 'slow', duration: 2, amount: 0.9 }, note: 'The Box: the first wall broken slows 99% for 2 s' },
  },
  Tristana: {
    E: { cc: null, note: 'Explosive Charge: a bomb, no knock-up' },
  },
  Trundle: {
    E: { cc: { type: 'slow', duration: 2, amount: 0.35 }, note: 'Pillar of Ice slows around it (small knock-back on spawn)' },
  },
  Urgot: {
    R: { cc: { type: 'slow', duration: 3, amount: 0.5 }, note: 'Fear Beyond Death leashes + slows by missing HP; the suppress is only the <25% HP execute' },
  },
  Varus: {
    Q: { cc: null, note: 'Piercing Arrow: the slow is on Varus while charging' },
  },
  Vayne: {
    E: { cc: { type: 'knockup', duration: 0.25 }, note: 'Condemn knocks back; the 1.5 s stun needs a wall' },
  },
  Velkoz: {
    W: { cooldown: [10, 9.5, 9, 8.5, 8], note: 'Void Rift: 2 charges, 19–15 s recharge — data had 1.5 s' },
  },
  Vex: {
    W: { cc: { type: 'fear', duration: 0.75 }, note: 'Doom (passive) fear is usually spent on Personal Space' },
    R: { cc: null, note: 'Shadow Surge: mark + dash, no knock-up' },
  },
  Vi: {
    Q: { cc: { type: 'knockup', duration: 0.75 }, note: 'Vault Breaker knocks back (the slow was Vi charging)' },
    E: { cooldown: [8, 7, 6, 5, 4], note: 'Relentless Force: 2 charges, 12–6 s recharge — data had 1 s' },
    R: { cc: { type: 'knockup', duration: 1.25 }, note: 'Cease and Desist knocks the target up 1.25 s' },
  },
  Vladimir: {
    Q: { cc: null, note: 'Transfusion: drain, no slow' },
  },
  Volibear: {
    R: { cc: { type: 'slow', duration: 1, amount: 0.5 }, note: 'Stormbringer: landing slows briefly and disables turrets — no 3 s knock-up' },
  },
  Warwick: {
    Q: { cc: null, note: 'Jaws of the Beast: bite/latch, no knock-up' },
  },
  Xerath: {
    Q: { cc: null, note: 'Arcanopulse: the slow is on Xerath while charging' },
  },
  XinZhao: {
    R: { cc: { type: 'knockup', duration: 0.5 }, note: 'Crescent Guard knocks back everyone but the challenged target — not a stun' },
  },
  Yasuo: {
    Q: { cc: { type: 'knockup', duration: 1 }, note: 'third Steel Tempest (tornado) knocks up 1 s; the 4 s recast ≈ tornado rate (was missing)' },
    E: { cc: null, cooldown: [10, 9, 8, 7, 6], note: 'Sweeping Blade: a dash, no CC; 10–6 s per target (data: 0.5–0.1 s)' },
  },
  Yone: {
    Q: { cc: { type: 'knockup', duration: 1 }, note: 'third Mortal Steel dashes and knocks up (was missing)' },
    E: { cc: null, note: 'Soul Unbound: spirit form, no knock-up' },
  },
  Yorick: {
    W: { cc: { type: 'root', duration: 1.25 }, note: "Dark Procession cages enemies (can't walk out until it breaks) — not a 4 s knock-up" },
  },
  Yunara: {
    Q: { cooldown: [9, 9, 9, 9, 9], note: 'Cultivation of Spirit needs full Unleash stacks from attacks — not a 0 s recast' },
  },
  Yuumi: {
    W: { cc: null, cooldown: [10, 10, 10, 10, 10], note: 'You and Me!: attaches to an ally — no polymorph' },
    R: { cc: { type: 'root', duration: 1 }, note: 'Final Chapter roots champions hit by repeated waves' },
  },
  Zac: {
    Q: { cc: { type: 'knockup', duration: 0.5 }, note: 'Stretching Strikes slams the targets together' },
    E: { cc: { type: 'knockup', duration: 1 }, note: 'Elastic Slingshot knocks up 0.5–1 s by distance' },
  },
  Ziggs: {
    W: { cc: { type: 'knockup', duration: 0.5 }, note: 'Satchel Charge knocks back — not a root' },
  },
  Zoe: {
    W: { cc: null, cooldown: [15, 14, 13, 12, 11], note: 'Spell Thief: no CC (the sleep is E); summoner-spell shards, not a 0.25 s recast' },
  },
};

/** Apply the corrections in place (idempotent). */
export function applyAbilityFixes(champions: { id: string; abilities: { slot: Slot; cc: unknown; cooldown: number[] }[] }[]) {
  for (const c of champions) {
    const fix = ABILITY_FIXES[c.id];
    if (!fix) continue;
    for (const a of c.abilities) {
      const f = fix[a.slot];
      if (!f) continue;
      if ('cc' in f) a.cc = f.cc ?? null;
      if (f.cooldown) a.cooldown = [...f.cooldown];
    }
  }
}
