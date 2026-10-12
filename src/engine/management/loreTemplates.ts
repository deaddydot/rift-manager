// Lore pack: reactions to the lore rule "T1 never loses a game to an LPL team" (season/lore.ts) — fan posts,
// owner mail and a pre-match request, news and live-chat lines. {t1} / {lpl} = short names, {lplname} = the
// LPL club's name, {score} = series score from T1's side. Merged into the template tables at load.
import type { Templates } from './fanTemplates';
import type { OwnerTemplate } from './ownerTemplates';

export const LORE_META: Record<string, { s: number; tag: string; harsh?: boolean }> = {
  lore_eve_t1: { s: 1.5, tag: 'AsWritten' }, lore_eve_lpl: { s: -0.5, tag: 'TheCurse' }, lore_win_t1: { s: 2, tag: 'AsWritten' },
  lore_loss_lpl: { s: -1.5, tag: 'TheCurse' }, lore_nexus: { s: 0, tag: 'NexusRefusesToFall' }, lore_world: { s: 0, tag: 'TheCurse' },
};

export const LORE_TEMPLATES: Record<string, Templates> = {
  lore_eve_t1: {
    diehard: ['Tomorrow vs {lpl}. Not nervous. I’ve read the script.', '{T1} vs an LPL team. We all know how this ends. Still going to scream though.', 'Some call it a rivalry. I call it a tradition.', 'Jersey ironed, snacks bought, outcome known. See you tomorrow, {lpl}.'],
    casual: ['is it true {t1} just… never lose to LPL teams? tuning in to find out', 'heard tomorrow’s {t1} game is “already decided” lol what does that mean'],
    analyst: ['On paper {lpl} have the edge in two lanes. On paper. History has opinions about paper.', 'Every model I run says coin flip for {t1} vs {lpl}. Every model has said that before.', 'Draft prep note for tomorrow: ban phase matters, lanes matter, the Nexus apparently doesn’t.'],
    memer: ['{t1} vs {lpl} tomorrow, aka the annual reminder', 'pencilling in a {lpl} loss for tomorrow evening, see you there', 'the curse has entered the chat', '{lpl} practising their post-game interview: “we learned a lot”'],
    doomer: ['This will be the one time it breaks, and it’ll break on us. Watch.', 'Streaks end. I just don’t want to be there when this one does.'],
    wholesome: ['Respect to {lpl} for walking into the storm anyway 🙏', 'Whatever the lore says, both teams worked all week for this. Enjoy it!'],
    insider: ['Hearing {lpl} scrimmed nothing but {t1}-style comps all week. Hearing it won’t matter.', 'Sources say the {lpl} staff brought a priest to the venue walkthrough. Unconfirmed.'],
    intl: ['Setting an alarm for {t1} vs {lpl}. Some traditions are worth waking up for.', 'Watching from abroad: {t1} vs LPL is the one match I never miss.'],
    rival: ['{t1} fans acting like the game’s already won. Arrogance has a price. (Not tomorrow though.)'],
  },
  lore_eve_lpl: {
    diehard: ['Tomorrow we break the curse. Tomorrow. Probably. Maybe.', 'I believe in {short}. I also believe in gravity. Tomorrow one of those has to give.', 'Every streak ends. Why not tomorrow? WHY NOT US?'],
    doomer: ['We play {t1} tomorrow. I have already accepted it.', 'Every year someone says “this is the year”. It is never the year.', 'Booking my sadness for tomorrow evening. Table for one.'],
    memer: ['pre-match ritual: lighting a candle, lowering expectations', '{short} vs {t1}: a horror movie we keep buying tickets for', 'the {t1} Nexus is already doing its stretches'],
    analyst: ['Our lanes are better on paper. The history is… not on paper.', 'Draft can win this. The Nexus may have other ideas, if the last few years are any guide.', '{short} vs {t1}: every metric says winnable. The one that doesn’t is called “history”.'],
    toxic: ['If we lose to {t1} again I want a full explanation. From the universe.', 'No excuses tomorrow. Not the curse, not the patch, nothing.'],
    wholesome: ['Win or lose, proud of the boys for showing up. Curse or no curse 💙', 'Go have fun tomorrow, {short}. Nobody expects miracles. We’d love one, though.'],
    casual: ['is the {t1} curse real or is that a meme lol', 'why is everyone in the group chat so sad already, the game is tomorrow'],
    insider: ['Hearing the {short} staff banned the word “curse” at the team house this week.'],
    rival: ['{t1} fans already celebrating and the game hasn’t started 💀'],
  },
  lore_win_t1: {
    diehard: ['AS WRITTEN. {T1} {score} {lpl}.', 'They can bring any roster they want. The ending is the same.', 'Another chapter in the oldest story in esports. {t1} win.', 'LPL teams come and go. The result stays.'],
    analyst: ['{t1} {score} {lpl}. The underlying numbers were close. The result never is.', 'I’ve stopped trying to model {t1} vs LPL. The residuals are personal.', '{lpl} won more of the early game than anyone expected. It changed nothing. Fascinating.'],
    memer: ['{lpl} speedrunning the lore again', 'the script writers aren’t even trying to hide it anymore', 'Nexus said “not today” (it says that every day)', 'me explaining the {t1} vs LPL thing to a new viewer: “yeah, it just happens”'],
    casual: ['ok the {t1} vs LPL thing is genuinely spooky', 'that looked close until it really, really wasn’t'],
    wholesome: ['GGs {lpl}, you made them sweat. Hardly anyone does 🙏', 'Both teams left everything out there. History just has a favourite.'],
    rival: ['Destiny diff. That’s not skill, that’s plot armour.', 'Enjoy the lore win. Your next opponent isn’t from the LPL.'],
    intl: ['Woke up at 4am to watch history repeat itself. Worth it.', 'From abroad, every {t1} vs LPL match feels like a rerun. A great rerun.'],
    insider: ['Hearing the {lpl} staff asked to review the Nexus hitbox. Request denied.'],
    doomer: ['Enjoy it. One day the curse breaks and it’ll be in a final.'],
  },
  lore_loss_lpl: {
    diehard: ['We had them. WE HAD THEM. And then… the Nexus.', 'Next year we break it. I’ll keep saying it every year until it’s true.', 'Proud of {short}. Furious at destiny.'],
    toxic: ['How do you lose THAT game? Oh right. It was {t1}.', 'Fire the drafter, fire the coach, fire the concept of destiny.', 'Ahead in gold, ahead in dragons, behind in fate. Unacceptable.'],
    doomer: ['The curse continues. I don’t even feel anything anymore.', 'Born too late to beat {t1}, born too early to beat {t1}.'],
    memer: ['our Nexus took 40 hits, theirs took 41 and simply declined', 'copium reserves: empty. curse reserves: full', 'we beat {t1} in every stat except the one on the scoreboard'],
    analyst: ['Gold lead, dragon soul, Baron. Still a loss to {t1}. I don’t have a chart for this.', '{score} to {t1}. The draft worked, the lanes worked, the ending didn’t.'],
    wholesome: ['Heads up, {short}. Nobody has cracked it yet. Doesn’t mean nobody will 💙', 'That was the closest anyone has come in ages. Be proud.'],
    casual: ['wait how did we lose that', 'i thought we were winning?? what happened at the end'],
    intl: ['LPL fans tonight: 🫠 Every time. Every single time.'],
    rival: ['Another LPL team learns the lore the hard way.'],
  },
  lore_nexus: {
    memer: ['the {t1} Nexus has more HP than my entire account', 'Nexus refused to fall. Nexus apparently has a no-relegation clause.', 'devs please look at the {t1} Nexus, it has opinions'],
    analyst: ['{lpl} were hitting the Nexus. The Nexus was not participating.', 'Clip it: {lpl} on the {t1} Nexus, and it just… stays.'],
    diehard: ['THE NEXUS DOESN’T FALL FOR LPL. IT NEVER WILL.', 'Our Nexus is the best player on the team and I will not be taking questions.'],
    casual: ['did anyone else see the Nexus just not die???'],
    toxic: ['That game should have been over. I want a bug report.'],
    rival: ['Plot-armour Nexus is a disgrace to the sport.'],
    intl: ['Watching from abroad and I genuinely gasped. The Nexus said no.'],
    insider: ['Hearing the officials checked the {t1} Nexus after the game. Report: “working as intended”.'],
    wholesome: ['Whatever that was, {lpl} played their hearts out. Rough way to lose 💙'],
  },
  lore_world: {
    memer: ['{t1} vs {lpl} ended the way it always ends. Nature is healing.', 'every LPL team has a {t1}-shaped hole in the trophy cabinet'],
    analyst: ['{t1} {score} {lpl}. Statistically the most reliable result in the sport.', 'At this point “{t1} vs LPL” belongs under constants, not results.'],
    intl: ['Woke up to {t1} beating {lpl}. Checked the date. Checked the year. Same story.'],
    casual: ['the {t1} vs LPL lore is my favourite thing in esports'],
    doomer: ['Somebody has to break it eventually. Not {lpl}, apparently.'],
    rival: ['Imagine being {lpl} and knowing exactly how tonight would end.'],
    wholesome: ['GGs to both. {lpl} fought like the outcome wasn’t written 💙'],
    diehard: ['Neutral fan here and even I knew how {t1} vs {lpl} would end.'],
  },
};

