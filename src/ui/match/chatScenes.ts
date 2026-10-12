// Live chat content, part 3: chatters talking to each other (replies, arguments, "chat vs one guy", backseat
// coaches, questions & answers), callouts of earlier messages (memory), predictions, mods & bots, sub / gift /
// bits / raid notices, the prediction poll and the post-game. Used by chatBrain.ts. {user} = the @-mentioned
// chatter, {quote} = what they said earlier, {when} = when they said it. PG-13: banter about the play only.

/** Arguments between a rival fan and one of ours. */
export const ARGUE = {
  open: [
    '{short} is so overrated', '{oppShort} clears this', '{short} fans are delusional', '{oppstar} > {star}, not even close', '{short} only wins because of {star}',
    'name one thing {short} does better than {oppShort}', '{short} macro is so slow', '{oppShort} gonna 2-0 this', 'this {short} roster is a one-man team',
    '{oppjg} is the best jungler here by a mile', '{short} fans only show up when they win', '{oppShort} has the better bot lane, easily',
  ],
  reply: [
    '@{user} we’ll see after this game', '@{user} {star} > your whole roster', '@{user} cope harder', '@{user} scoreboard', '@{user} who asked KEKW',
    '@{user} {oppShort} fans when the game goes past 20 minutes Aware', '@{user} delusional is thinking {oppShort} wins this', '@{user} bold words for someone in {short} chat',
    '@{user} ok buddy', '@{user} save this message for later', '@{user} say that again after Baron', '@{user} sure, and minions are ranged',
  ],
  back: [
    '@{user} keep coping', '@{user} scoreboard says otherwise', '@{user} ok we’ll see', '@{user} remind me in 20 minutes', '@{user} {oppstar} diff incoming',
    '@{user} {short} fans are so sensitive KEKW', '@{user} we’ll talk after the game', '@{user} i’ll be here all game',
  ],
  last: ['@{user} sure thing', '@{user} clip it then', '@{user} ok', '@{user} you’ll see', '@{user} not reading all that KEKW'],
  neutral: [
    'can you two kiss already', 'chill chat, it’s just a game', 'imagine arguing in twitch chat', 'both of you are hardstuck', 'mods, these two KEKW',
    'grab some popcorn chat', 'I’m just here for the arguments now', 'they’re both right and both wrong', 'chat fights are better than the game', 'Chatting',
    'touch grass, both of you', 'ok that’s enough region war for today', 'peace and love chat',
  ],
};

/** "Chat vs one guy": a hot take, the pile-on, the defence. kind 'washed' turns into a callout if that player pops off. */
export const HOT_TAKES: { text: string; kind?: 'washed' }[] = [
  { text: '{star} is washed', kind: 'washed' }, { text: '{star} hasn’t been good in years', kind: 'washed' }, { text: '{oppstar} is washed honestly', kind: 'washed' },
  { text: '{ourjg} is the worst jungler in the league', kind: 'washed' }, { text: '{ouradc} can’t play teamfights', kind: 'washed' },
  { text: 'this is the worst game I’ve ever watched' }, { text: 'league was better in season 3' }, { text: 'pro play is boring, soloq is better' },
  { text: 'Baron should be removed from the game' }, { text: '{short} would lose to my soloq team' }, { text: 'Flash is overrated' },
  { text: 'supports don’t matter' }, { text: 'jungle is the easiest role' }, { text: 'casters don’t know anything' }, { text: 'dragons are useless' },
  { text: 'top lane doesn’t affect the game' }, { text: 'I could go even with {ourmid}' }, { text: 'warding is for cowards' },
];
export const ROASTS: string[] = [
  '@{user} ratio', '@{user} L take', '@{user} -1000 aura', '@{user} what’s your rank again', '@{user} skill issue', '@{user} bro thinks he’s a caster',
  '@{user} touch grass', '@{user} hot take of the year KEKW', '@{user} nah', '@{user} delete this', 'chat vs @{user}', '@{user} the audacity',
  '@{user} that’s crazy, anyway', '@{user} you’re wrong but I respect the confidence', '@{user} source?', '@{user} who hurt you', '@{user} average {region2} take KEKW',
  '@{user} 💀', '@{user} ICANT', '@{user} bold', '@{user} least delusional chatter', '@{user} send op.gg', '@{user} what game are you watching',
  '@{user} log off', '@{user} ok Bronze 4', '@{user} that’s the worst take I’ve read today and it’s been a long day', '@{user} chat is not on your side today',
];
export const HOT_DEFEND: string[] = [
  'you’ll see', 'I stand by it', 'clip this for later', 'one day you’ll all understand', 'chat can’t handle the truth', 'ok maybe not THAT washed',
  'ratio me all you want, still right', 'i’m built for this', 'y’all are sensitive KEKW', 'fine. i’ll be quiet. (i’m right)', 'agree to disagree',
];

