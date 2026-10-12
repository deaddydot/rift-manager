// Live chat, part 4: chat reads the draft. Lines about the picks of the game (see broadcast/picks.ts for how a pick
// gets flagged): troll & cheese picks, off-role and off-meta champions, signature / legacy / one-trick picks, low
// comfort and first-time picks, counters and risky blinds, patch buffs & nerfs, the champion that lost last time,
// Fearless pools running dry; then mid-game ("the Teemo pick is working??", "who let him play Draven") and post-game.
//
// Placeholders: {player} {champ} {role} {team} (the pick's team) {oteam} {opp} {oppchamp} (lane opponent & champion)
// {comfort} (0-200) {tier} {presence} {prate} {mainrole} {sgames} {share} {rec} {lastkda} {lastvs} {by} {bychamp}
// {edge} {patch} {locked} {gameno} {short} {oppShort} (the channel's team / the opponent) {user} (replies).
// A line whose placeholder has no value is skipped. PG-13: banter about the play only.

export const PICK_CHAT: Record<string, string[]> = {
  // ---------------------------------------------------------------- start of game
  pick_troll: [
    '{champ} {role}?? in a PRO game?? KEKW', 'WAIT {player} is on {champ}?', 'is this ranked or the {comp}? {champ} {role} LMAO',
    '{champ} {role} OMEGALUL', 'someone check if {player} is trolling', '{player} locked {champ} and the analyst desk is crying KEKW',
    'chat {player} really picked {champ}', '{champ} pick incoming disaster or genius, no in between', 'THE {CHAMP} PICK IS REAL',
    '{player} {champ} {role}, this is peak cinema', 'who approved {champ} in this draft', 'the coach let {player} play {champ}?? ICANT',
    '{champ} {role} in {patch}, bold', 'not the {champ} pick KEKW', '{player} saw the meta and said no', 'scrims must have gone crazy for them to lock {champ}',
    'this {champ} pick is either 200 IQ or 2 IQ', 'NOTED {champ} {role} is pro meta now', 'my bronze teammates have been right all along: {champ} {role}',
    '{champ}?? i thought i misread the draft', 'bro picked {champ} in a game with stakes', 'they hid {champ} in scrims for this KEKW',
    'inting or cooking? {player} {champ}', '{champ} {role} gotta be a dare', 'Pog {champ} pick', 'I LOVE THIS GAME {champ} {ROLE}',
    'if the {champ} wins i am buying a jersey', 'clip the draft, {champ} {role} in pro', 'analysts searching "{champ} pro winrate" right now KEKW',
    '{player} on {champ} is the content we came for',
  ],
  pick_troll_us: [
    'our coach drafted {champ} {role}... trust the process Clueless', '{short} really locked {champ}. ok. Copium', 'manager what is this {champ} pick @{me}',
    'my team is running {champ} {role}, i need a minute', '{short} cooking something with {champ} monkaS', '{champ} {role} for {short}?? i believe Prayge',
    'if this {champ} loses us the game i am writing a letter', 'our {champ} pick is either the play of the year or the throw of the year',
    'ok {short} fans, defend the {champ} pick', 'GM @{me} you approved {champ}?? KEKW',
  ],
  pick_troll_them: [
    '{oteam} drafting against us with {champ} KEKW free', '{team} picked {champ}, they gave up already', '{team} {champ} {role}, disrespect',
    'they’re trolling us with {champ}?? WeirdChamp', 'lose to {champ} {role} and i uninstall', '{team} think {champ} beats us? EZ',
    'imagine losing to {player} on {champ}', '{team} brought {champ}, gotta respect the confidence', '{champ} into us? ok we’re winning this',
    'never underestimate a {champ} player monkaS',
  ],
  pick_offrole: [
    '{champ} {role}?? it’s a {mainrole} champ', '{player} taking {champ} into the {role} lane, interesting', 'flex pick {champ} going {role} NOTED',
    '{champ} in the {role} role, what is this draft', 'chat is {champ} {role} even legal', 'off-role {champ}, {player} has been practising?',
    '{champ} {role} is a soloQ pick, not a stage pick', 'I’ve seen {champ} {role} exactly once and it lost', '{champ} flexed to {role} 5Head',
    'they swapped {champ} to {role}, mind games', 'that {champ} is going {role}?? the lanes are confused', '{champ} {role} monkaHmm',
    'draft diff or draft troll? {champ} {role}', 'this {champ} {role} pick is either a lane swap or a crime', '{player} on an off-role {champ}, comfort {comfort}/200 btw',
    'the analysts will need a new spreadsheet for {champ} {role}', '{champ} going {role} is a Korean soloQ special', 'role swap?? {champ} {role} PauseChamp',
    'I respect the creativity, {champ} {role}', 'is {champ} {role} the new tech? NOTED',
  ],
  pick_offmeta: [
    '{champ}? haven’t seen that in pro all year', '{champ} {role} played in {prate} of pro games this year KEKW', 'off-meta {champ}, {player} has a pocket pick',
    'who even plays {champ} anymore', '{player} digging {champ} out of the archives', '{champ} pick, someone dust it off', 'pocket {champ} from {player} Pog',
    '{champ}?? patch notes didn’t say anything about this', '{champ} pro presence is {presence}, wild pick', 'off-meta enjoyer {player}',
    '{champ} is so off-meta it’s meta', 'the {champ} pick is a statement', 'I didn’t know {champ} was allowed on stage', 'surprise pick {champ}, prep or panic?',
    'chat {champ} is a real champion i promise', '{player} said meta is for sheep, {champ} locked', 'pocket picks win playoffs, {champ} let’s see',
    '{champ} last seen in a pro game during the Stone Age', 'hipster draft: {champ}', '{champ} pick goes hard actually', '{champ} pick, the analysts are scrambling NOTED',
    'the {champ} came out of nowhere',
  ],
  pick_signature: [
    '{player} on {champ}, that’s his signature', 'uh oh {player} got {champ}, ban it next time', 'they left {champ} open for {player}?? misplay',
    'signature {champ} from {player} Pog', '{player} {champ} is a cheat code', 'never leave {player} the {champ}', '{champ} in {player}’s hands is scary monkaS',
    'comfort pick unlocked: {player} {champ}', '{player} has played {champ} a million times, this is home', '{player} {champ} GIGACHAD',
    'the {champ} is {player}’s baby', '{player} on {champ}, that’s {comfort}/200 comfort, absurd', 'mastery level: insane. {player} {champ}',
    'they let {player} have {champ}, draft gap', 'we’re about to see the {player} {champ} show', 'banning {champ} vs {player} should be mandatory',
    'HYPERS {player} {champ}', '{player} {champ} is my favourite thing in esports', 'it’s {champ} time with {player} catJAM', '{player} {champ} never misses',
  ],
  pick_legacy: [
    '{player} on {champ}. history. Kreygasm', 'THE {CHAMP}. {PLAYER}. we are so back', '{player} {champ} is a piece of League history', 'the {champ} is out for {player}, the legend continues',
    'old school {player} {champ} FeelsStrongMan', 'chat we are witnessing {player} on {champ} again', '{player} {champ}, my childhood', 'goosebumps, {player} locked {champ}',
    'the {champ} that built a legend', 'every {player} {champ} game is a museum visit', '{player} {champ}. say less.', 'I’ve been waiting all year for {player} {champ}',
    '{player} on {champ} is like hearing your favourite song', 'legacy pick {champ} for {player}', 'ok now i’m locked in, {player} {champ}',
    '{player} {champ} BibleThump the memories', 'they gave {player} the {champ}. respect.', '{player} {champ} highlight reel loading',
  ],
  pick_onetrick: [
    '{player} on {champ}, the one-trick lives', 'of course {player} is on {champ}, he only plays {champ} KEKW', '{player} {champ} again, {share} of his games this year',
    'one-trick {player} got his champ, gg', 'they didn’t ban the {champ} vs {player}?? that’s his only champ', '{player} is a {champ} player who sometimes plays other champs',
    'I’d ban {champ} every game vs {player}', '{player} {champ}, {sgames} games this season on it', 'the {champ} one-trick is in his element',
    '{champ} for {player}, water is wet', '{player} gets {champ} and the other team gets a headache', 'champion pool: {champ}. strategy: {champ}.',
    'the {champ} specialist', 'one-trick pony {player} on the only horse he rides', 'never leave {champ} open for {player}, rule number one', '{player} without {champ} is a mortal, with it a god',
  ],
  pick_first: [
    'first {champ} game of the season for {player}', '{player} hasn’t played {champ} on stage this year monkaS', '{player} on {champ} for the first time this season, scary',
    'new pick for {player}: {champ}, after {sgames} games this year', 'season debut of {player}’s {champ}', '{player} {champ} first time on stage? PauseChamp',
    '{champ} for {player}, first time this year, let’s see if he’s been practising', 'a new {champ} from {player}, NOTED', '{player} expanding the pool with {champ}',
    'brand new {champ} from {player} in a real match KEKW', '{champ} is new for {player} this year, risky', 'scrim pick? {player} {champ} first time',
    'first {champ} of the year, {player} stays unpredictable', 'didn’t know {player} played {champ}', '{player} {champ}?? when did he learn that', 'new champ, who dis: {player} {champ}',
  ],
  pick_lowcomfort: [
    '{player} on {champ}? he’s {tier} monkaS', '{player} {champ} comfort {comfort}/200 btw', 'forced into {champ}, {player} doesn’t look comfortable',
    'they took {player} out of his pool, {champ} it is', '{player} has like 3 games on {champ}', '{champ} for {player} is a stretch',
    '{player} playing {champ} like it’s his first day Aware', 'did {player} get counter-drafted out of his champs?', 'draft forced {player} onto {champ}, rough',
    '{player} on {champ} is like me on the piano', '{champ} is not a {player} champ chat', 'the {champ} might be a learning experience',
    '{player} is {tier} on {champ}, just survive lane pls', 'cooked in draft: {player} {champ}', 'low comfort {champ} for {player}, that’s a target for the jungler',
    '{player} with a champ he barely knows, Prayge', '{champ} {player}? i hope he watched a guide', 'comfort {comfort}/200, ok we’re in trouble KEKW',
  ],
  pick_counter: [
    '{player} counter-picked {opp} with {champ}, lane is cooked', '{champ} into {oppchamp} is a nightmare for {opp}', 'counter pick secured: {champ} vs {oppchamp}',
    '{champ} last pick into {oppchamp}, 5Head draft', 'that {champ} is a direct answer to the {oppchamp}', '{opp} is about to have a long lane vs {champ}',
    '{champ} beats {oppchamp} like {edge} of the time, nice draft', 'draft diff, {champ} counters {oppchamp}', '{oppchamp} first pick got punished',
    'never blind {oppchamp} into {player}', '{champ} into {oppchamp}, lane kingdom for {player}', 'counter-draft by {team}, that’s prep',
    'the analysts saw the {oppchamp} and said {champ}', '{opp} on {oppchamp} vs {champ}, Sadge for him', 'that’s a counter pick and a half',
    '{player} gets the matchup he wanted', '{champ} vs {oppchamp}: winning lane on paper', 'free lane for {player} on paper, let’s see on the Rift',
  ],
  pick_countered: [
    '{player} on {champ} got counter-picked by {bychamp}', '{champ} into {bychamp}, unlucky lane for {player}', '{player} will have to play from behind vs {bychamp}',
    'that {champ} got answered by {bychamp}, rough', 'counter-picked lane for {player}, just survive', '{champ} blind got punished with {bychamp}',
    '{player} gotta go even vs {bychamp} and he wins this', 'lane is a losing matchup for {player}, jungler camp top pls', 'they blinded {champ} and ate the counter',
    'rip {player}’s lane, {bychamp} counters {champ}', '{player} is good enough to play through a counter, trust', 'counter pick diff incoming Aware',
  ],
  pick_blindmeta: [
    'blind {champ} because it’s just broken', 'first-pick {champ}, the meta monster', '{champ} blind pick, it goes with everything', 'they blinded {champ}, no fear',
    '{champ} is the safest blind in the game rn', '{champ} picked first, priority pick', 'locked {champ} early, they know what’s strong', 'when in doubt: {champ}',
    '{champ} first pick every patch, nothing changes', 'blind {champ}, respect the meta', '{champ} pick-ban presence is {presence}, of course they took it', 'meta monster {champ} out first',
    'flex pick {champ} early, smart', 'they didn’t want to see {champ} on the other side',
  ],
  pick_riskyblind: [
    '{champ} blind pick?? that’s risky', 'blind {champ}, they’re asking to get countered', 'who blinds {champ} in pro monkaS', '{champ} picked before the matchup was known, bold',
    'blinding {champ} is a choice', 'that {champ} could get countered so hard', 'early {champ} pick, are they hiding a counter-counter?', '{champ} blind? i hope {player} has a plan',
    'risky blind {champ}, but {player} likes it', 'they showed the {champ} too early KEKW', '{champ} blind pick means they REALLY want it', 'blind {champ} is spicy',
  ],
  pick_lostlast: [
    '{player} lost on {champ} last time ({lastkda})', 'the {champ} again? it lost last time vs {lastvs}', '{player} back on the {champ} that lost, redemption arc?',
    'last {champ} game for {player}: {lastkda}, hmm', '{champ} for {player} after that last game? brave', 'redemption on {champ} for {player}?',
    'they really want that {champ} to work, lost last time', 'run it back on {champ}, {player} said', '{player} doesn’t care about the last {champ} game, respect',
    '{champ} {player}, the comeback story starts now', 'last {champ}: {lastkda}. this {champ}: Prayge', 'insanity is picking {champ} again and expecting a different result KEKW',
  ],
  pick_revenge: [
    '{player} back on {champ} vs {oteam}, he lost on it to them last time', 'REVENGE ARC: {player} {champ} vs {oteam}', 'last time {player} played {champ} vs {oteam} it was {lastkda}',
    '{player} wants revenge on {champ}', 'same champ, same opponent, different result? {player} {champ}', 'the {champ} rematch vs {oteam} FeelsStrongMan',
    'run it back {player}, {champ} vs {oteam} again', '{player} remembers that {champ} game vs {oteam}, he wants this', 'revenge pick locked: {champ}', '{oteam} beat his {champ} last time, not today',
    '{player} {champ} vs {oteam} part 2 PauseChamp', 'chat remembers that {champ} game vs {oteam} Aware',
  ],
  pick_buffed: [
    '{champ} got buffed in {patch}, of course they picked it', 'buffed {champ} pick, abuse the patch NOTED', 'patch notes merchant: {champ} locked',
    'freshly buffed {champ}, smart draft', '{champ} buffs are kinda nuts this patch', 'they read the patch notes: {champ}', '{champ} is busted after the buff',
    'riot buffed {champ} and pros noticed', 'patch {patch} {champ} goes crazy', 'buffed and picked, {champ}',
  ],
  pick_nerfed: [
    '{champ} after the nerfs? brave', '{champ} got gutted this patch and they still picked it', 'did they not read the patch notes? {champ}',
    '{player} doesn’t care about nerfs, {champ} locked', 'nerfed {champ} is still {champ} i guess', '{champ} is weaker this patch, risky',
    'comfort > patch, {player} on {champ}', '{champ} got nerfed and {player} said so what', 'the {champ} nerfs were real, let’s see', 'nerfed {champ} pick, copium or tech?',
    'old meta enjoyer: {champ} after nerfs', '{champ} nerf? never heard of it - {player}',
  ],
  pick_flashy: [
    '{player} on {champ}, highlight or feed, no in between', '{champ} in pro, buckle up', 'the {champ} pick, here come the outplays (or the deaths)',
    '{champ} {player}, clip it already', 'oh it’s a {champ} game, popcorn time', '{champ} pick, someone’s getting outplayed today', '{player} {champ}, montage incoming',
    'mechanics check: {player} on {champ}', '{champ} = either 10/0 or 0/10, i love it', '{champ} is out, keep your eyes on {player}', 'the {champ} enjoyer has arrived', 'chat {player} {champ} is about to be either hero or villain',
  ],
  pick_hotrecord: [
    '{player} is {rec} on {champ} this season Pog', '{champ} for {player}: {rec} this year, that’s a win button', '{player} {champ} record {rec}, they should ban it',
    '{rec} on {champ}, {player} knows what he’s doing', 'the {champ} has been printing wins for {player} ({rec})', '{player} {champ} {rec} this year, chat calm down',
    'undefeated-ish on {champ}: {player} {rec}', '{champ} is {player}’s money pick, {rec}', '{player} on {champ} wins, it’s that simple ({rec})', 'statistically {player} {champ} is a W ({rec})',
  ],
  pick_coldrecord: [
    '{player} is {rec} on {champ} this year... monkaS', '{champ} for {player}: {rec} this season, why', '{player} {champ} record {rec}, the stats are scary',
    'the {champ} has not been kind to {player} ({rec})', '{rec} on {champ} and they still pick it, faith', '{player} {champ}, {rec}, hope this is the turnaround',
    'cursed pick: {player} {champ} {rec}', 'someone show {player} his {champ} record ({rec}) KEKW', '{champ} {rec}, i’d have picked anything else', 'trust the {rec} {champ}? Copium',
  ],
  pick_fearless: [
    'fearless game {gameno}: {locked} champions gone, the pools are drying up', 'we’re so deep into fearless the drafts are getting weird', 'game {gameno} fearless, {locked} champs locked out monkaS',
    'fearless means everyone plays their 7th best champ now KEKW', 'by game {gameno} of fearless it’s who has the deepest pool', '{locked} champs burned, the pocket picks are coming',
    'fearless draft is the best thing riot ever did', 'this is where fearless gets fun', 'champion ocean check: fearless game {gameno}', 'running out of champs, {team} digging deep',
    'fearless game {gameno}, every pick is a story', 'all the meta champs are gone, this is the real test', 'pool depth diff in fearless decides this', 'fearless draft at game {gameno} is chaos and i love it',
  ],
  pick_reply: [
    '@{user} trust the process', '@{user} it’s a pocket pick, he’s been spamming it', '@{user} scrims don’t lie Clueless', '@{user} copium or tech, we’ll see',
    '@{user} pros know more than us KEKW', '@{user} he played it in soloQ all week', '@{user} it’s a counter pick, look at the matchup', '@{user} that’s why you’re not a coach KEKW',
    '@{user} calm down it’s draft', '@{user} genius or troll, place your bets', '@{user} this is how metas start NOTED', '@{user} it’s fine, it’s fine, it’s fine Aware',
    '@{user} you said the same about the last one', '@{user} if it works it’s genius',
  ],

  // ---------------------------------------------------------------- mid-game
  pickmid_weird_good: [
    'the {champ} pick is working??', '{champ} {role} diff??', 'chat, {player} on {champ} is actually doing it', 'OK THE {CHAMP} PICK MAKES SENSE NOW', 'I take it back, {champ} is a good pick',
    '{champ} {role} is meta now NOTED', 'what is happening, {champ} is winning', '{player} {champ} 5Head', 'the analysts were wrong about {champ} KEKW', 'who doubted the {champ}',
    '{player} cooked with {champ} and it’s tasty', '{champ} tech confirmed', 'everyone laughing at the {champ} pick is quiet now', '{player} on {champ}: {k}/{d}/{a} LMAO',
    '{champ} pick looking like genius', 'the {champ} experiment is a success', 'add {champ} to the pool permanently', 'how is {champ} doing this', 'not the {champ} carry KEKW',
    'GIGACHAD {player} {champ}', '{champ} is the MVP pick of this draft', 'imagine the guy who said {champ} was trolling', '{player} {champ} is HIM', '{champ} {role} enjoyers we eating',
  ],
  pickmid_troll_good: [
    '{CHAMP} {ROLE} IN PRO AND IT’S WORKING', 'THE {CHAMP} PICK IS WORKING??', '{champ} {role} winning a pro game, i need to lie down', '{player} on {champ}, {k}/{d}/{a}, i’m speechless',
    'my soloQ {champ} {role} spam is validated', 'analysts are rewriting the meta: {champ} {role}', '{champ} OMEGALUL IT WORKS', 'no way the {champ} is carrying',
    '{champ} {role} diff, write it down', 'every scout in the world just took notes on {champ} NOTED', 'troll pick? more like TROPHY pick KEKW', '{player} {champ} is the greatest thing i’ve ever seen',
    'the {champ} disrespect is DEVASTATING', 'are we witnessing the {champ} meta being born', '{champ} pick working = chat in shambles', 'HOW IS {CHAMP} WINNING',
    'pro play: everyone on meta picks. {player}: {champ}. {player}: winning.', '{champ} is legal now, riot please don’t nerf',
  ],
  pickmid_weird_bad: [
    'who let him play {champ}', 'the {champ} experiment failed', '{champ} pick looking like a troll now', '{player} on {champ}: {k}/{d}/{a} Aware', 'this is why we don’t pick {champ}',
    'draft lost this game, {champ} {role}', 'someone tell {player} it’s not soloQ', 'never pick {champ} again pls', '{champ} {role} is a bit Sadge', 'refund the {champ} pick',
    'the {champ} is a free kill KEKW', 'i knew {champ} was a mistake', 'the coach who approved {champ} is sweating', '{player} needs his real champs back', '{champ} pick aging like milk',
    '{champ} {role}... yeah', 'we tried {champ}, it’s ok, we move on', '{champ} giving free gold', 'whoever drafted {champ} owes us an explanation', '{champ} {role} is not it chat',
  ],
  pickmid_flashy_bad: [
    'who let him play {champ}', '{player} on {champ}: {k}/{d}/{a} KEKW', 'no more {champ} for {player}', '{champ} montage turned into a blooper reel', 'the {champ} is feeding, someone take the keyboard',
    'flashy pick, flashy deaths', '{player} {champ} highlight reel: deaths only', '{champ} players are all the same KEKW', 'too much {champ} confidence', 'the {champ} dream is dead Deadge',
    'bro thought he was the {champ} god', '{champ} in pro was a mistake', '{player} please play something boring', '{player} keeps diving on {champ}, it keeps not working',
  ],
  pickmid_flashy_good: [
    '{player} {champ} is a different animal', 'THIS is why you pick {champ}', '{player} on {champ}: {k}/{d}/{a} Pog', '{champ} OUTPLAY MACHINE', 'the {champ} montage is writing itself',
    '{player} {champ} is unstoppable', 'mechanics diff, {player} {champ}', 'clip every {champ} play', '{player} on {champ} is too clean', '{champ} {player} going off GIGACHAD',
    'you don’t pick {champ} unless you’re HIM', '{champ} carrying like it’s 2016', 'this {champ} is cracked', '{player} built different on {champ}',
  ],
  pickmid_signature_good: [
    'that’s why you ban {champ} vs {player}', '{player} {champ} doing {player} {champ} things', 'signature {champ} delivering', 'told you, never leave {player} the {champ}',
    '{player} on {champ} is a cheat code {k}/{d}/{a}', 'comfort pick = comfort win', '{player} {champ} again showing why', 'the {champ} mastery is showing', '{champ} in {player}’s hands is unfair',
    'draft gap: they left {champ} open', 'that’s {player}’s champ, he’s home', 'ban {champ} next game or lose', '{player} could play {champ} with his eyes closed', 'signature pick, signature performance',
  ],
  pickmid_counter_good: [
    'counter pick doing its job, {player} on {champ}', '{champ} into {oppchamp} as expected', 'the counter-draft is paying off', '{opp} getting punished by the {champ} counter',
    'draft won this lane', '{champ} vs {oppchamp} is exactly what the stats said', 'counter pick tax paid by {opp}', 'that matchup was a gift for {player}', '{player} cashing in the counter pick',
    'the coach who drafted {champ} into {oppchamp} gets a raise',
  ],
  pickmid_lowcomfort_bad: [
    '{player} looks lost on {champ}', 'you can tell {player} doesn’t play {champ} much', 'low comfort {champ} showing', 'give {player} his champs back', '{player} on {champ}: {k}/{d}/{a}, rough',
    'this is what happens when you draft {player} out of his pool', '{champ} is clearly not his champ', '{player} {champ} is a learning experience Sadge', 'comfort matters, see {player} {champ}',
    'unfamiliar {champ} = free kills',
  ],

  // ---------------------------------------------------------------- after the game
  pickend_weird_win: [
    '{champ} {role} won a pro game. i’ve seen everything', 'the {champ} pick WON KEKW', 'remember when we laughed at the {champ}?', '{player} on {champ}, never doubt again',
    '{champ} pick 1 - chat 0', 'add {champ} to the meta, it’s official', '{champ} {role} enjoyers, we eat tonight', 'the {champ} pick will be studied', 'i’m picking {champ} in ranked tonight',
    'genius draft. {champ}. won.', '{champ} pick haters in shambles', 'from troll pick to winning pick, {champ}',
  ],
  pickend_weird_loss: [
    'never draft {champ} again', 'the {champ} pick lost this', 'well the {champ} didn’t work', 'post-game: {champ} was a mistake', '{champ} {role} back to soloQ where it belongs',
    'we learned something today: no {champ}', 'the {champ} experiment is over o7', 'draft lost, {champ} pick', 'ok {champ} was a troll after all', '{champ} pick in the hall of shame',
  ],
};