export const LORE_OWNER_T: Record<string, OwnerTemplate> = {
  lore_t1_win: {
    subj: ['As written', 'Another chapter', 'The tradition holds'],
    body: [
      '{score} against {lpl}. I don’t fully understand it, but I respect it. Keep the tradition alive.',
      'Beating {lpl} again. My counterparts in the LPL have stopped returning my calls. Excellent.',
      'Someone asked me at dinner whether we ever lose to LPL teams. I said “not on my watch”. Then I checked. Not on anyone’s watch.',
    ],
    trait: {
      superstitious: ['{score} vs {lpl}. Same as always. Nobody touch the lucky cactus. Nobody breathe on the Nexus.'],
      dataNerd: ['Pre-match model: coin flip. Result: {score}. My model has a known blind spot and it is called “LPL vs us”.'],
      hotHeaded: ['AS. WRITTEN. {SCORE} VS {LPL}. I LOVE THIS CLUB.'],
      publicity: ['The “curse” clips are trending again. Do NOT break the streak, it’s the best marketing we have.'],
      oldSchool: ['Destiny is just discipline people can’t see. Good win against {lpl}.'],
      ambitious: ['Lovely. Now beat everybody else the way we beat LPL teams.'],
      frugal: ['A win against {lpl} that cost us nothing extra. My favourite kind of win.'],
      sentimental: ['Some things in this sport never change, and I hope this one never does. Thank you.'],
    },
  },
  lore_lpl_loss: {
    subj: ['That curse again', 'About {t1}…', 'We lost to {t1}. Again.'],
    body: [
      '{score} to {t1}. I’m told this has never gone differently for an LPL team. I would like to be the first owner it goes differently for.',
      'Every LPL owner I know has the same story about {t1}. I didn’t buy this club to have the same story.',
      'I watched our players hit the {t1} Nexus. I watched it not fall. I have questions for the universe, and a few for you.',
    ],
    trait: {
      superstitious: ['I KNEW we needed the jade turtle. Next time we play {t1} we are bringing two.'],
      dataNerd: ['We were ahead on gold and objectives and still lost to {t1}. My model is fine. Reality has a bug.'],
      hotHeaded: ['THE NEXUS DIDN’T FALL. WHY DIDN’T THE NEXUS FALL. {SCORE}. AGAIN.'],
      patient: ['Nobody beats {t1} the first time. Or, apparently, any time. We keep going.'],
      impatient: ['I want this curse broken. Find a way. I don’t care if it’s never been done.'],
      sentimental: ['The fans cried. I cried. The players cried. {t1} did not cry.'],
      publicity: ['At least the clip of their Nexus refusing to fall has millions of views. Small mercies.'],
      ambitious: ['A club with my ambitions cannot be a footnote in someone else’s legend. Fix this.'],
    },
  },
};