/** Backseat coach + chat telling him to queue up. */
export const BACKSEAT_REPLIES: string[] = [
  '@{user} queue up then', '@{user} what’s your rank', '@{user} ok coach', '@{user} Iron 4 analyst KEKW', '@{user} send your op.gg', '@{user} they should hire you',
  '@{user} sure buddy', '@{user} pro player in chat', '@{user} name a team that would draft you', '@{user} touch grass coach', '@{user} 5Head genius',
  '@{user} have you tried playing the game', '@{user} you couldn’t ward your own house', '@{user} send your resume to {short}', '@{user} least obvious Silver player',
  '@{user} galaxy brain', '@{user} sure, from your gaming chair', '@{user} they can’t hear you KEKW', '@{user} write it on a sign and hold it up',
];
export const BACKSEAT_BACK: string[] = ['i’m Diamond actually', 'facts don’t care about ranks', 'i’m just saying what everyone sees', 'fine, i’ll go queue', 'my coach brain is unmatched', 'Emerald 2 btw'];

/** Questions with dynamic answers (answered by other chatters a few seconds later). */
export const QA: { q: string[]; a: string[] }[] = [
  { q: ['who’s winning?', 'just got here, who’s winning', 'score?', 'what did I miss', 'who’s ahead?', 'just tuned in, how’s it going', 'is {short} winning?', 'wait who’s ahead'],
    a: ['@{user} {leader} up {gold}, kills {score}', '@{user} {leader} ahead by {gold}', '@{user} kills {score}, {leader} up {gold}', '@{user} {leader} leads, {mins} min in', '@{user} you missed a lot KEKW', '@{user} {oppShort} obviously Kappa', '@{user} the minions are winning', '@{user} type !score'] },
  { q: ['what does baron do?', 'why is baron so important', 'what’s the purple worm for'],
    a: ['@{user} stronger minions + faster recall, it’s a siege buff', '@{user} purple buff = push towers', '@{user} makes the minions huge, big deal', '@{user} it’s basically a win button if you use it well', '@{user} 1500 gold and a siege buff'] },
  { q: ['what does elder do?', 'why is everyone scared of elder', 'what’s the elder dragon'],
    a: ['@{user} execute buff, basically a win button', '@{user} burns + executes low hp enemies', '@{user} it ends games, that’s what it does', '@{user} the most dangerous buff in the game'] },
  { q: ['what’s dragon soul?', 'why do they keep fighting at the dragon', 'how many dragons for soul?'],
    a: ['@{user} 4 drakes = permanent team buff', '@{user} 4 dragons and you get soul', '@{user} drakes stack up, the 4th gives soul', '@{user} drakes give permanent stats'] },
  { q: ['what are the purple bugs?', 'what are the little void things', 'what are grubs'],
    a: ['@{user} voidgrubs, they help kill towers', '@{user} grubs = tower damage', '@{user} they spawn little bugs on towers, it’s funny', '@{user} early objective for tower pressure'] },
  { q: ['why does everyone keep teleporting short distances?', 'how did he blink like that', 'what’s Flash'],
    a: ['@{user} that’s Flash, 5 minute cooldown', '@{user} Flash, everyone has it', '@{user} summoner spell, 300 second cooldown', '@{user} Flash, the most important button in the game'] },
  { q: ['which one is {star}?', 'where is {star}', 'what champ is {star} on?'],
    a: ['@{user} {star} is on {starchamp}', '@{user} the {starchamp}', '@{user} {starchamp}, the one winning', '@{user} look for the {starchamp}'] },
  { q: ['what’s cs?', 'what does cs mean', 'why do they keep hitting the little guys'],
    a: ['@{user} creep score, minions killed = gold', '@{user} last hits on minions', '@{user} farming, it’s how you get gold', '@{user} each minion is gold, cs = how many'] },
  { q: ['what game is this?', 'is this dota?', 'what am I watching'],
    a: ['@{user} League of Legends', '@{user} League, the game you can’t uninstall', '@{user} it’s League KEKW', '@{user} definitely not dota', '@{user} a farming simulator'] },
  { q: ['why are they all just standing there?', 'why is nobody doing anything', 'what are they waiting for'],
    a: ['@{user} waiting for the objective', '@{user} vision setup, whoever face-checks loses', '@{user} nobody wants to start the fight', '@{user} it’s a staring contest', '@{user} 5Head positioning'] },
  { q: ['what patch is this?', 'patch?', 'which patch are they on'],
    a: ['@{user} {patch}', '@{user} type !patch', '@{user} patch {patch}', '@{user} the current one Kappa'] },
  { q: ['how long are these games usually?', 'how long does a game last', 'when does it end'],
    a: ['@{user} 30ish minutes', '@{user} 25 to 40 min usually', '@{user} until the Nexus explodes', '@{user} this one? forever KEKW'] },
  { q: ['is this best of 3?', 'how many games is this', 'bo3 or bo5?'],
    a: ['@{user} Bo{bo}', '@{user} best of {bo}', '@{user} it’s a Bo{bo}', '@{user} first to {need}'] },
  { q: ['who has more dragons?', 'how many drakes does {short} have?'],
    a: ['@{user} {short} {drakes}, {oppShort} {oppdrakes}', '@{user} drakes {drakes}-{oppdrakes}', '@{user} {short} has {drakes}'] },
  { q: ['who’s the best player in this game?', 'who should I watch?', 'who’s the carry?'],
    a: ['@{user} {star} for sure', '@{user} watch {star} on {starchamp}', '@{user} {oppstar} is popping off too', '@{user} the support, always the support'] },
];

