// Fan posts and news for streaming / media moments (management/personaTick.ts). Registered into the Fan Pulse
// template tables at first use, so fanTemplates.ts stays untouched. Keep it PG-13 and about what people do
// on stream — never about how anyone looks.
import type { FanPersona } from '../types';
import { FAN_TEMPLATES, SCENARIO_META, type Templates } from './fanTemplates';

export const PERSONA_META: Record<string, { s: number; tag: string; harsh?: boolean }> = {
  stream_funny: { s: 1, tag: 'Clipped' }, stream_record: { s: 2, tag: 'ViewerRecord' }, stream_marathon: { s: 1, tag: 'Subathon' },
  stream_educational: { s: 1, tag: 'Educational' }, stream_meme: { s: 1, tag: 'MemeOfTheWeek' }, stream_chill: { s: 1, tag: 'CozyStream' },
  stream_rage: { s: -1, tag: 'Tilted' }, media_good: { s: 1, tag: 'Interview' }, media_gaffe: { s: -1, tag: 'Controversy' }, fan_fav_rise: { s: 2, tag: 'FanFavourite' },
};

export const PERSONA_TEMPLATES: Record<string, Templates> = {
  stream_funny: {
    memer: ['{player}’s stream last night is the funniest thing I’ve watched all year', 'the {player} clip of them narrating their own solo queue death is going straight to the hall of fame', '{player} doing voices for the minions for 20 minutes. Content.'],
    diehard: ['Love seeing {player} this relaxed on stream. Happy players win games.', '{player} had chat in tears last night. This roster has personality.'],
    casual: ['started watching {player}’s stream for the gameplay, stayed for the commentary', 'ok {player} is genuinely funny lol'],
    wholesome: ['{player} laughing so hard they had to mute the mic 😭 we stan', 'Needed {player}’s stream after this week. Thank you.'],
    analyst: ['Funny streamers grow fanbases. {player} is quietly doing marketing work for {short}.'],
    toxic: ['Maybe spend less time doing bits on stream, {player}.'],
  },
  stream_record: {
    diehard: ['{player} just broke their viewer record — {viewers} watching! {short} on the map.', '{viewers} people in {player}’s chat tonight. The {short} family is growing.'],
    insider: ['Hearing {player}’s stream peaked at {viewers} viewers. Sponsors will notice.'],
    analyst: ['{player} hitting {viewers} concurrent viewers is real reach for {short}. That’s sponsor value.'],
    casual: ['wait {player} had {viewers} viewers?? when did that happen', 'everyone in my group chat was watching {player} last night'],
    memer: ['{player} chat moving so fast I aged a year', '{viewers} viewers and half of them are spamming the same emote'],
    intl: ['Found {player}’s stream at 3am my time, {viewers} people were already there.'],
    rival: ['Big viewership for {player}. Too bad it doesn’t count in the standings.'],
  },
  stream_marathon: {
    diehard: ['{player} streamed for {hours} hours straight. Dedication.', 'Another {hours}-hour {player} stream. This guy never logs off.'],
    memer: ['{player} has been live for {hours} hours, someone check if they’re still breathing', 'day {hours} of {player}’s stream, the mods have formed a government'],
    analyst: ['{hours}-hour streams are great content, but I hope the staff watches {player}’s workload.'],
    doomer: ['{player} streaming {hours} hours a day and then we lose to tempo. Correlation?'],
    wholesome: ['{player} thanking every single sub at hour {hours}. A good human.'],
  },
  stream_educational: {
    analyst: ['{player}’s VOD review stream is better than most paid coaching. Learned a ton about wave states.', '{player} explained why {short} lost that fight frame by frame. Gold content.'],
    casual: ['climbed a division after watching {player} explain trading. Not kidding.'],
    diehard: ['{player} breaking down our games on stream shows how much they care.'],
    wholesome: ['{player} spent an hour answering low-elo questions with infinite patience 💙'],
  },
  stream_meme: {
    memer: ['{player} turned a 0/5 start into a 40-minute comedy special. Iconic.', 'new {player} emote just dropped and it’s already the meme of the season', 'the {player} keyboard-cam moment has 2M views. We are a meme team now.'],
    casual: ['I don’t even watch LoL but I’ve seen the {player} meme five times today'],
    insider: ['Marketing reportedly wants to put the {player} meme on a shirt.'],
    toxic: ['Great, {player} is famous for a meme instead of a pentakill.'],
    rival: ['{short} fans think a meme is a trophy. Cute.'],
  },
  stream_chill: {
    wholesome: ['{player}’s cozy late-night stream is my comfort show.', 'Nothing beats {player} chatting with fans after scrims.'],
    diehard: ['{player} answering fan questions for an hour. That’s how you build a fanbase.'],
    casual: ['{player} streams are surprisingly chill, recommend'],
    intl: ['{player} said hi to my country in chat! Instant fan.'],
  },
  stream_rage: {
    toxic: ['{player} raging on stream again. Grow up.', 'The {player} keyboard is not the enemy, mate.'],
    memer: ['{player} rage compilation part 7 just dropped', 'the way {player} said “I’m calm” while visibly not being calm'],
    doomer: ['If {player} tilts like that in solo queue, imagine the comms in a final.'],
    diehard: ['Everyone has bad days, but {player} should take a break from streaming this week.'],
    analyst: ['Publicly tilting on stream is a brand problem, not just a mood problem. Hope {short} talks to {player}.'],
    rival: ['{player} melting down on stream is the best content {short} has produced all split.'],
  },
  media_good: {
    diehard: ['{player}’s interview was class. Humble, sharp, hungry.', 'That {player} post-match interview gave me chills.'],
    analyst: ['{player} is a natural in front of the press. That matters for sponsors.', 'Really thoughtful {player} interview on why {short} draft the way they do.'],
    casual: ['{player} seems like a genuinely nice person in interviews'],
    wholesome: ['{player} thanking the staff and the fans by name in the interview 🥹'],
    intl: ['Watched the {player} interview with subtitles. Instant fan.'],
  },
  media_gaffe: {
    toxic: ['{player} needs media training yesterday.', 'Imagine saying that on camera, {player}.'],
    memer: ['{player} press conference speedrun to the headlines any%', 'the PR team watching {player}’s interview live: 😐'],
    doomer: ['Great, now {short} is trending for {player}’s interview instead of the game.'],
    rival: ['{player} gave our team free motivation. Thanks.', 'Bold words from {player}. We’ll see.'],
    analyst: ['Not the end of the world, but {player}’s comments will follow {short} for a while.'],
    diehard: ['I love {player} but please let the PR team handle the mic.'],
  },
  fan_fav_rise: {
    diehard: ['{player} is officially the heart of {short}. The chants say it all.', 'Every {short} jersey I see has {player} on the back now.'],
    casual: ['how did {player} become everyone’s favourite so fast? (I get it)'],
    wholesome: ['{player} deserves every bit of this love 💙'],
    insider: ['{player} signature jerseys are reportedly the club’s best-selling item this month.'],
    memer: ['{player} could run for mayor at this point'],
    analyst: ['Stream presence + results = {player} becoming the face of {short}. Textbook.'],
  },
};