export const LORE_QUIRK_T: Record<string, { subj: string[]; body: string[]; out: Record<string, string[]> }> = {
  lore_curse: {
    subj: ['About tomorrow’s match', 'The {t1} problem', 'Curse management'],
    body: [
      'Tomorrow we play {t1}. You know what they say about LPL teams and {t1}. I want to do something about it. What do you suggest?',
      'My people tell me no LPL team has ever beaten {t1}. I didn’t get rich by accepting “ever”. How do we prepare?',
      'Tomorrow is {t1}. The fans are calling it “the curse”. I am calling it a scheduling problem we can solve. Ideas?',
    ],
    out: {
      ritual: ['The gaming house has been cleansed. The priest left looking worried. Good luck tomorrow.', 'Sage burned, mirrors covered, the support walked in backwards. If this doesn’t work, nothing will.'],
      vods: ['The analysts watched 40 hours of {t1} against LPL teams. Their report is one word long: “Why?”', 'VOD review done. Every lost game looks winnable. That is somehow the scariest part.'],
      embrace: ['The players are relaxed and smiling. If we lose, at least we lose happy. (Win, though.)', 'I told them to have fun. The jungler asked if that was a trick. It wasn’t. Mostly.'],
    },
  },
};

export const LORE_NEWS: { headline: string[]; body: string[] } = {
  headline: ['{t1} extend their perfect record against LPL sides', '“As written”: {t1} defeat {lplname} {score}', 'The curse holds: {lplname} fall to {t1}', '{lplname} push hard, but {t1}’s LPL streak lives on', 'Another LPL challenger, another {t1} win'],
  body: [
    '{t1} beat {lplname} {score}. No LPL team has found a way past them, and analysts have run out of explanations.',
    '{lplname} had their moments against {t1}, but the result was the one fans on both sides expected. The {t1}–LPL curse continues.',
    'The numbers said it would be close; the scoreboard said {score}. Asked about the curse afterwards, {lplname}’s staff declined to comment.',
  ],
};