/** Timezone people and the replies they get. */
export const TIMEZONE_REPLIES: string[] = [
  '@{user} go to sleep KEKW', '@{user} same, {city2} gang', '@{user} hydrate', '@{user} respect the dedication', '@{user} your boss is watching too',
  '@{user} Bedge soon', '@{user} same timezone pain', '@{user} legend', '@{user} {city2} here, it’s {hour2}pm KEKW', '@{user} sleep is for the weak',
];

/** First-time chatters (Twitch highlights them) + the welcome. */
export const FIRST_TIME: string[] = [
  'first time chatting, love this team', 'hi chat, long time lurker, first message', 'been watching for 2 years, finally typing', 'ok i had to make an account for this',
  'my first message: LETS GO {SHORT}', 'hello everyone, new here HeyGuys', 'first time watching live, this is amazing', 'my friend got me into this, it’s fun',
];
export const WELCOME: string[] = ['@{user} welcome!', '@{user} welcome to the madness', '@{user} hi HeyGuys', '@{user} welcome, enjoy the game', '@{user} you picked a good game to start', '@{user} welcome! we’re normal i promise Clueless'];

/** Reactions to a copypasta. */
export const PASTA_REACT: string[] = [
  'not this again KEKW', 'copypasta wars', 'I’ve read this 400 times', 'mods?', 'this pasta is undercooked', 'saving this', 'every game KEKW', '5/7 pasta',
  'who writes these', 'al dente', 'pasta la vista', 'chat i’m crying', 'the classics', 'ok this one is new KEKW', 'ratio the pasta',
];

