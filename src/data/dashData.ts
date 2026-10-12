// Hand-written mobility table: every ability that moves its own caster (dashes, blinks, leaps, targeted
// gap-closers, self-displacements), with ranges and behaviour taken from the live kits (2025–26 patches).
// `ability.dash` in champions.json is a keyword guess and is not used by this table.
//
// Conventions:
//  - range: the caster's own travel distance in game units. For targeted gap-closers it is the cast range
//    to the target. Where range scales with rank, the mid rank is used (ultimates: rank 2) and the per-rank
//    values are in the note.
//  - speed: approximate travel speed (units/s) for 'dash' / 'leap', omitted for blinks. Movement-speed
//    charges (Nunu W, Rammus Q, Sion R, Skarner E, Kled R, Kayn E) get their typical in-fight speed.
//  - Several entries on the same slot are parts of ONE ability (Akali E flip + dash to the mark, Ekko E roll
//    + blink strike, Sylas E Abscond + Abduct, Ambessa's per-ability passive dashes). The follow-up part
//    can only be cast after the first and shares that slot's cooldown.
//  - charges / recastWindow: casts available back to back, and how long the extra casts stay available
//    (LeBlanc W: the second use is the return blink). When abilityFixes.ts turned an ammo ability's cooldown
//    into an effective rate (Amumu Q, Nilah E, Bel'Veth Q), the entry carries the real per-charge recharge
//    in `cooldown`, so the two don't double-count.
//  - cooldown is only set when the dash isn't governed by the listed ability's own cooldown: Kalista's
//    passive ('P', one value — the only P entry, since P entries repeat every ~1.2 s), transformed forms
//    (Nidalee Pounce, Elise Rappel, Rek'Sai Tunnel), Rengar's brush leap (put on Q), per-target abilities
//    (Yasuo E, Talon E: effective in-fight rate; the per-target lockout is in perTargetCooldown) and the
//    ammo cases above.
//  - use: 'reposition' (kiting step) appears only on ranged champions; melee champions get gapclose /
//    chase / engage / escape.
//  - direction: 'escape' means the movement goes away from enemies (Caitlyn E, Akali E1, Aurora E,
//    Evelynn R and Graves R recoil or blink backward). Quinn E reaches the target and then vaults back
//    away, so it is a 425 escape/kite, never an engage. Zoe R returns her after 1 s, so it is left out.
//  - stopsAtTarget: also set on point-cast dashes that stop on the first champion hit (Sejuani Q, Gragas E,
//    Galio E, Vi Q, Urgot E, Warwick R), since used as engage they end next to the enemy.
//  - note 'from description': kits not known well enough (Locke, Zaahen, parts of Aurora, Yunara,
//    Ambessa), modelled from the descriptions in public/data/champions.json.

export type DashKind = 'dash' | 'blink' | 'leap';
// dash: travels along the ground at `speed` (can be interrupted / can't cross walls unless overWalls)
// blink: instant teleport to the point
// leap: airborne arc that can cross terrain
export type DashTarget = 'point' | 'enemy' | 'ally' | 'unit' | 'wall';
// point: any location; enemy: must target an enemy (champion, or the unit its skillshot hit);
// ally: an allied unit; unit: any unit incl. minions/monsters (enemy units unless the note says allies too);
// wall: needs terrain
export type DashUse = 'engage' | 'escape' | 'chase' | 'reposition' | 'gapclose';

export interface DashDef {
  slot: 'Q' | 'W' | 'E' | 'R' | 'P';
  name: string;
  kind: DashKind;
  range: number;
  speed?: number;
  target: DashTarget;
  use: DashUse[];
  overWalls?: boolean;
  charges?: number;
  recastWindow?: number;
  resetOnKill?: boolean;
  perTargetCooldown?: number;
  stopsAtTarget?: boolean;
  cooldown?: number[];
  note?: string;
}