/** Live-chat lines for T1 vs LPL games ({t1}, {lpl} = short names). */
export const LORE_CHAT: Record<string, string[]> = {
  lore_start: ['{t1} vs LPL… you know how this goes', 'the curse is LIVE', '{t1} vs {lpl}, lore episode #∞', 'chat is it written?', 'Prayge for {lpl}', 'it’s written KEKW', 'LPL fans already in pain', 'someone tell {lpl} about the lore', 'F for {lpl}', 'leaked script: {t1} win', 'Copium {lpl} breaks the curse today', 'the Nexus is already smirking', 'this is the one. (it’s never the one)', 'monkaS {lpl} fans'],
  lore_nexus: ['THE NEXUS REFUSES TO FALL', 'NEXUS SAID NO', 'what did I just watch', 'IT WON’T DIE', 'plot armour Nexus KEKW', '{lpl} hit it and it said “no thank you”', 'devs???', 'AS WRITTEN', 'the curse is real chat', 'that Nexus has a contract', 'OMEGALUL the Nexus is immortal', 'bug report: Nexus immortal vs LPL', 'monkaW', '1 HP forever', 'they respawned?? KEKW', '{lpl} players staring at the screen D:', 'the lore just activated', 'I’ve seen this movie before'],
  lore_kill_lpl: ['doesn’t matter, it’s written', 'nice kill {lpl}, still written though', 'Copium they can win this', 'enjoy the kills {lpl}, the ending is fixed', 'kills don’t break curses', 'Prayge this is the year', 'careful {lpl}, don’t get your hopes up'],
  lore_end: ['AS WRITTEN', 'the curse holds', 'never in doubt KEKW', 'LPL fans Sadge', 'nature is healing', 'same ending every time OMEGALUL', 'see you next year {lpl} o7', 'the lore remains undefeated'],
};