/** Pre-game / in-game predictions that chat remembers and checks later. */
export const PREDICT: { text: string; kind: 'fb' | 'long' | 'short' | 'penta' | 'rivalWin'; role?: string; side?: 'us' | 'them' }[] = [
  { text: 'first blood top lane, calling it', kind: 'fb', role: 'top' }, { text: 'first blood bot, trust', kind: 'fb', role: 'adc' },
  { text: 'first blood mid before 5 min', kind: 'fb', role: 'mid' }, { text: 'first blood in the jungle, invade incoming', kind: 'fb', role: 'jungle' },
  { text: '{short} gets first blood, i can feel it', kind: 'fb', side: 'us' }, { text: '{oppShort} first blood, sadly', kind: 'fb', side: 'them' },
  { text: 'this goes 35+ minutes, mark my words', kind: 'long' }, { text: 'long game incoming, 40 minutes', kind: 'long' }, { text: 'calling a 38 minute game', kind: 'long' },
  { text: '{short} in under 28 minutes', kind: 'short' }, { text: 'quick game today, {short} in 25', kind: 'short' },
  { text: '{star} penta today', kind: 'penta' }, { text: 'someone gets a penta this game, trust', kind: 'penta' },
  { text: '{oppShort} wins this easy', kind: 'rivalWin' }, { text: '{oppShort} takes this, {short} fans not ready', kind: 'rivalWin' },
];
/** "gg" calls (doomer when behind), "EZ" calls (superfan when ahead), throw calls, steal calls. */
export const GG_CALLS: string[] = ['gg go next', 'it’s over, gg', 'ff15', 'gg, we lost this', 'uninstall, it’s over', 'this is gg chat', 'gg no re', 'it’s actually over'];
export const EZ_CALLS: string[] = ['EZ game', 'gg EZ, {oppShort} is so bad', 'this is too easy', 'EZ Clap free win', 'they can’t win from here', '{oppShort} is done, ez'];
export const THROW_CALLS: string[] = ['{short} throws this, mark my words', 'i give it 5 minutes before we throw', 'the throw is coming, i can feel it', 'watch us throw this lead'];
export const STEAL_CALLS: string[] = ['watch {stealer} steal this', 'STEAL INCOMING', 'they’re gonna get stolen, calling it', '{stealer} smite steal, trust', 'this gets stolen 100%', 'i smell a steal'];
export const BARON_START: string[] = ['they’re on {obj} monkaS', '{OBJ} CALL', '{OBJ}?!', 'they’re starting {obj}', 'smite battle incoming', '{obj} attempt monkaS', 'is the jungler alive for smite?', 'PauseChamp {obj}', 'risky {obj}...', '{taker} on {obj}!', '{taker} going for {obj} monkaS', 'who has smite up??'];
export const NEXUS_LINES = {
  end: ['END END END', 'GO GO GO', 'hit the nexus!', 'END IT', 'nexus is open!', 'PauseChamp end?'],
  defend: ['DEFEND', 'HOLD', 'they’re on our nexus monkaW', 'BACK BACK BACK', 'please clear the wave', 'monkaW the nexus'],
  race: ['BASE RACE', 'base race monkaGIGA', 'who’s faster??', 'this is insane', 'BOTH NEXUS??', 'heart attack game'],
};