export const DASHES: Record<string, DashDef[]> = {
  // ───────────────────────────────── A ─────────────────────────────────
  Aatrox: [
    { slot: 'E', name: 'Umbral Dash', kind: 'dash', range: 300, speed: 1150, target: 'point', use: ['gapclose', 'chase'], overWalls: true,
      note: 'Short dash, castable during Darkin Blade windups to adjust the sweet spot' },
  ],
  Ahri: [
    { slot: 'R', name: 'Spirit Rush', kind: 'dash', range: 450, speed: 1200, target: 'point', use: ['gapclose', 'escape', 'chase', 'reposition'],
      overWalls: true, charges: 3, recastWindow: 10,
      note: '3 dashes within 10 s; a champion takedown grants an extra dash and extends the window (up to 3 stored)' },
  ],
  Akali: [
    { slot: 'E', name: 'Shuriken Flip', kind: 'dash', range: 350, speed: 1050, target: 'point', use: ['escape'], overWalls: true,
      note: 'First cast flips Akali BACKWARD (away from the cast direction) while throwing the shuriken forward' },
    { slot: 'E', name: 'Shuriken Flip (recast)', kind: 'dash', range: 1100, speed: 1700, target: 'enemy', use: ['gapclose', 'chase', 'engage'], overWalls: true,
      stopsAtTarget: true, recastWindow: 3,
      note: 'Recast dashes to the unit (or shroud) marked by the shuriken — only after a hit' },
    { slot: 'R', name: 'Perfect Execution', kind: 'dash', range: 675, speed: 1800, target: 'enemy', use: ['engage', 'gapclose', 'chase'], overWalls: true,
      charges: 2, recastWindow: 10,
      note: 'R1 dashes through the targeted champion (ends past them); R2 (after 2.5 s, within 10 s) is a fixed 750-unit dash in any direction, often used to escape' },
  ],
  Akshan: [
    { slot: 'E', name: 'Heroic Swing', kind: 'dash', range: 800, speed: 900, target: 'wall', use: ['reposition', 'escape', 'chase', 'gapclose'],
      overWalls: true, resetOnKill: true,
      note: 'Hooks the first terrain hit (≤800) and swings around it, then flings off; cooldown resets on champion takedown' },
  ],
  Alistar: [
    { slot: 'W', name: 'Headbutt', kind: 'dash', range: 650, speed: 1500, target: 'unit', use: ['engage', 'gapclose'], overWalls: true,
      stopsAtTarget: true, note: 'Dashes to the target enemy and knocks it back (W→Q combo)' },
  ],
  Ambessa: [
    // Drakehound's Step (passive) gives a short dash after EVERY ability cast, toward the next move/attack
    // command (not through terrain). Attached to Q/W/E so it follows their cooldowns instead of the 1.2 s P rate.
    { slot: 'Q', name: "Cunning Sweep / Sundering Slam (Drakehound's Step)", kind: 'dash', range: 300, speed: 1000, target: 'point', use: ['gapclose', 'chase', 'escape'],
      charges: 2, recastWindow: 4, note: 'from description: Q has two casts (Sweep, then Slam), each followed by a passive dash' },
    { slot: 'W', name: "Repudiation (Drakehound's Step)", kind: 'dash', range: 300, speed: 1000, target: 'point', use: ['gapclose', 'chase'],
      note: 'from description: brace + passive dash; the ground smash happens at the dash destination' },
    { slot: 'E', name: "Lacerate (Drakehound's Step)", kind: 'dash', range: 300, speed: 1000, target: 'point', use: ['gapclose', 'chase', 'escape'],
      note: 'from description: spin + passive dash' },
    { slot: 'R', name: 'Public Execution', kind: 'blink', range: 1250, target: 'enemy', use: ['engage', 'gapclose'],
      overWalls: true, stopsAtTarget: true,
      note: 'Blinks to the farthest enemy champion in a line (unstoppable), suppresses and slams them' },
  ],
  Amumu: [
    { slot: 'Q', name: 'Bandage Toss', kind: 'dash', range: 1100, speed: 1800, target: 'unit', use: ['engage', 'gapclose', 'chase'], overWalls: true,
      stopsAtTarget: true, charges: 2, recastWindow: 3, cooldown: [16, 15, 14, 13, 12],
      note: 'Pulls Amumu to the first enemy hit (stun); 2 charges — cooldown here is the per-charge recharge (abilityFixes has the effective rate)' },
  ],
  Anivia: [],
  Annie: [],
  Aphelios: [],
  Ashe: [],
  AurelionSol: [
    { slot: 'W', name: 'Astral Flight', kind: 'leap', range: 1500, speed: 1000, target: 'point', use: ['reposition', 'engage', 'escape'],
      overWalls: true, note: 'Flies over terrain in the target direction; range grows with Stardust stacks' },
  ],
  Aurora: [
    { slot: 'W', name: 'Across the Veil', kind: 'dash', range: 400, speed: 1100, target: 'point', use: ['escape', 'reposition'],
      overWalls: true, note: 'from description: hops and turns invisible; Realm Hopper lets her pass through terrain for a few seconds' },
    { slot: 'E', name: 'The Weirding', kind: 'dash', range: 250, speed: 1000, target: 'point', use: ['escape', 'reposition'],
      note: 'from description: blast forward, recoils BACKWARD (away from the cast direction)' },
    { slot: 'R', name: 'Between Worlds', kind: 'leap', range: 300, speed: 1000, target: 'point', use: ['engage', 'reposition'],
      overWalls: true,
      note: 'from description: unstoppable leap and shockwave; inside the zone, walking into its edge teleports her to the opposite side' },
  ],
  Azir: [
    { slot: 'E', name: 'Shifting Sands', kind: 'dash', range: 1100, speed: 1700, target: 'point', use: ['engage', 'escape', 'reposition'],
      stopsAtTarget: true,
      note: 'Needs a Sand Soldier (W): dashes to it, stopping on the first enemy champion. Shuffle = E→Q→R' },
  ],

  // ───────────────────────────────── B ─────────────────────────────────
  Bard: [
    { slot: 'E', name: 'Magical Journey', kind: 'leap', range: 900, speed: 1000, target: 'wall', use: ['escape', 'reposition', 'engage'],
      overWalls: true, note: 'Opens a one-way portal through nearby terrain; allies and enemies can also use it (allies travel faster)' },
  ],
  Belveth: [
    { slot: 'Q', name: 'Void Surge', kind: 'dash', range: 400, speed: 1150, target: 'point', use: ['gapclose', 'chase', 'escape'],
      charges: 4, recastWindow: 6, cooldown: [16, 15, 14, 13, 12],
      note: 'One dash per cardinal direction, each on its own 16–12 s cooldown (reduced by attack speed), not through terrain. Cooldown is per direction; abilityFixes has the effective rate' },
  ],
  Blitzcrank: [],
  Brand: [],
  Braum: [
    { slot: 'W', name: 'Stand Behind Me', kind: 'dash', range: 650, speed: 1500, target: 'ally', use: ['engage'], overWalls: true,
      stopsAtTarget: true, note: 'Jumps to an allied champion or minion to peel' },
  ],
  Briar: [
    { slot: 'Q', name: 'Head Rush', kind: 'leap', range: 475, speed: 1800, target: 'unit', use: ['gapclose', 'chase', 'engage'],
      overWalls: true, stopsAtTarget: true, note: 'Leaps to any unit (stuns enemies); can hop over walls onto camps/allies' },
    { slot: 'W', name: 'Blood Frenzy', kind: 'dash', range: 350, speed: 1000, target: 'point', use: ['gapclose', 'chase'],
      note: 'Short dash, then Frenzy (forced attacks on the nearest enemy)' },
    { slot: 'R', name: 'Certain Death', kind: 'leap', range: 12000, speed: 1800, target: 'enemy', use: ['engage', 'chase'],
      overWalls: true, stopsAtTarget: true,
      note: 'Kicks a hemolith; Briar then flies to the first champion hit (unstoppable, fear on landing). Huge range' },
  ],

  // ───────────────────────────────── C ─────────────────────────────────
  Caitlyn: [
    { slot: 'E', name: '90 Caliber Net', kind: 'dash', range: 390, speed: 1000, target: 'point', use: ['escape', 'reposition'],
      overWalls: true, note: 'Fires a net forward and recoils BACKWARD (away from the cast direction); can hop thin walls' },
  ],
  Camille: [
    { slot: 'E', name: 'Hookshot', kind: 'dash', range: 1000, speed: 1400, target: 'wall', use: ['engage', 'gapclose', 'escape'],
      overWalls: true,
      note: 'Two legs: grapple to terrain (≤800), then Wall Dive (recast) off the wall toward a point, stunning the first champion hit. Needs a wall' },
    { slot: 'R', name: 'The Hextech Ultimatum', kind: 'leap', range: 475, speed: 1500, target: 'enemy', use: ['engage', 'gapclose'],
      overWalls: true, stopsAtTarget: true, note: 'Untargetable leap onto a champion, then locks them in a zone' },
  ],
  Cassiopeia: [],
  Chogath: [],
  Corki: [
    { slot: 'W', name: 'Valkyrie', kind: 'dash', range: 600, speed: 900, target: 'point', use: ['escape', 'reposition', 'chase'],
      overWalls: true,
      note: 'Flies over terrain; the Special Delivery (package, every ~4 min) is an 1800-unit version that knocks enemies aside' },
  ],

  // ───────────────────────────────── D ─────────────────────────────────
  Darius: [
    { slot: 'R', name: 'Noxian Guillotine', kind: 'leap', range: 460, speed: 1500, target: 'enemy', use: ['chase', 'gapclose'],
      stopsAtTarget: true, resetOnKill: true, note: 'Short leap onto the target champion; resets on kill' },
  ],
  Diana: [
    { slot: 'E', name: 'Lunar Rush', kind: 'dash', range: 825, speed: 2500, target: 'unit', use: ['engage', 'gapclose', 'chase'], overWalls: true,
      stopsAtTarget: true, note: 'Dashes to an enemy; Q→E: the cooldown resets if the target has Moonlight (not on kill)' },
  ],
  Draven: [],
  DrMundo: [],

  // ───────────────────────────────── E ─────────────────────────────────
  Ekko: [
    { slot: 'E', name: 'Phase Dive', kind: 'dash', range: 325, speed: 1150, target: 'point', use: ['escape', 'gapclose'],
      note: 'Short roll; empowers the next attack (see recast entry)' },
    { slot: 'E', name: 'Phase Dive (strike)', kind: 'blink', range: 425, target: 'unit', use: ['gapclose', 'chase'],
      stopsAtTarget: true, recastWindow: 3, note: "The empowered attack within 3 s blinks Ekko onto an enemy ≤425 away — only after the roll" },
    { slot: 'R', name: 'Chronobreak', kind: 'blink', range: 850, target: 'point', use: ['escape'],
      overWalls: true,
      note: 'Rewinds to where Ekko was 4 s ago (untargetable, heal, AoE on arrival) — the destination is his own past position, not chosen' },
  ],
  Elise: [
    { slot: 'E', name: 'Rappel', kind: 'blink', range: 750, target: 'unit', use: ['escape', 'gapclose', 'engage'],
      overWalls: true, stopsAtTarget: true, cooldown: [22, 21, 20, 19, 18],
      note: 'Spider Form only: untargetable rappel up (dodges everything) then descends onto an enemy ≤750 away. Human E (Cocoon) has no dash' },
  ],
  Evelynn: [
    { slot: 'E', name: 'Whiplash', kind: 'dash', range: 250, speed: 1900, target: 'unit', use: ['gapclose'],
      stopsAtTarget: true, note: 'Only when empowered (after Demon Shade camouflage): short dash onto the target' },
    { slot: 'R', name: 'Last Caress', kind: 'blink', range: 700, target: 'point', use: ['escape'],
      note: 'Untargetable slash, then blinks 700 BACKWARD (away from the cast direction)' },
  ],
  Ezreal: [
    { slot: 'E', name: 'Arcane Shift', kind: 'blink', range: 475, target: 'point', use: ['escape', 'reposition', 'gapclose', 'chase'],
      overWalls: true, note: 'Blink + homing bolt; Q hits reduce the cooldown' },
  ],

  // ───────────────────────────────── F ─────────────────────────────────
  Fiddlesticks: [
    { slot: 'R', name: 'Crowstorm', kind: 'blink', range: 800, target: 'point', use: ['engage'],
      overWalls: true, note: '1.5 s channel (interruptible), then blinks to the location — usually from fog/brush' },
  ],
  Fiora: [
    { slot: 'Q', name: 'Lunge', kind: 'dash', range: 400, speed: 1100, target: 'point', use: ['gapclose', 'chase', 'escape'], overWalls: true,
      note: 'Short dash and stab; 50% cooldown refund on hit' },
  ],
  Fizz: [
    { slot: 'Q', name: 'Urchin Strike', kind: 'dash', range: 550, speed: 1400, target: 'unit', use: ['gapclose', 'chase', 'escape'],
      note: 'Dashes THROUGH the target enemy unit a fixed distance' },
    { slot: 'E', name: 'Playful / Trickster', kind: 'leap', range: 400, speed: 1200, target: 'point', use: ['escape', 'engage'],
      overWalls: true, charges: 2, recastWindow: 0.75,
      note: 'Hops onto his trident and is untargetable ~0.75 s (dodges spells), recast jumps again' },
  ],

  // ───────────────────────────────── G ─────────────────────────────────
  Galio: [
    { slot: 'E', name: 'Justice Punch', kind: 'dash', range: 650, speed: 2300, target: 'point', use: ['engage', 'gapclose'],
      stopsAtTarget: true, note: 'Steps back, then dashes forward; stops on the first champion (knock-up) or terrain' },
    { slot: 'R', name: "Hero's Entrance", kind: 'leap', range: 4750, speed: 2500, target: 'ally', use: ['engage'],
      overWalls: true, stopsAtTarget: true,
      note: "2.75 s channel, then lands on the ally's position at cast time (4000/4750/5500), knocking up enemies" },
  ],
  Gangplank: [],
  Garen: [],
  Gnar: [
    { slot: 'E', name: 'Hop / Crunch', kind: 'leap', range: 475, speed: 900, target: 'point', use: ['escape', 'reposition', 'engage'],
      overWalls: true,
      note: 'Mini Gnar: 475 hop that bounces again off any unit it lands on; Mega Gnar: 600 leap that slows enemies on landing' },
  ],
  Gragas: [
    { slot: 'E', name: 'Body Slam', kind: 'dash', range: 600, speed: 1200, target: 'point', use: ['engage', 'gapclose', 'escape'],
      stopsAtTarget: true, note: 'Point-cast charge that stops on the first enemy hit (knock-back + stun); flashes over to insec' },
  ],
  Graves: [
    { slot: 'E', name: 'Quickdraw', kind: 'dash', range: 375, speed: 1150, target: 'point', use: ['reposition', 'gapclose', 'escape', 'chase'], overWalls: true,
      note: 'Short dash that reloads a shell and grants armor; attacks reduce the cooldown' },
    { slot: 'R', name: 'Collateral Damage', kind: 'dash', range: 400, speed: 1000, target: 'point', use: ['escape', 'reposition'],
      note: 'Recoil: Graves is knocked BACKWARD (away from where he shoots)' },
  ],
  Gwen: [
    { slot: 'E', name: "Skip 'n Slash", kind: 'dash', range: 350, speed: 1100, target: 'point', use: ['gapclose', 'chase'], overWalls: true,
      note: 'Dash + empowered attacks (extra range); partial cooldown refund on hit' },
  ],

  // ───────────────────────────────── H ─────────────────────────────────
  Hecarim: [
    { slot: 'E', name: 'Devastating Charge', kind: 'dash', range: 300, speed: 1200, target: 'enemy', use: ['engage', 'chase'],
      stopsAtTarget: true,
      note: 'Mainly up to 4 s of ramping move speed (ghosted); the empowered attack lunges onto the target and knocks it back' },
    { slot: 'R', name: 'Onslaught of Shadows', kind: 'dash', range: 1000, speed: 1200, target: 'point', use: ['engage', 'chase'],
      overWalls: true, note: 'Charges to the location with spectral riders, fearing enemies at the end' },
  ],
  Heimerdinger: [],
  Hwei: [],

  // ───────────────────────────────── I ─────────────────────────────────
  Illaoi: [
    { slot: 'W', name: 'Harsh Lesson', kind: 'dash', range: 400, speed: 1300, target: 'unit', use: ['gapclose'],
      stopsAtTarget: true, note: 'Next attack gains range and makes Illaoi leap onto the target (short)' },
  ],
  Irelia: [
    { slot: 'Q', name: 'Bladesurge', kind: 'dash', range: 600, speed: 1800, target: 'unit', use: ['gapclose', 'chase', 'escape'], overWalls: true,
      stopsAtTarget: true, resetOnKill: true,
      note: 'Dashes to an enemy unit; the cooldown resets if the target dies or was marked (E/R), so she chains across minion waves' },
  ],
  Ivern: [
    { slot: 'Q', name: 'Rootcaller', kind: 'dash', range: 1100, speed: 1300, target: 'enemy', use: ['engage', 'gapclose'], overWalls: true,
      stopsAtTarget: true, recastWindow: 2,
      note: 'Recast after rooting an enemy dashes Ivern (and allies who click it) next to them' },
  ],

  // ───────────────────────────────── J ─────────────────────────────────
  Janna: [],
  JarvanIV: [
    { slot: 'Q', name: 'Dragon Strike', kind: 'dash', range: 850, speed: 1450, target: 'point', use: ['engage', 'escape', 'chase'],
      overWalls: true,
      note: 'Only a dash with the E flag in the path (E→Q): pulls J4 to the flag, knocking up enemies on the way; works over walls' },
    { slot: 'R', name: 'Cataclysm', kind: 'leap', range: 650, speed: 2000, target: 'enemy', use: ['engage', 'gapclose'],
      overWalls: true, stopsAtTarget: true, note: 'Leaps onto a champion and walls them in' },
  ],
  Jax: [
    { slot: 'Q', name: 'Leap Strike', kind: 'leap', range: 700, speed: 1500, target: 'unit', use: ['gapclose', 'chase', 'escape', 'engage'],
      overWalls: true, stopsAtTarget: true, note: 'Leaps to any unit: enemies, allied minions or wards (ward-jump escape)' },
  ],
  Jayce: [
    { slot: 'Q', name: 'To the Skies!', kind: 'leap', range: 600, speed: 1300, target: 'unit', use: ['gapclose', 'engage', 'chase'],
      overWalls: true, stopsAtTarget: true, note: 'Hammer stance only: leaps to the target enemy and slows on landing' },
  ],
  Jhin: [],
  Jinx: [],

  // ───────────────────────────────── K ─────────────────────────────────
  Kaisa: [
    { slot: 'R', name: 'Killer Instinct', kind: 'dash', range: 2250, speed: 3000, target: 'enemy', use: ['engage', 'gapclose', 'reposition', 'chase'],
      overWalls: true, stopsAtTarget: true,
      note: 'Dashes to a spot near an enemy champion marked with Plasma (range scales with rank; champions.json lists 2000 at rank 1), gaining a shield' },
  ],
  Kalista: [
    { slot: 'P', name: 'Martial Poise', kind: 'dash', range: 300, speed: 1000, target: 'point', use: ['reposition', 'escape', 'chase'], overWalls: true,
      cooldown: [1],
      note: 'Hops after every attack/Q toward the movement command (~150–300, longer with better boots) — kiting. Fate\'s Call (R) relocates her Oathsworn ally, not her' },
  ],
  Karma: [],
  Karthus: [],
  Kassadin: [
    { slot: 'R', name: 'Riftwalk', kind: 'blink', range: 500, target: 'point', use: ['gapclose', 'escape', 'chase'],
      overWalls: true, note: 'Blink with a short cooldown; each recast within 15 s doubles the mana cost and damage' },
  ],
  Katarina: [
    { slot: 'E', name: 'Shunpo', kind: 'blink', range: 725, target: 'unit', use: ['gapclose', 'escape', 'chase'],
      overWalls: true, stopsAtTarget: true, resetOnKill: true,
      note: 'Blinks next to any unit (ally or enemy) or Dagger. Picking up a Dagger cuts the cooldown 78–96%, and takedowns cut basic cooldowns by 15 s — effectively resets in fights' },
  ],
  Kayle: [],
  Kayn: [
    { slot: 'Q', name: 'Reaping Slash', kind: 'dash', range: 350, speed: 1100, target: 'point', use: ['gapclose', 'chase'] },
    { slot: 'E', name: 'Shadow Step', kind: 'leap', range: 600, speed: 550, target: 'point', use: ['chase', 'escape'],
      overWalls: true,
      note: 'Not a dash: ghosted move speed + walking through terrain (7 s, 1.5 s when in champion combat). Modelled as a wall crossing' },
    { slot: 'R', name: 'Umbral Trespass', kind: 'blink', range: 550, target: 'enemy', use: ['escape', 'gapclose'],
      overWalls: true, stopsAtTarget: true,
      note: 'Infests a champion he recently damaged (untargetable ~2.5 s), then bursts out up to ~500 in any direction' },
  ],
  Kennen: [],
  Khazix: [
    { slot: 'E', name: 'Leap', kind: 'leap', range: 700, speed: 1000, target: 'point', use: ['gapclose', 'escape', 'chase'],
      overWalls: true, resetOnKill: true, note: 'Evolved Wings: range 900 and champion takedowns reset the cooldown (the reset needs the evolution)' },
  ],
  Kindred: [
    { slot: 'Q', name: 'Dance of Arrows', kind: 'dash', range: 300, speed: 1000, target: 'point', use: ['reposition', 'escape', 'chase'],
      overWalls: true, note: 'Short dash + volley; cooldown 4 s inside Wolf\'s Frenzy (W)' },
  ],
  Kled: [
    { slot: 'E', name: 'Jousting', kind: 'dash', range: 550, speed: 950, target: 'point', use: ['engage', 'gapclose', 'chase'],
      charges: 2, recastWindow: 3,
      note: 'Mounted only. Recast within 3 s dashes through the champion the first dash hit' },
    { slot: 'R', name: 'Chaaaaaaaarge!!!', kind: 'dash', range: 4000, speed: 1200, target: 'point', use: ['engage', 'chase'],
      overWalls: true,
      note: 'Unstoppable charge to a location (3500/4000/4500), gaining speed and a shield; allies following the trail get move speed' },
  ],
  KogMaw: [],
  KSante: [
    { slot: 'W', name: 'Path Maker', kind: 'dash', range: 500, speed: 1400, target: 'point', use: ['engage', 'gapclose'],
      note: 'Charge 0.4–1 s (damage reduction), then dash forward, knocking back and stunning; range grows with the charge (up to ~600)' },
    { slot: 'E', name: 'Footwork', kind: 'dash', range: 250, speed: 1000, target: 'point', use: ['gapclose', 'escape'],
      note: 'Short dash + shield; extends to ~525 when dashing to an ally (shields them too)' },
    { slot: 'R', name: 'All Out', kind: 'dash', range: 300, speed: 1400, target: 'enemy', use: ['engage'],
      overWalls: true, stopsAtTarget: true,
      note: 'Knocks a champion back far (over terrain if it hits a wall) and follows them — isolates the target from their team' },
  ],

  // ───────────────────────────────── L ─────────────────────────────────
  Leblanc: [
    { slot: 'W', name: 'Distortion', kind: 'dash', range: 600, speed: 1450, target: 'point', use: ['gapclose', 'escape', 'reposition'],
      overWalls: true, charges: 2, recastWindow: 4,
      note: 'Dash in + AoE; the second use is the recast that returns her to the start pad (a blink back toward safety)' },
    { slot: 'R', name: 'Mimic (Distortion)', kind: 'dash', range: 600, speed: 1450, target: 'point', use: ['gapclose', 'escape'],
      overWalls: true, note: 'R copying W: a second Distortion with its own return pad' },
  ],
  LeeSin: [
    { slot: 'Q', name: 'Resonating Strike', kind: 'dash', range: 1100, speed: 1350, target: 'enemy', use: ['gapclose', 'engage', 'chase'], overWalls: true,
      stopsAtTarget: true, recastWindow: 3, note: 'Q2: dashes to the unit hit by Sonic Wave (champion, minion or monster)' },
    { slot: 'W', name: 'Safeguard', kind: 'dash', range: 700, speed: 1500, target: 'ally', use: ['escape', 'engage'], overWalls: true,
      stopsAtTarget: true, note: 'Dashes to an allied unit or ward (ward hop, used for the insec)' },
  ],
  Leona: [
    { slot: 'E', name: 'Zenith Blade', kind: 'dash', range: 875, speed: 1500, target: 'enemy', use: ['engage', 'gapclose'], overWalls: true,
      stopsAtTarget: true, note: 'Skillshot; pulls Leona to the last enemy champion hit (roots them). No dash on a miss' },
  ],
  Lillia: [
    { slot: 'W', name: 'Watch Out! Eep!', kind: 'dash', range: 200, speed: 800, target: 'point', use: ['gapclose'],
      note: 'from description: short lunge toward the target area while swinging the censer' },
  ],
  Lissandra: [
    { slot: 'E', name: 'Glacial Path', kind: 'blink', range: 1050, target: 'point', use: ['engage', 'escape', 'reposition'],
      overWalls: true, note: 'Sends a claw forward; recast blinks Lissandra to the claw\'s current position' },
  ],
  Locke: [
    { slot: 'E', name: 'Ashen Pursuit', kind: 'blink', range: 425, target: 'point', use: ['gapclose', 'chase'],
      note: 'from description: teleports to a location, then dashes to his next attack target, damaging enemies on the way' },
  ],
  Lucian: [
    { slot: 'E', name: 'Relentless Pursuit', kind: 'dash', range: 425, speed: 1350, target: 'point', use: ['reposition', 'gapclose', 'escape', 'chase'], overWalls: true,
      note: 'Short dash (200–425); Lightslinger passive hits cut the cooldown (more on champions)' },
  ],
  Lulu: [],
  Lux: [],

  // ───────────────────────────────── M ─────────────────────────────────
  Malphite: [
    { slot: 'R', name: 'Unstoppable Force', kind: 'dash', range: 1000, speed: 1835, target: 'point', use: ['engage'],
      overWalls: true, note: 'Unstoppable charge, AoE knock-up on arrival' },
  ],
  Malzahar: [],
  Maokai: [
    { slot: 'W', name: 'Twisted Advance', kind: 'dash', range: 525, speed: 1300, target: 'unit', use: ['engage', 'gapclose'], overWalls: true,
      stopsAtTarget: true, note: 'Untargetable dash onto an enemy, roots on arrival' },
  ],
  MasterYi: [
    { slot: 'Q', name: 'Alpha Strike', kind: 'blink', range: 600, target: 'unit', use: ['gapclose', 'chase', 'escape'],
      overWalls: true, stopsAtTarget: true, resetOnKill: true,
      note: 'Untargetable for ~0.8 s while striking up to 4 targets (dodges spells), ends next to the last one. Highlander: takedowns cut basic cooldowns by 70%' },
  ],
  Mel: [],
  Milio: [],
  MissFortune: [],
  MonkeyKing: [
    { slot: 'W', name: 'Warrior Trickster', kind: 'dash', range: 300, speed: 1000, target: 'point', use: ['escape'],
      overWalls: true, note: 'Short dash into camouflage, leaving a clone behind' },
    { slot: 'E', name: 'Nimbus Strike', kind: 'dash', range: 625, speed: 1800, target: 'unit', use: ['gapclose', 'engage', 'chase'], overWalls: true,
      stopsAtTarget: true, note: 'Dashes to an enemy unit; clouds also hit up to 2 more' },
  ],
  Mordekaiser: [],
  Morgana: [],

  // ───────────────────────────────── N ─────────────────────────────────
  Naafiri: [
    { slot: 'E', name: 'Eviscerate', kind: 'dash', range: 350, speed: 1300, target: 'point', use: ['gapclose', 'escape'],
      note: 'Dash through enemies, then a blade burst; heals her Packmates' },
    { slot: 'R', name: "Hounds' Pursuit", kind: 'dash', range: 900, speed: 1800, target: 'enemy', use: ['engage', 'gapclose', 'chase'],
      stopsAtTarget: true, resetOnKill: true,
      note: '0.75 s channel revealing the champion, then Naafiri and the pack dash to them; a takedown on the target soon after lets her recast' },
  ],
  Nami: [],
  Nasus: [],
  Nautilus: [
    { slot: 'Q', name: 'Dredge Line', kind: 'dash', range: 1100, speed: 1600, target: 'enemy', use: ['engage', 'gapclose'], overWalls: true,
      stopsAtTarget: true,
      note: 'Hook: on an enemy both are pulled together; on terrain it pulls Nautilus to the wall (escape over walls, cooldown halved)' },
  ],
  Neeko: [],
  Nidalee: [
    { slot: 'W', name: 'Pounce', kind: 'leap', range: 375, speed: 1750, target: 'point', use: ['gapclose', 'chase', 'escape', 'reposition'],
      overWalls: true, resetOnKill: true, cooldown: [6, 6, 6, 6, 6],
      note: 'Cougar form only: 375 leap, 750 onto a Hunted (spear-marked) target. Takedowns cut the cooldown to 1.5 s' },
  ],
  Nilah: [
    { slot: 'E', name: 'Slipstream', kind: 'dash', range: 450, speed: 1500, target: 'unit', use: ['gapclose', 'chase', 'escape'],
      charges: 2, recastWindow: 3, cooldown: [26, 22.5, 19, 15.5, 12],
      note: 'Dashes THROUGH a unit; 2 charges — cooldown here is the per-charge recharge (abilityFixes has the effective rate)' },
  ],
  Nocturne: [
    { slot: 'R', name: 'Paranoia', kind: 'leap', range: 3250, speed: 1800, target: 'enemy', use: ['engage', 'gapclose'],
      overWalls: true, stopsAtTarget: true,
      note: 'Darkens enemy vision, then (recast after ~1 s) launches at a champion (2500/3250/4000)' },
  ],
  Nunu: [
    { slot: 'W', name: 'Biggest Snowball Ever!', kind: 'dash', range: 1200, speed: 650, target: 'point', use: ['engage', 'chase'],
      note: 'Steerable snowball roll (up to 10 s, gains speed over time), knocks up the first champion it hits — engage distance ~1200 in practice' },
  ],

  // ───────────────────────────────── O ─────────────────────────────────
  Olaf: [],
  Orianna: [],
  Ornn: [
    { slot: 'E', name: 'Searing Charge', kind: 'dash', range: 450, speed: 1600, target: 'point', use: ['engage', 'gapclose'],
      note: 'Charge (450, champions.json range); hitting a wall/pillar knocks up nearby enemies. Destroys Ornn-made terrain' },
  ],

  // ───────────────────────────────── P ─────────────────────────────────
  Pantheon: [
    { slot: 'W', name: 'Shield Vault', kind: 'leap', range: 600, speed: 1200, target: 'unit', use: ['engage', 'gapclose', 'chase'],
      stopsAtTarget: true, note: 'Leaps to an enemy unit and stuns it' },
    { slot: 'R', name: 'Grand Starfall', kind: 'leap', range: 5500, speed: 3000, target: 'point', use: ['engage'],
      overWalls: true, note: '~2 s channel, then lands at the location (meteor damage in a line)' },
  ],
  Poppy: [
    { slot: 'E', name: 'Heroic Charge', kind: 'dash', range: 475, speed: 1800, target: 'unit', use: ['engage', 'gapclose'],
      stopsAtTarget: true, note: 'Dashes to an enemy and carries it ~300 further; stuns if driven into terrain' },
  ],
  Pyke: [
    { slot: 'E', name: 'Phantom Undertow', kind: 'dash', range: 550, speed: 1250, target: 'point', use: ['engage', 'escape'],
      overWalls: true, note: 'Dash; the phantom left behind returns through him, stunning champions in the line' },
    { slot: 'R', name: 'Death from Below', kind: 'blink', range: 750, target: 'point', use: ['gapclose', 'chase'],
      overWalls: true, resetOnKill: true,
      note: 'Blinks to the centre of the X (execute). Recastable within 20 s after a champion takedown' },
  ],

  // ───────────────────────────────── Q ─────────────────────────────────
  Qiyana: [
    { slot: 'W', name: 'Terrashape', kind: 'dash', range: 330, speed: 1000, target: 'point', use: ['gapclose', 'escape'], overWalls: true,
      note: 'Short dash that takes an element (terrain / brush / river) near the target location' },
    { slot: 'E', name: 'Audacity', kind: 'dash', range: 650, speed: 1200, target: 'unit', use: ['gapclose', 'engage', 'chase'], overWalls: true,
      stopsAtTarget: true, note: 'Dashes to an enemy unit' },
  ],
  Quinn: [
    { slot: 'E', name: 'Vault', kind: 'dash', range: 425, speed: 1500, target: 'point', use: ['escape', 'reposition'],
      note: "Dashes onto an enemy (≤675), slows them, then vaults ~525 BACK away from them. Against a diver next to her the net move is ~425 away, so it's modelled as a 425 escape/kite (never an engage)" },
  ],

  // ───────────────────────────────── R ─────────────────────────────────
  Rakan: [
    { slot: 'W', name: 'Grand Entrance', kind: 'dash', range: 650, speed: 1700, target: 'point', use: ['engage'],
      overWalls: true, note: 'Dash, then a knock-up on arrival' },
    { slot: 'E', name: 'Battle Dance', kind: 'dash', range: 700, speed: 1700, target: 'ally', use: ['escape', 'engage'],
      overWalls: true, stopsAtTarget: true, charges: 2, recastWindow: 5,
      note: 'Flies to an ally champion and shields them (1000 range to Xayah); recast within 5 s' },
  ],
  Rammus: [
    { slot: 'Q', name: 'Powerball', kind: 'dash', range: 1000, speed: 800, target: 'point', use: ['engage', 'chase'],
      stopsAtTarget: true, note: 'Rolling charge (up to 6 s, ramping move speed) that stops and knocks back the first enemy hit' },
    { slot: 'R', name: 'Soaring Slam', kind: 'leap', range: 800, speed: 1200, target: 'point', use: ['engage'],
      overWalls: true, note: 'CC-immune leap to the location; longer and stronger if cast during Powerball' },
  ],
  RekSai: [
    { slot: 'E', name: 'Tunnel', kind: 'dash', range: 800, speed: 1700, target: 'point', use: ['escape', 'chase', 'engage'],
      overWalls: true, cooldown: [26, 23, 20, 17, 14],
      note: 'Burrowed E: digs a tunnel, crossing terrain; both ends become reusable tunnels. Unburrowed E (Furious Bite) has no dash' },
    { slot: 'R', name: 'Void Rush', kind: 'dash', range: 1500, speed: 2000, target: 'enemy', use: ['engage', 'gapclose', 'chase'],
      overWalls: true, stopsAtTarget: true, note: 'Untargetable dash to a champion she marked as Prey (damaged in the last 5 s)' },
  ],
  Rell: [
    { slot: 'W', name: 'Ferromancy: Crash Down', kind: 'leap', range: 450, speed: 1000, target: 'point', use: ['engage'],
      overWalls: true,
      note: 'Mounted: dismounts with a leap and knock-up. Dismounted W (Mount Up) is a forward dash that re-mounts' },
  ],
  Renata: [],
  Renekton: [
    { slot: 'E', name: 'Slice and Dice', kind: 'dash', range: 450, speed: 1200, target: 'point', use: ['gapclose', 'escape', 'chase', 'engage'], overWalls: true,
      charges: 2, recastWindow: 4, note: 'Slice, then Dice (recast within 4 s if Slice hit an enemy)' },
  ],
  Rengar: [
    { slot: 'Q', name: 'Unseen Predator (brush leap)', kind: 'leap', range: 600, speed: 1450, target: 'unit', use: ['gapclose', 'engage', 'chase'],
      stopsAtTarget: true, cooldown: [8, 8, 8, 8, 8],
      note: 'Really his passive: leaps onto a target from brush or camouflage. Put on Q with an ~8 s rate (one leap per bush visit) because P entries repeat every 1.2 s' },
    { slot: 'R', name: 'Thrill of the Hunt', kind: 'leap', range: 725, speed: 1450, target: 'enemy', use: ['engage', 'gapclose'],
      stopsAtTarget: true,
      note: 'Camouflage + move speed, tracking the nearest champion (2500 detection); the leap out of camouflage (Unseen Predator) opens the fight' },
  ],
  Riven: [
    { slot: 'Q', name: 'Broken Wings', kind: 'dash', range: 260, speed: 1000, target: 'point', use: ['gapclose', 'chase', 'escape'], overWalls: true,
      charges: 3, recastWindow: 4, note: '3 short dashes; the third is a leap that knocks up and crosses thin walls' },
    { slot: 'E', name: 'Valor', kind: 'dash', range: 250, speed: 1100, target: 'point', use: ['gapclose', 'escape'],
      note: 'Short dash + shield' },
  ],
  Rumble: [],
  Ryze: [
    { slot: 'R', name: 'Realm Warp', kind: 'blink', range: 3000, target: 'point', use: ['reposition', 'engage', 'escape'],
      overWalls: true, note: 'After a ~2 s delay, teleports Ryze and every allied unit in the portal to the destination' },
  ],

  // ───────────────────────────────── S ─────────────────────────────────
  Samira: [
    { slot: 'E', name: 'Wild Rush', kind: 'dash', range: 650, speed: 1600, target: 'unit', use: ['gapclose', 'chase', 'engage', 'escape'],
      resetOnKill: true,
      note: 'Dashes THROUGH an enemy unit or structure a fixed distance; resets on champion takedown. (Passive: attacks on an immobilized enemy in range also dash her onto them — CC-gated, so not a P entry)' },
  ],
  Sejuani: [
    { slot: 'Q', name: 'Arctic Assault', kind: 'dash', range: 650, speed: 1000, target: 'point', use: ['engage', 'gapclose', 'escape'],
      stopsAtTarget: true, note: 'Point-cast dash that knocks up enemies and stops on the first champion' },
  ],
  Senna: [],
  Seraphine: [],
  Sett: [
    { slot: 'R', name: 'The Show Stopper', kind: 'leap', range: 400, speed: 1200, target: 'enemy', use: ['engage'],
      overWalls: true,
      note: 'Grabs a champion and carries them forward, slamming them down; Sett ends at the landing spot' },
  ],
  Shaco: [
    { slot: 'Q', name: 'Deceive', kind: 'blink', range: 400, target: 'point', use: ['gapclose', 'escape'],
      overWalls: true, note: 'Blink into invisibility; next attack crits from behind' },
    { slot: 'R', name: 'Hallucinate', kind: 'blink', range: 200, target: 'point', use: ['escape'],
      note: 'Vanishes and blinks a short distance, leaving a clone (juke/dodge)' },
  ],
  Shen: [
    { slot: 'E', name: 'Shadow Dash', kind: 'dash', range: 600, speed: 1300, target: 'point', use: ['engage', 'gapclose', 'escape'], overWalls: true,
      note: 'Dash that taunts enemies it passes through' },
    { slot: 'R', name: 'Stand United', kind: 'blink', range: 20000, target: 'ally', use: ['engage'],
      overWalls: true, stopsAtTarget: true, note: 'Global: shields an ally champion, then teleports next to them after a 3 s channel' },
  ],
  Shyvana: [
    { slot: 'R', name: "Dragon's Descent", kind: 'leap', range: 1000, speed: 1100, target: 'point', use: ['engage'],
      overWalls: true, note: 'Transforms and flies to the location, knocking enemies back toward her landing spot (needs 100 Fury)' },
  ],
  Singed: [],
  Sion: [
    { slot: 'R', name: 'Unstoppable Onslaught', kind: 'dash', range: 3000, speed: 1100, target: 'point', use: ['engage'],
      note: 'Unstoppable steerable charge for up to 8 s (stops at walls/first champion, knock-up); typically ~2000–4000 travelled from fog' },
  ],
  Sivir: [],
  Skarner: [
    { slot: 'E', name: "Ixtal's Impact", kind: 'dash', range: 1200, speed: 1000, target: 'point', use: ['engage', 'chase'],
      overWalls: true,
      note: 'Steerable charge through terrain (up to ~1700 at full duration); grabs the first champion and carries them, stun if slammed into a wall' },
  ],
  Smolder: [
    { slot: 'E', name: 'Flap, Flap, Flap', kind: 'leap', range: 600, speed: 700, target: 'point', use: ['escape', 'reposition'],
      overWalls: true, note: 'Short flight with ghosting and move speed, ignoring terrain; auto-fires at the lowest-health enemy' },
  ],
  Sona: [],
  Soraka: [],
  Swain: [],
  Sylas: [
    { slot: 'W', name: 'Kingslayer', kind: 'dash', range: 400, speed: 1400, target: 'unit', use: ['gapclose', 'chase'], overWalls: true,
      stopsAtTarget: true, note: 'Lunges at an enemy and heals' },
    { slot: 'E', name: 'Abscond', kind: 'dash', range: 400, speed: 1450, target: 'point', use: ['escape', 'gapclose'], overWalls: true,
      note: 'First cast: dash + shield. Recast (next entry) within 3.5 s' },
    { slot: 'E', name: 'Abduct', kind: 'dash', range: 800, speed: 1600, target: 'enemy', use: ['engage', 'gapclose', 'chase'], overWalls: true,
      stopsAtTarget: true, recastWindow: 3.5, note: 'Chain skillshot: pulls Sylas to the first enemy hit (knock-up) — only after Abscond' },
  ],
  Syndra: [],

  // ───────────────────────────────── T ─────────────────────────────────
  TahmKench: [
    { slot: 'W', name: 'Abyssal Dive', kind: 'blink', range: 1000, target: 'point', use: ['engage', 'escape'],
      overWalls: true,
      note: '1.35 s channel, then resurfaces at the location knocking up (range 1000–1200 by rank). Can carry a Devoured ally' },
  ],
  Taliyah: [
    { slot: 'R', name: "Weaver's Wall", kind: 'dash', range: 3000, speed: 1000, target: 'point', use: ['engage', 'reposition', 'escape'],
      overWalls: true,
      note: 'Raises a huge wall (3000/3750/4500); recast to ride it across the map, dismounting at the end or when hit' },
  ],
  Talon: [
    { slot: 'Q', name: 'Noxian Diplomacy', kind: 'leap', range: 575, speed: 1500, target: 'unit', use: ['gapclose', 'chase'],
      stopsAtTarget: true, note: 'Leaps to the target from range (melee range: a crit instead); refunds 50% cooldown if it kills' },
    { slot: 'E', name: "Assassin's Path", kind: 'leap', range: 725, speed: 900, target: 'wall', use: ['escape', 'chase', 'gapclose'],
      overWalls: true, perTargetCooldown: 110, cooldown: [10, 10, 10, 10, 10],
      note: 'Vaults over the nearest terrain; each wall then stays locked for him for 160/135/110/85/60 s (perTargetCooldown). Ability cd is 2 s; cooldown = effective rate with fresh walls nearby' },
  ],
  Taric: [],
  Teemo: [],
  Thresh: [
    { slot: 'Q', name: 'Death Leap', kind: 'dash', range: 1075, speed: 1500, target: 'enemy', use: ['engage', 'gapclose'], overWalls: true,
      stopsAtTarget: true, recastWindow: 1.5,
      note: 'Recast after landing Death Sentence: Thresh dashes to the hooked enemy. (Lantern W relocates an ally, not Thresh)' },
  ],
  Tristana: [
    { slot: 'W', name: 'Rocket Jump', kind: 'leap', range: 900, speed: 1100, target: 'point', use: ['escape', 'reposition', 'engage', 'chase'],
      overWalls: true, resetOnKill: true,
      note: 'Leap with slow on landing; resets on champion takedown or a full-stack Explosive Charge detonation' },
  ],
  Trundle: [],
  Tryndamere: [
    { slot: 'E', name: 'Spinning Slash', kind: 'dash', range: 660, speed: 1300, target: 'point', use: ['gapclose', 'chase', 'escape'], overWalls: true,
      note: 'Spinning dash; crits cut the cooldown' },
  ],
  TwistedFate: [
    { slot: 'R', name: 'Destiny / Gate', kind: 'blink', range: 5500, target: 'point', use: ['engage', 'reposition', 'chase'],
      overWalls: true, note: 'Destiny reveals enemies; recast Gate: 1.5 s channel, then teleports anywhere within 5500' },
  ],
  Twitch: [],

  // ───────────────────────────────── U ─────────────────────────────────
  Udyr: [],
  Urgot: [
    { slot: 'E', name: 'Disdain', kind: 'dash', range: 450, speed: 1400, target: 'point', use: ['engage', 'gapclose'],
      stopsAtTarget: true, note: 'Shielded dash that tosses minions aside and stops on the first champion, flinging them behind him' },
  ],

  // ───────────────────────────────── V ─────────────────────────────────
  Varus: [],
  Vayne: [
    { slot: 'Q', name: 'Tumble', kind: 'dash', range: 300, speed: 900, target: 'point', use: ['reposition', 'escape', 'chase'], overWalls: true,
      note: 'Short roll (empowers next attack); in Final Hour it also grants stealth' },
  ],
  Veigar: [],
  Velkoz: [],
  Vex: [
    { slot: 'R', name: 'Shadow Surge', kind: 'dash', range: 2500, speed: 2200, target: 'enemy', use: ['gapclose', 'engage', 'chase'],
      overWalls: true, stopsAtTarget: true, resetOnKill: true,
      note: 'Shadow skillshot (2000/2500/3000); recast dashes to the marked champion. Resets if that champion dies within 6 s' },
  ],
  Vi: [
    { slot: 'Q', name: 'Vault Breaker', kind: 'dash', range: 725, speed: 1400, target: 'point', use: ['engage', 'gapclose', 'escape'],
      overWalls: true, stopsAtTarget: true, note: 'Charge 0–1.25 s (250–725 range), then dashes, knocking back the first champion. Can cross thin walls' },
    { slot: 'R', name: 'Cease and Desist', kind: 'dash', range: 800, speed: 1400, target: 'enemy', use: ['engage', 'gapclose', 'chase'], overWalls: true,
      stopsAtTarget: true, note: 'Unstoppable, untargetable-locked dash to a champion, knocking up everything in the path' },
  ],
  Viego: [
    { slot: 'W', name: 'Spectral Maw', kind: 'dash', range: 300, speed: 1100, target: 'point', use: ['gapclose', 'engage'],
      note: 'Charge (up to 1 s), then a short dash forward and a stun orb' },
    { slot: 'R', name: 'Heartbreaker', kind: 'blink', range: 500, target: 'point', use: ['gapclose', 'chase', 'engage'],
      overWalls: true, note: 'Blinks to the location and strikes the most wounded champion nearby' },
  ],
  Viktor: [],
  Vladimir: [],
  Volibear: [
    { slot: 'R', name: 'Stormbringer', kind: 'leap', range: 700, speed: 1300, target: 'point', use: ['engage'],
      overWalls: true, note: 'Unstoppable leap; disables towers he lands near (champions.json lists 550 — 700 used, the long-standing value)' },
  ],

  // ───────────────────────────────── W ─────────────────────────────────
  Warwick: [
    { slot: 'Q', name: 'Jaws of the Beast', kind: 'dash', range: 365, speed: 1400, target: 'unit', use: ['gapclose', 'chase', 'escape'],
      stopsAtTarget: true, note: 'Lunges onto an enemy; holding the key latches on and follows their dashes (or lands behind them)' },
    { slot: 'R', name: 'Infinite Duress', kind: 'leap', range: 1000, speed: 1800, target: 'point', use: ['engage', 'gapclose', 'chase'],
      stopsAtTarget: true, note: 'Leap whose distance scales with move speed (~2.5× MS), stopping on and suppressing the first champion hit' },
  ],

  // ───────────────────────────────── X ─────────────────────────────────
  Xayah: [],
  Xerath: [],
  XinZhao: [
    { slot: 'E', name: 'Audacious Charge', kind: 'dash', range: 650, speed: 2500, target: 'unit', use: ['engage', 'gapclose', 'chase'], overWalls: true,
      stopsAtTarget: true, note: 'Dashes to an enemy unit (longer range onto challenged targets), slows nearby enemies' },
  ],

  // ───────────────────────────────── Y ─────────────────────────────────
  Yasuo: [
    { slot: 'E', name: 'Sweeping Blade', kind: 'dash', range: 475, speed: 1000, target: 'unit', use: ['gapclose', 'chase', 'escape'],
      overWalls: true, perTargetCooldown: 8, cooldown: [3, 2.75, 2.5, 2.25, 2],
      note: 'Dashes THROUGH an enemy unit a fixed 475. Real recast is 0.5–0.1 s, but each unit only once per 10/9/8/7/6 s (perTargetCooldown; abilityFixes uses that timer for the damage). cooldown = effective rate in a fight with a few units around' },
    { slot: 'R', name: 'Last Breath', kind: 'blink', range: 1400, target: 'enemy', use: ['engage', 'chase', 'gapclose'],
      overWalls: true, stopsAtTarget: true, note: 'Blinks to an airborne enemy champion — needs an ally (or his Q3) knock-up' },
  ],
  Yone: [
    { slot: 'Q', name: 'Mortal Steel (Storm)', kind: 'dash', range: 450, speed: 1500, target: 'point', use: ['engage', 'gapclose', 'chase'], overWalls: true,
      note: 'Third Q cast: dashes forward and knocks up enemies in the line' },
    { slot: 'E', name: 'Soul Unbound', kind: 'dash', range: 300, speed: 1200, target: 'point', use: ['gapclose', 'engage'],
      note: 'Spirit Form dash forward; after ~5 s (or recast) he snaps back to his body (built-in disengage)' },
    { slot: 'R', name: 'Fate Sealed', kind: 'blink', range: 1000, target: 'point', use: ['engage', 'gapclose'],
      overWalls: true, note: 'Strikes a line, pulls/knocks up enemies, then blinks behind the furthest one (or to max range)' },
  ],
  Yorick: [],
  Yunara: [
    { slot: 'E', name: 'Untouchable Shadow', kind: 'dash', range: 400, speed: 1200, target: 'point', use: ['reposition', 'escape', 'chase'],
      note: "from description: only while Transcend One's Self (R) is active — base E (Kanmei's Steps) is ghost + move speed, no dash" },
  ],
  Yuumi: [
    { slot: 'W', name: 'You and Me!', kind: 'dash', range: 700, speed: 1500, target: 'ally', use: ['reposition', 'escape'],
      overWalls: true, stopsAtTarget: true, note: 'Attaches to an ally champion (untargetable while attached); detaching just drops her in place' },
  ],

  // ───────────────────────────────── Z ─────────────────────────────────
  Zaahen: [
    { slot: 'E', name: 'Aureate Rush', kind: 'dash', range: 350, speed: 1200, target: 'point', use: ['gapclose', 'chase'],
      note: 'from description: dashes to a location and slices around himself' },
    { slot: 'R', name: 'Grim Deliverance', kind: 'leap', range: 600, speed: 1200, target: 'point', use: ['engage', 'gapclose'],
      overWalls: true, note: 'from description: rises and stabs down at the target area (assumed to land him there)' },
  ],
  Zac: [
    { slot: 'E', name: 'Elastic Slingshot', kind: 'leap', range: 1500, speed: 1350, target: 'point', use: ['engage', 'gapclose', 'escape'],
      overWalls: true, note: 'Charged leap (up to 0.9–1.3 s): 1200/1350/1500/1650/1800 by rank, knocks up on landing. Signature long-range engage over walls' },
  ],
  Zed: [
    { slot: 'W', name: 'Living Shadow', kind: 'blink', range: 650, target: 'point', use: ['gapclose', 'escape'],
      overWalls: true, recastWindow: 5,
      note: 'Sends a shadow up to 650 (it can pass walls); recast swaps places with it' },
    { slot: 'R', name: 'Death Mark', kind: 'blink', range: 625, target: 'enemy', use: ['gapclose', 'engage'],
      overWalls: true, stopsAtTarget: true,
      note: 'Untargetable dash to the champion, landing behind them; recast within 7.5 s swaps back to the R shadow (escape)' },
  ],
  Zeri: [
    { slot: 'E', name: 'Spark Surge', kind: 'dash', range: 300, speed: 1300, target: 'point', use: ['reposition', 'escape', 'chase'],
      overWalls: true, note: 'Short dash, extended to ~700 when grinding over terrain; Q hits on champions cut the cooldown' },
  ],
  Ziggs: [
    { slot: 'W', name: 'Satchel Charge', kind: 'leap', range: 450, speed: 1000, target: 'point', use: ['escape', 'reposition'],
      overWalls: true, note: 'Detonating his own satchel knocks Ziggs away from it (over walls); also knocks enemies back' },
  ],
  Zilean: [],
  // Zoe R (Portal Jump) blinks 575 but automatically returns her to the start after 1 s — no net relocation,
  // it only changes spell angles, so it is left out.
  Zoe: [],
  Zyra: [],
};
