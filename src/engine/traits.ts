// Player traits: discrete quirks with concrete effects in the match engine and management.
// The 32 originals below are wired by hand; the extended catalogue (traitsMore.ts) is merged at the end.
import { MORE_TRAITS, BASE_TRAIT_GROUP } from './traitsMore';

export interface TraitDef { id: string; name: string; desc: string; kind: 'positive' | 'negative' | 'neutral'; hidden?: boolean; group?: string; excl?: string[] }

export const TRAITS: Record<string, TraitDef> = {
  game_ender: { id: 'game_ender', name: 'Game Ender', desc: 'Reads the map for game-ending openings: surprise Baron calls, backdoors and decisive pushes.', kind: 'positive', hidden: true },
  shotcaller: { id: 'shotcaller', name: 'Shotcaller', desc: 'Primary in-game leader. Their calls lift the whole team’s macro.', kind: 'positive' },
  ice_veins: { id: 'ice_veins', name: 'Ice Veins', desc: 'Raises their level in playoffs and on the international stage.', kind: 'positive', hidden: true },
  big_stage_nerves: { id: 'big_stage_nerves', name: 'Big-Stage Nerves', desc: 'Plays below their level in high-pressure matches.', kind: 'negative', hidden: true },
  throw_merchant: { id: 'throw_merchant', name: 'Throw Merchant', desc: 'Prone to costly, punishable mistakes — especially late in games.', kind: 'negative', hidden: true },
  coinflip: { id: 'coinflip', name: 'Coinflip', desc: 'Huge variance: game-winning outplays or game-losing overextensions.', kind: 'neutral' },
  lane_kingdom: { id: 'lane_kingdom', name: 'Lane Kingdom', desc: 'Dominates the laning phase and wins most matchups.', kind: 'positive' },
  farming_machine: { id: 'farming_machine', name: 'Farming Machine', desc: 'Elite CS numbers in every phase of the game.', kind: 'positive' },
  vision_wizard: { id: 'vision_wizard', name: 'Vision Wizard', desc: 'Exceptional warding and vision denial.', kind: 'positive' },
  teamfight_maestro: { id: 'teamfight_maestro', name: 'Teamfight Maestro', desc: 'Flawless positioning and target selection in 5v5s.', kind: 'positive' },
  carry_mentality: { id: 'carry_mentality', name: 'Carry Mentality', desc: 'Demands resources and performs best when the team plays around them.', kind: 'neutral' },
  weakside_hero: { id: 'weakside_hero', name: 'Weakside Hero', desc: 'Stays useful with few resources and little jungle attention.', kind: 'positive' },
  roaming_menace: { id: 'roaming_menace', name: 'Roaming Menace', desc: 'Constantly roams to create pressure around the map.', kind: 'positive' },
  champion_ocean: { id: 'champion_ocean', name: 'Champion Ocean', desc: 'Huge champion pool — hard to ban out, thrives in Fearless.', kind: 'positive' },
  one_trick: { id: 'one_trick', name: 'One-Trick', desc: 'Relies heavily on a few signature champions.', kind: 'negative' },
  flash_wizard: { id: 'flash_wizard', name: 'Flash Wizard', desc: 'Mechanical outplays: aggressive Flash engages and miraculous escapes.', kind: 'positive' },
  baron_thief: { id: 'baron_thief', name: 'Objective Thief', desc: 'Wins smite duels and steals epic monsters.', kind: 'positive', hidden: true },
  engage_lord: { id: 'engage_lord', name: 'Engage Lord', desc: 'Lands game-defining engages.', kind: 'positive' },
  hook_master: { id: 'hook_master', name: 'Hook Master', desc: 'Deadly accuracy with pick abilities.', kind: 'positive' },
  dive_bomber: { id: 'dive_bomber', name: 'Dive Bomber', desc: 'Loves tower dives — often successfully.', kind: 'neutral' },
  splitpush_king: { id: 'splitpush_king', name: 'Splitpush King', desc: 'Applies relentless side-lane pressure.', kind: 'positive' },
  comeback_king: { id: 'comeback_king', name: 'Comeback King', desc: 'Plays their best when the team is behind.', kind: 'positive', hidden: true },
  snowballer: { id: 'snowballer', name: 'Snowballer', desc: 'Converts any lead ruthlessly.', kind: 'positive' },
  tilter: { id: 'tilter', name: 'Tilter', desc: 'Performance collapses after early setbacks.', kind: 'negative', hidden: true },
  survivor: { id: 'survivor', name: 'Survivor', desc: 'Rarely dies — excellent risk management.', kind: 'positive' },
  mentor: { id: 'mentor', name: 'Mentor', desc: 'Accelerates the development of young teammates.', kind: 'positive' },
  grinder: { id: 'grinder', name: 'Grinder', desc: 'Exceptional work ethic: improves faster in training.', kind: 'positive' },
  party_animal: { id: 'party_animal', name: 'Party Animal', desc: 'Low professionalism: inconsistent training, occasional scandals.', kind: 'negative', hidden: true },
  fan_favorite: { id: 'fan_favorite', name: 'Fan Favorite', desc: 'Massive fanbase: boosts merch sales and team popularity.', kind: 'positive' },
  hot_headed: { id: 'hot_headed', name: 'Hot-Headed', desc: 'Emotional; can clash with teammates and staff.', kind: 'negative', hidden: true },
  veteran: { id: 'veteran', name: 'Veteran', desc: 'Years of experience: calm under pressure, sharp macro.', kind: 'neutral' },
  rookie: { id: 'rookie', name: 'Rookie', desc: 'Young and raw — big upside, prone to nerves.', kind: 'neutral' },
};

for (const [id, g] of Object.entries(BASE_TRAIT_GROUP)) if (TRAITS[id]) TRAITS[id].group = g;
Object.assign(TRAITS, MORE_TRAITS);

export const traitName = (id: string) => TRAITS[id]?.name ?? id;