/** Callouts of earlier messages (the chat remembers who said what). */
export const CALLOUTS: Record<string, string[]> = {
  gg: [
    '@{user} you said “{quote}” {when} KEKW', '@{user} gg go next you said? KEKW', '@{user} still think it’s over?', '@{user} explain yourself', 'where’s @{user} now KEKW',
    '@{user} ratio + we’re back', '@{user} -1000 aura for that gg call', '@{user} your gg aged like milk', '@{user} delete your gg KEKW', '@{user} the comeback is personal',
    '@{user} “{quote}” LMAO', 'remember when @{user} said “{quote}”? ICANT',
  ],
  ggBack: ['i said what i said', 'reverse psychology, you’re welcome', 'i was jinxing it on purpose 5Head', 'ok i was wrong this time', 'it’s not over yet though Aware', 'you’re welcome for the reverse jinx'],
  ez: [
    '@{user} EZ game you said? KEKW', '@{user} “{quote}” aged well', '@{user} still EZ?', '@{user} you jinxed it', 'this is @{user}’s fault for saying ez',
    '@{user} never say ez again', '@{user} -1000 aura', '@{user} EZ Clap... right?', '@{user} you said “{quote}” {when} ICANT',
  ],
  ezBack: ['ok that one’s on me', 'i take it back i take it back', 'my bad chat', 'it’s still ez (it’s not)', 'Clueless'],
  steal: ['@{user} CALLED IT', '@{user} is a prophet', '@{user} how did you know monkaS', '@{user} what are next week’s lottery numbers', '@{user} said steal and it happened Aware', 'chat listen to @{user} next time', '@{user} +1000 aura for the call', '@{user} oracle'],
  stealMiss: ['@{user} where’s the steal KEKW', '@{user} no steal, unlucky', '@{user} “{quote}” and nothing happened', '@{user} fake prophet'],
  fbRight: ['@{user} called first blood Pog', '@{user} nostradamus', '@{user} how did you know', '@{user} first blood prophet', '@{user} called it at minute 0'],
  fbWrong: ['@{user} “{quote}” KEKW', '@{user} first blood prediction: L', '@{user} so close (not close)', '@{user} wrong lane buddy'],
  long: ['@{user} called the long game Aware', '@{user} said “{quote}” and here we are', '@{user} you cursed us with this', '@{user} prophet of the long game'],
  longMiss: ['@{user} “{quote}” KEKW it’s over already', '@{user} 40 minutes you said?', '@{user} not even close'],
  short: ['@{user} called the quick game Pog', '@{user} “{quote}” exactly'],
  shortMiss: ['@{user} under 28 you said? KEKW', '@{user} it’s minute {mins} buddy', '@{user} “{quote}” Clueless'],
  penta: ['@{user} CALLED THE PENTA', '@{user} PENTA PROPHET', '@{user} you said it at the start!!', '@{user} buy a lottery ticket NOW'],
  washed: ['@{user} washed you said? KEKW', '@{user} “{quote}” and then THAT', '@{user} {player} read your message', '@{user} still washed? KEKW', '@{user} delete it', 'chat, @{user} said {player} is washed ICANT'],
  throwCall: ['@{user} called the throw Aware', '@{user} the prophet of doom was right', '@{user} stop being right, it’s scary', '@{user} you jinxed it', '@{user} said “{quote}” {when}... Aware'],
  rivalWin: ['@{user} where you at now KEKW', '@{user} “{quote}” you said?', '@{user} unlucky buddy', '@{user} ratio', '@{user} see you next game KEKW', '@{user} {oppShort} in 25 right?'],
  rivalQuiet: ['@{user} kinda quiet now', '@{user} say that again', '@{user} {oppShort} diff you said?', '@{user} where’d you go KEKW'],
};