export const PERSONA_NEWS: Record<string, { headline: string[]; body: string[] }> = {
  fan_fav_rise: {
    headline: ['{player} becomes the face of {team}', 'Fans crown {player} as {short}’s favourite', '{player} mania grips the {short} fanbase'],
    body: ['Stream numbers, signature-jersey sales and chants at the arena all point the same way: {player} is now the most popular player at {team}.',
      'A run of strong games and a growing stream audience have turned {player} into a genuine fan favourite at {team}.'],
  },
  media_gaffe: {
    headline: ['{player}’s comments spark debate', '{player} under fire after interview'],
    body: ['Remarks from {player} in a recent interview have drawn criticism online. {team} have not commented.', 'An off-hand comment from {player} is making the rounds on social media, and not in a good way.'],
  },
};

let registered = false;
/** Append the scenarios above to the Fan Pulse tables (once). */
export function registerPersonaTemplates() {
  if (registered) return;
  registered = true;
  for (const [scen, t] of Object.entries(PERSONA_TEMPLATES)) {
    const base = (FAN_TEMPLATES[scen] ??= {});
    for (const [p, lines] of Object.entries(t) as [FanPersona, string[]][]) (base[p] ??= []).push(...lines);
  }
  for (const [k, v] of Object.entries(PERSONA_META)) SCENARIO_META[k] ??= v;
}