/** Moderation. */
export const BOTS = { nightbot: 'Nightbot', elements: 'StreamElements' };
export const MOD_NAMES: string[] = ['RiftWarden', 'mod_kiri', 'BaronGuard_', 'ward_patrol', 'NexusKeeper', 'calm_chat_carl', 'modsquad_jin', 'shieldbash_mod'];
export const NIGHTBOT_REMINDERS: string[] = [
  'Reminder: be respectful to the players and other viewers. Banter is fine, harassment is not.',
  'No spoilers from other streams please.', 'Use !predict to see the current prediction.', 'Today: {a} vs {b} · {comp}',
  'Backseat gaming is free, but please keep it friendly.', 'Emotes are a universal language. Keep chat in English otherwise.',
  'Highlights are posted after every game. Clip responsibly.', 'Commands: !score !patch !uptime !predict !rules !lurk',
];
export const COMMANDS: Record<string, string[]> = {
  '!score': ['{a} {ka} – {kb} {b} · {mins} min · {leader} +{gold}'],
  '!patch': ['This series is played on patch {patch}.'],
  '!uptime': ['The stream has been live for {uptime}.'],
  '!predict': ['Prediction is {pollstate}: {p1}'],
  '!rules': ['Rules: be nice, no spam, no spoilers, no hate. Banter about the game is welcome.'],
  '!lurk': ['{user} is now lurking. Enjoy the game!'],
  '!bracket': ['{comp} bracket: check the official site. Game {gameno} is live now.'],
  '!game': ['Game {gameno} of a Bo{bo}. Series: {series}.'],
};
export const MOD_LINES: string[] = [
  'keep it civil chat', 'no spoilers please', 'chat, enough copypasta for a minute KEKW', 'let’s keep the region war friendly', 'be nice to the first-time chatters',
  'slow mode is coming if this keeps up', 'mods are watching Stare', 'please don’t spam the same message', 'enjoy the game everyone', 'banter yes, being mean no',
];
/** Mild spam / grumpy lines that get a short timeout (kept harmless on purpose). */
export const TIMEOUT_BAIT: { text: string; reason: string }[] = [
  { text: 'KEKW KEKW KEKW KEKW KEKW KEKW KEKW KEKW KEKW KEKW KEKW KEKW KEKW KEKW KEKW', reason: 'spam' },
  { text: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', reason: 'caps spam' },
  { text: 'ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff', reason: 'spam' },
  { text: 'everyone on this team should uninstall', reason: 'be nice to the players' },
  { text: 'follow my channel for free skins', reason: 'self-promo' },
  { text: 'spoiler: {short} loses this', reason: 'spoilers' },
  { text: '{oppShort} fans are the worst fans in the world', reason: 'keep it friendly' },
  { text: 'type 1 if you think {short} is trash', reason: 'keep it friendly' },
  { text: 'this team is a joke, retire all of them', reason: 'be nice to the players' },
  { text: 'Pog Pog Pog Pog Pog Pog Pog Pog Pog Pog Pog Pog Pog Pog Pog Pog Pog', reason: 'spam' },
  { text: 'the other stream is 30 seconds ahead, {oppShort} takes baron', reason: 'spoilers' },
];
export const AFTER_TIMEOUT: string[] = ['o7 {user}', 'KEKW he got timed out', 'MODS', 'unlucky', 'press F for {user}', 'he’ll be back in 10 seconds KEKW', 'the mods are fast today', 'rip', 'deserved KEKW', 'F'];
export const BACK_FROM_TIMEOUT: string[] = ['i’m back', 'that was unfair Sadge', 'ok ok i’ll behave', 'what did i miss', 'worth it', 'i have learned nothing', 'free again catJAM'];

/** Twitch-style notices. */
export const RAIDERS: string[] = [
  'BaronBoyTV', 'SoloQSamurai', 'RiftWalkerLive', 'GoldGraphGuru', 'ChallengerChloe', 'MacroMango', 'PentaPanda', 'ScuttleStreams', 'TiltProofTom', 'WardWizard',
  'NexusNinja', 'DrakeDaddyTV', 'CannonMinionTV', 'LaneKingdomLive', 'PogLeagueDaily', 'BushCampBen', 'SoulPointSara', 'MidOrFeedMax', 'InhibInspector', 'ElderEnjoyerTV',
];
export const RAID_CHAT: string[] = [
  '{RAIDER} RAID', 'hello from {raider} chat HeyGuys', 'what game is this?', 'who are we cheering for?', '{raider} sent us', 'peepoArrive', 'which team is good?',
  '{raider} chat in the house', 'raid squad reporting', 'is this the final?',
];
export const RAID_WELCOME: string[] = ['welcome raiders! HeyGuys', 'welcome {raider} chat!', 'thanks for the raid {raider}!', 'raiders, we’re {short} fans here (mostly)'];
export const SUB_MSGS: string[] = [
  'LETS GO {SHORT}', '{months} months of pain and glory', 'here for every {short} game', 'still here, still believing', 'Prayge this game', '{star} carry pls',
  'happy to support', 'best chat on twitch', 'catJAM', 'my {months} month sub and still no title', 'resubbing because {star}', 'W stream W team',
];
export const BITS_MSGS: string[] = ['{SHORT} WIN THIS', 'for the {short} jungler’s Flash', 'Pog', 'buy {star} a coffee', 'hype!', 'GG', 'please ward', 'LET’S GOOO', 'for good luck'];
export const GIFT_THANKS: string[] = ['thanks for the subs @{user}!', '@{user} W gifter', '@{user} thank you!', 'thanks for the gift @{user} peepoClap', '@{user} legend', 'gifted Pog'];

/** The prediction poll. */
export const POLL = {
  bet: [
    'all in on {team} Prayge', '{pts} points on {team}', 'betting against my own team as a hedge Clueless', 'free points, {team} easy', 'I bet everything on {team} again',
    'points are temporary, {team} is forever', 'my last {pts} points on {team}', '{pts} on {team}, don’t let me down', 'bet {pts} on {team}, no regrets', '{team} for the points EZ',
  ],
  locked: ['prediction locked monkaS', 'too late to change my bet monkaS', 'i bet wrong already Aware', 'locked in, no going back', 'my points are in danger'],
  won: ['+{pts} points EZ', 'points diff', 'paid off Pog', 'I’m rich', 'gambling W', 'knew it, +{pts}', 'channel points mansion incoming', 'free points as promised'],
  lost: ['lost {pts} points Sadge', 'bankrupt again', 'gambling is a skill issue', 'there go my points', 'I’m never betting again (I’m betting next game)', '-{pts} PepeHands', 'my points... Deadge'],
};

/** Replies when the user (the manager) types in chat. */
export const GM_REPLIES = {
  any: [
    'GM IN CHAT Pog', '@{me} hi GM HeyGuys', '@{me} fix the draft pls', '@{me} we trust you', '@{me} raise for {star} when?', '@{me} the manager is watching Stare',
    '@{me} W manager', 'the GM reads chat?? Pog', '@{me} can I get a tryout', '@{me} big fan', '@{me} make them ward the pit', '@{me} sign a backup jungler KEKW',
    '@{me} what’s the game plan?', 'manager typing in chat during a game ICANT', '@{me} chat runs this team now', '@{me} hi from {city}!',
  ],
  ff: ['@{me} NO FF', '@{me} the GM said ff?? KEKW', '@{me} never surrender', '@{me} FF?? fire the GM KEKW'],
  gg: ['@{me} gg wp', '@{me} ggs', 'gg GM'],
  team: ['{SHORT} {SHORT} {SHORT}', '@{me} LETS GO {SHORT}', 'the GM believes Pog'],
  question: ['@{me} good question honestly', '@{me} ask the coach', '@{me} you tell us, you’re the manager KEKW', '@{me} 5Head question'],
  hi: ['@{me} hi! HeyGuys', '@{me} hello GM', 'GM said hi to me (he didn’t) Pog'],
};

/** After the game. */
export const POSTGAME: string[] = [
  'what a game', 'next game when?', 'who’s MVP?', '{mvp} MVP for sure', 'gg everyone', 'see you next game chat', 'peepoLeave', 'that was cinema',
  '{mins} minutes, what a ride', 'stretch break', 'casters cooking post game', 'replay that last fight pls', 'draft for the next one?', 'chat stays here between games right?',
  'that game had everything', 'my voice is gone', 'ok bathroom break', 'clip of the game?', 'i need to lie down after that', 'peepoClap both teams',
];

/** Replies to region-war lines (playful). */
export const REGION_REPLIES: string[] = [
  '@{user} {region} fans in shambles if they lose this', '@{user} {region2} diff tbh', '@{user} ok but who won the last international', '@{user} all regions are mid compared to my Silver lobby',
  '@{user} region war at minute {mins} KEKW', '@{user} {region2} enjoyer spotted', '@{user} every region has its moments', '@{user} see you at Worlds', '@{user} bold claim, let’s check the bracket',
  '@{user} {region} gap is real though', '@{user} not the region war again Okayge', '@{user} my region could never (it really couldn’t)',
];

/** Backseat drafting in the first minutes (and the replies it gets). */
export const DRAFT_TAKES: string[] = [
  'who drafted this monkaS', '{rchamp} into this comp? bold', 'should’ve banned {oppstarchamp}', 'first-pick {starchamp} is a statement', 'draft diff already',
  'no frontline in that draft? monkaHmm', 'that comp wants to fight at 20 min, not before', '{oppShort} drafted for late game, {short} has to end early', 'love the {starchamp} pick for {star}',
  'blind-picking {rchamp} in a pro game is wild', 'both drafts are fine, it’s about execution', 'they gave {star} the {starchamp}?? free', 'the {oppstarchamp} pick scares me ngl',
  'scaling vs early game, classic', 'coach cooked with that draft', 'that draft is a 25-minute timer', 'I’d have banned {rchamp} honestly', 'pocket pick alert: {rchamp}',
];
