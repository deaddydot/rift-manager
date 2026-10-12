// Live chat content, part 2: personas (recurring chatters with a stable voice), memes, copypastas, diff calls,
// keyboard smashes and emote waves. Used by chatBrain.ts. Placeholders in {braces} are filled by fans.fill()
// (an UPPERCASE placeholder gives the value in caps); a line whose placeholder has no value is skipped.
//
// Common placeholders: {short} {oppShort} (our / their team), {star} {oppstar} (each side's best player),
// {starchamp}, {ourjg} {oppjg} {ourmid} {oppmid} {ourtop} {opptop} {ouradc} {oppadc} {oursup} {oppsup},
// {mins}, {score} (our kills-their kills), {gold} (lead size, e.g. 2.4k), {leader} {trailer} (team shorts),
// {region} {oppregion} {region2} (league names), {city} {city2} {hour}, {item}, {role}, {rchamp}, {rnd}.
// PG-13: banter about the play only.

export type Persona =
  | 'superfan' | 'rival' | 'analyst' | 'doomer' | 'memer' | 'copypasta' | 'casual' | 'backseat'
  | 'spammer' | 'wholesome' | 'timezone' | 'regionwar' | 'lurker';
export const PERSONAS: Persona[] = ['superfan', 'rival', 'analyst', 'doomer', 'memer', 'copypasta', 'casual', 'backseat', 'spammer', 'wholesome', 'timezone', 'regionwar', 'lurker'];
export type Moment = 'good' | 'bad' | 'bigGood' | 'bigBad' | 'ahead' | 'behind' | 'win' | 'loss';

/** How many regulars of each persona a channel has (the same people show up every game of a save). */
export const PERSONA_COUNT: Record<Persona, number> = { superfan: 6, rival: 4, analyst: 3, doomer: 3, memer: 6, copypasta: 2, casual: 5, backseat: 3, spammer: 4, wholesome: 3, timezone: 2, regionwar: 3, lurker: 4 };

/** Username patterns per persona ({short} our team, {opp} theirs, {n} a number). */
export const PERSONA_NAMES: Record<Persona, string[]> = {
  superfan: ['{short}_til_i_die', '{short}army_{n}', 'ride_or_die_{short}', '{short}_believer', 'proud{short}fan', 'xX{short}Xx', '{short}supremacy', 'only{short}', '{short}_hype_man', 'jersey_on_{short}', '{short}4life', 'lucky_socks_{short}', 'day1_{short}_fan', '{short}nation{n}', 'screams_for_{short}'],
  rival: ['{opp}_enjoyer', '{opp}_army', 'true{opp}fan', '{opp}diff_{n}', '{opp}_or_nothing', 'go{opp}go', '{opp}_til_i_die', 'not_a_{short}_fan', '{opp}supremacy', '{opp}_hopium', 'certified{opp}fan', '{opp}nation{n}'],
  analyst: ['statsheet_steve', 'goldgraph_gary', 'cspm_enjoyer', 'vision_score_vic', 'macro_brain_{n}', 'xpm_andy', 'cooldown_carla', 'win_prob_wendy', 'spreadsheet_sam', 'objective_timer', 'wave_state_walt', 'the_numbers_guy', 'kda_kevin', 'drafting_dana', 'patchnote_pete'],
  doomer: ['itsover_ivan', 'gg_go_next_{n}', 'ff15_voter', 'seen_this_before', 'pessimist_pat', 'doom_scroller{n}', 'we_always_throw', 'not_again_{n}', 'expect_the_worst', 'cursed_fan_{n}', 'told_u_so_tom', 'heart_cant_take_it'],
  memer: ['aura_farmer_{n}', 'chat_is_this_real', 'ratio_king{n}', 'skill_issue_{n}', 'kekw_connoisseur', 'certified_yapper', 'npc_{n}', 'lock_in_larry', 'cooked_or_cooking', 'w_or_l_{n}', 'brainrot_{n}', 'peak_cinema', 'him_believer', 'so_back_so_over', 'minus1000aura', 'clip_farmer_{n}'],
  copypasta: ['pasta_chef', 'copypasta_carl', 'ctrl_v_victor', 'the_pasta_man', 'paste_master_{n}', 'al_dente_andy', 'spaghetti_coder', 'clipboard_kid'],
  casual: ['first_time_league', 'just_vibing_{n}', 'whats_a_baron', 'my_bf_plays_this', 'curious_casual{n}', 'here_for_vibes', 'tourist_{n}', 'new_to_esports', 'random_viewer_{n}', 'channel_surfer', 'wandered_in', 'lol_is_hard'],
  backseat: ['armchair_jungler', 'couch_coach_{n}', 'should_have_warded', 'backseat_support', 'iron4_analyst', 'hardstuck_coach', 'i_wouldve_flashed', 'ward_the_pixel_bush', 'buy_qss_pls', 'track_the_jungler', 'freeze_bro_{n}'],
  spammer: ['emote_only_{n}', 'kekw_spammer', 'pog_machine', 'sadge_hours', 'catjam_enjoyer', 'clap_clap_{n}', 'copium_tank', 'monkas_{n}', 'icant_{n}', 'omegalul_{n}'],
  wholesome: ['good_vibes_only', 'hydrate_chat', 'be_nice_bot_{n}', 'gg_wp_always', 'kind_viewer{n}', 'respect_both_teams', 'wholesome_watcher', 'happy_to_be_here', 'sunshine_chatter'],
  timezone: ['3am_watcher', 'night_owl_{n}', 'sleepless_in_{n}', 'lunch_break_lol', 'work_in_4_hours', 'insomnia_esports', 'wrong_timezone_{n}', 'coffee_at_midnight'],
  regionwar: ['region_diff_{n}', 'major_region_enjoyer', 'my_league_better', 'region_patriot{n}', 'international_andy', 'msi_predictor', 'worlds_or_bust_{n}', 'league_tourist'],
  lurker: ['longtime_lurker', 'lurker_{n}', 'silent_viewer{n}', 'rarely_types', 'lurk_mode_on', 'quiet_one_{n}', 'shadow_viewer', 'background_noise_{n}'],
};

/** Ambient lines per persona (any phase). */
export const PERSONA_IDLE: Record<Persona, string[]> = {
  superfan: [
    '{SHORT} {SHORT} {SHORT}', 'LETS GO {SHORT}', '{short} till i die', 'been a {short} fan since day one', 'i believe in {star}',
    '{STAR} CARRY US', 'chat say something nice about {star}', 'my {short} jersey is ON', 'nobody does it like {short}', 'Prayge {short} Prayge',
    '{SHORT} FIGHTING', 'cleared my whole evening for {short}', '{short} never gives up', 'GIGACHAD {star}', 'trust the process {short}',
    'everyone spam {SHORT} for luck', '{star} best in the world, don’t @ me', 'manifesting a {short} win Prayge', 'woke up early just for this {short} game',
    '{short} fans make some noise', '{ourjg} pathing looks clean today', 'chat {ourmid} is HIM', '{short} supremacy', 'watch {star} go off this game',
    'every {short} game is a holiday in my house', 'i have {short} wallpaper on every device', 'my dog is named after {star}', '{SHORT} WIN THIS FOR ME',
    '{star} on {starchamp} is a cheat code', 'no one is stopping {short} today', 'HYPERS {short} game', 'i love this team so much', '{short} fans assemble',
    'catJAM {short} catJAM', '{SHORT} {SHORT} LETS GOOO', 'we’re winning this, i can feel it', 'the {short} bot lane is so clean', '{oursup} roams are art',
  ],
  rival: [
    '{OPPSHORT} {OPPSHORT}', '{oppShort} fans rise up', '{short} fans about to be real quiet', '{oppShort} in 25 KEKW', '{short} overrated every year',
    '{oppstar} is gonna eat today', 'imagine being a {short} fan KEKW', '{oppShort} army where you at', '{oppShort} gonna make this look easy', '{short} peaked last year',
    'nobody fears {short} anymore', '{oppstar} > {star}', '{oppShort} diff incoming', 'cope harder {short} fans', '{OPPSHORT} FIGHTING',
    'this chat is so biased KEKW', 'only {oppShort} fan in this chat it feels like', '{oppShort} gonna shock the world', '{short} draft looks scared', '{oppjg} is about to take over',
    'GO {OPPSHORT}', '{short} fans typing paragraphs already KEKW', 'calm down {short} fans, it’s early', '{oppShort} don’t miss in big games', 'sorry {short} fans, not today',
  ],
  analyst: [
    'gold diff {lead} at {mins} min', '{star} sitting at {starcs} cs ({starcspm}/min)', 'kill score {score} but gold says {lead}', 'drakes {drakes}-{oppdrakes}, that matters later',
    'towers {towers}-{opptowers}, map control follows that', 'Flash down on {flashdown}, that’s a 5 minute window', 'cs diff {csdiff} across the map',
    'the side with more turrets usually wins from here', 'first tower gold is huge in this patch', 'proximity favours {leader} right now', 'vision control around the pit decides the next fight',
    'wave states crashing bot, perfect rotate timing', 'that recall timing was clean', '{leader} has tempo, {trailer} has to play for picks', 'objective trading is underrated',
    'grubs are worth more than people think', 'they keep resetting on cannon waves, good discipline', 'the jungler tracking here is impressive', '{ourjg} has been on the right side all game',
    'early game is about lane prio, this is textbook', 'item spikes matter: watch the 2-item timing', 'the team that clears vision first wins the fight', 'gold/min is {gpm} for {leader}',
    'kill participation from the support is huge this game', 'this is a scaling vs tempo game, watch the 25 min mark', 'reminder: Flash is 300 seconds, count it', 'the {diffrole} lane is {diffgold} up in gold for {diffside}',
    'every Baron throw starts with no vision', 'statistically the next fight decides the game', 'that was a 1.5k gold swing', 'drake soul point changes every call from here',
  ],
  doomer: [
    'i have a bad feeling about this', 'this is where we throw', 'don’t get comfy', 'i’ve seen this movie before', 'every year same story', 'it’s over isn’t it',
    'Aware', 'we always find a way to lose', 'i’m not getting my hopes up', 'something bad is coming', 'enjoy it while it lasts', 'there it is. the throw. any minute now',
    'my heart can’t take this team', 'we peaked and nobody told me', 'calm before the storm', 'one face check and it’s gg', 'i’ll believe it when the nexus explodes',
    'Copium tank empty', 'why do i do this to myself', 'expecting the worst so i can only be surprised', 'Sadge already', '{short} never makes it easy',
    'they’re gonna throw baron, watch', 'i can feel the throw in my bones', 'every lead we’ve ever had got thrown', 'this is fine Aware',
  ],
  memer: [
    'chat is this real?', 'chat is this real or is it AI', '-1000 aura', '+1000 aura', 'aura farming', 'W', 'L', 'ratio', 'skill issue', 'bro is cooked',
    'we’re cooked', 'let him cook', 'he’s cooking', 'it’s so over', 'we’re so back', 'NPC behaviour', 'main character energy', 'lock in', 'locked in',
    'this is cinema', 'absolute cinema', 'peak', 'real', 'true', 'no shot', 'fr fr', 'lowkey {short} kinda cracked', 'delulu is the solulu', 'the audacity',
    'who let him cook', 'plot armor', 'built different', 'caught in 4k', 'touch grass', 'rent free', 'he’s him', 'not him', 'who is this guy',
    'bro thinks he’s in ranked', 'bro forgot he’s on stream', 'ain’t no way', 'nahhh', 'bruh', 'sheesh', 'LMAO', '💀', '😭', '🔥🔥🔥', 'it’s giving throw',
    'it’s giving comeback', 'glazing {star} again', 'stop glazing chat', 'average {short} enjoyer', 'average {oppShort} enjoyer', '{star} aura is insane',
    'this game has lore', 'the lore is deep', 'tell me you’re a jungler without telling me', 'zero thoughts, only Baron', 'brain empty, just catJAM',
    'not the {rchamp} 💀', '{rchamp} player detected', 'unc moment', 'side quest: ward the pit', 'speedrunning the throw any%', 'patch notes: chat nerfed',
    'mods, add the aura meter', 'ok that’s actually crazy', 'genuinely what', 'POV: you’re the cannon minion', 'this chat is unhinged and i love it', 'the vibes are immaculate',
  ],
  copypasta: [],
  casual: [
    'who’s winning?', 'is this ranked?', 'what are the purple bugs', 'why is everyone standing still', 'which one is {star}?', 'what does the number above them mean',
    'how do you know who’s winning', 'is this live?', 'what time does the next game start', 'my friend said this game is fun to watch, is it?', 'which team is blue side?',
    'why is the map so big', 'what does baron do?', 'what’s cs?', 'is {short} good?', 'why do they keep going back to base', 'who is the best player here',
    'how long do these games last', 'so many abilities, how do they keep track', 'is the dragon important?', 'what happens if the big crystal breaks', 'what’s a gank',
    'wait they can turn invisible?', 'ok this is actually fun to watch', 'first time watching, rooting for {short}', 'the little guys walking are minions right?',
  ],
  backseat: [
    'ward the pixel bush', 'buy {item} already', 'why no TP?', 'should’ve taken drake there', 'i would’ve flashed forward', 'look at the minimap!!', 'freeze the wave bro',
    'why is the support warding there', 'jungler should be top side', 'they need to group', 'split push top now', 'ignore drake, take tower', 'track the jungler!!',
    '3 waves crashing, just base', 'why are they not sweeping', 'perma-shove mid and invade, it’s not hard', 'that’s a free dive, take it', '{ourjg} needs to path bot',
    'sell the starter already', 'they should be playing for soul, obviously', 'that recall was 10 seconds too late', 'rotate mid now', 'bait baron, fight on the flank',
    'why is nobody pinging', 'that’s a clear {item} game', 'trade top for drake, simple', 'my coach brain is screaming', 'they’re overthinking it, just fight',
    'why did they not ward the river', 'the {ouradc} position is all wrong in fights', 'who drafted no engage', 'should’ve banned {oppstarchamp}',
    'they need a {item} on someone', 'stop fighting in the river without prio', 'sweep before you walk in!!', 'ping the timers bro', 'sell boots, buy wards, trust me',
  ],
  spammer: [],
  wholesome: [
    'hi chat HeyGuys', 'gg already, both teams are great', 'love this game', 'great game so far', 'both teams look good', 'enjoy the game everyone',
    'chat be nice to the players', 'appreciate the casters today', 'hydrate chat', 'respect to {oppShort}, they’re playing well', 'so glad i caught this live',
    'what a time to be a league fan', 'good luck to both teams', 'win or lose, great effort', 'this community is the best (most of the time)', 'stretch your legs chat',
    'shoutout to the mods', 'hope everyone is having a good day', 'peepoClap for both teams', 'imagine how nervous the players are, respect', 'what a beautiful game this is',
  ],
  timezone: [
    '{hour}am in {city} and i’m watching this', 'watching from {city} on my lunch break', 'late night in {city}, worth it', 'who else watching from {city}?',
    'it’s {hour}am, i have work in 4 hours, no regrets', 'sunrise in {city} and we’re still here', 'alarm set for this game, worth it', 'watching at work, don’t tell my boss',
    'greetings from {city} catJAM', '{hour}am here, my neighbours can hear me screaming', 'school in 3 hours Clueless', 'breakfast + league in {city}',
  ],
  regionwar: [
    '{region} > all', 'average {region} macro', '{region2} viewer here, this is good league', '{region2} would’ve thrown this already KEKW', 'my region could never',
    '{region} diff', 'imagine {region2} vs this team', 'region diff is real', 'international is going to be wild this year', '{region2} fans watching for the vibes',
    '{oppregion} fans in shambles if they lose this', '{region2} would need 50 minutes for this KEKW', '{region} gap', 'all regions are fun, fight me',
    '{region2} enjoyer here, taking notes', 'no region war today chat, just vibes (jk {region} > {region2})', '{region} teams don’t throw (they do)',
    'the {region} crowd is built different', 'this would be a Worlds final in {region2} KEKW', 'region war in chat again Okayge',
  ],
  lurker: [
    'first time chatting, love this team', 'hi chat, long time lurker', 'been lurking for 3 years, had to say something', 'ok that was too good, i had to type',
    'never type in chat but LETS GO {SHORT}', 'lurker checking in', 'back to lurking', 'just here to say {star} is amazing', 'my first message: W',
  ],
};

/** Persona reactions to game moments (from the perspective of the user's team: "good" = good for {short}). */
export const PERSONA_REACT: Partial<Record<Persona, Partial<Record<Moment, string[]>>>> = {
  superfan: {
    good: ['{SHORT} {SHORT}', 'THAT’S MY TEAM', 'LETS GOOO {SHORT}', 'told you {star} is HIM', '{oppShort} fans so quiet now KEKW', 'keep stomping', 'that’s {short} baby', 'W {short}', 'clean clean clean', 'HYPERS'],
    bad: ['it’s fine, we’re fine Copium', '{short} will bounce back', 'unlucky, next fight is ours', 'still believe', 'one fight and we’re back', 'calm down chat, it’s fine', 'Copium {star} will carry', 'that’s ok, we scale', 'Prayge come back {short}', 'deep breaths chat'],
    bigGood: ['WE ARE SO BACK', '{SHORT} DIFF', 'I’M SHAKING', 'BEST TEAM IN THE WORLD', 'clip it, frame it, hang it', '{SHORT} {SHORT} {SHORT} {SHORT}', 'i’m literally screaming', 'THIS IS WHY I’M A FAN'],
    bigBad: ['nooo', 'still a fan, always', 'i can’t watch this', 'it’s not over Copium', 'we’ve come back from worse', 'PepeHands my team', 'stay strong {short}', 'my heart'],
    ahead: ['comfy lead', 'don’t throw pls don’t throw', 'close it out {short}', 'this is the {short} i know', '{star} diff honestly'],
    behind: ['scaling comp, relax', 'one fight, that’s all we need', 'we’ve been here before', 'Copium we’re fine', 'believe in {star}'],
    win: ['{SHORT} WIN LETS GOOO', 'NEVER DOUBTED', 'BEST TEAM BEST FANS', '{SHORT} {SHORT} {SHORT}', 'see you all next game, {short} forever'],
    loss: ['still proud', 'we go again', 'heads up {short}', 'one game doesn’t define us', 'i’ll be here next game, always'],
  },
  rival: {
    good: ['lucky', 'that was a gift', '{oppShort} will be fine', 'one kill doesn’t mean anything', 'ok that was clean, i’ll give them that', 'enjoy it while it lasts', 'calm down {short} fans', 'misclick'],
    bad: ['{OPPSHORT} DIFF', 'told you KEKW', '{short} fans where you at', 'EZ', '{oppstar} is HIM', 'L {short}', '{OPPSHORT} {OPPSHORT}', 'as expected'],
    bigGood: ['it’s just one fight', 'ok... ok...', 'fine, that was good', 'shh', 'we’ll see at Baron', 'don’t celebrate yet'],
    bigBad: ['GG {short}', '{OPPSHORT} {OPPSHORT} {OPPSHORT}', 'this is {oppShort}’s game now', '{short} fans getting quiet KEKW', 'ff15 {short} KEKW'],
    ahead: ['{short} will throw, watch', 'lead means nothing vs {oppShort}', 'scaling comp {oppShort}, relax'],
    behind: ['{short} up {gold}? not for long', '{oppShort} in control', 'easy game for {oppShort}'],
    win: ['gg... good game', 'next time', '{oppShort} will be back', 'ok {short} played well today', 'pain'],
    loss: ['EZ {OPPSHORT}', 'told you all', 'where are the {short} fans now', '{OPPSHORT} {OPPSHORT} {OPPSHORT}', 'see you next time {short} fans KEKW'],
  },
  doomer: {
    good: ['don’t celebrate, it’s a trap', 'we’ll give it back', 'enjoy it while it lasts', 'ok but we’re still gonna throw', 'i’ll believe it when the nexus explodes'],
    bad: ['it’s over', 'gg go next', 'ff15', 'called it', 'every single time', 'and there it is', 'i knew it', 'not again'],
    bigGood: ['ok i’m slightly less worried', 'wait are we actually winning', 'don’t jinx it', 'i refuse to get excited'],
    bigBad: ['gg go next', 'it’s over chat', 'ff15 save us the pain', 'uninstalling', 'told you all', 'this team will be the end of me'],
    ahead: ['big lead = bigger throw', 'we’re gonna throw this', 'i’ve seen bigger leads thrown', '{short} throws this, mark my words'],
    behind: ['gg go next', 'it’s over', 'ff15 already', 'we’re not coming back from this', 'expected tbh'],
    win: ['wait we won?', 'i can’t believe it', 'ok i was wrong this time', 'heart rate back to normal'],
    loss: ['i told you', 'as foretold', 'same as always', 'see you next heartbreak'],
  },
  analyst: {
    good: ['that’s a {gold} lead now', 'good trade for {short}', 'that converts into the next objective', 'tempo for {short}', 'clean setup, look at the wards'],
    bad: ['that’s a {gold} swing', 'bad trade for {short}', 'they lost vision first, that’s why', 'that loses them the next drake too', 'that was a positioning error, not mechanics'],
    bigGood: ['that should be game-defining', 'win probability through the roof', 'that’s the textbook fight', 'that was a 3k gold swing'],
    bigBad: ['that’s a 3k gold swing', 'win probability just dropped hard', 'they have to play for picks now', 'that fight was lost before it started: no vision'],
    ahead: ['{gold} lead at {mins} min converts most of the time', 'they should take Baron next', 'lead is {gold}, just don’t give shutdowns'],
    behind: ['down {gold}, need a pick', 'they need to stall to 3 items', 'the bounty system helps them now'],
    win: ['GG, that was decided by vision', 'MVP {mvp} for me', 'clean macro game', '{mins} minutes, efficient'],
    loss: ['GG, the objective control decided it', 'too many deaths on the side lanes', 'lots to fix in the VOD review'],
  },
  memer: {
    good: ['W', '+1000 aura', 'he’s him', 'let him cook', 'cooked them', 'absolute cinema', 'aura', 'ratio + you fell off ({oppShort})'],
    bad: ['L', '-1000 aura', 'skill issue', 'bro is cooked', 'we’re cooked', 'NPC behaviour', 'caught in 4k', 'ratio'],
    bigGood: ['WE’RE SO BACK', '+10000 aura', 'this is cinema', 'peak fiction', 'he’s HIM', 'chat is this real?'],
    bigBad: ['IT’S SO OVER', '-10000 aura', 'cooked beyond repair', 'chat is this real?', 'canon event', 'plot armor ran out'],
    ahead: ['comfy', 'aura lead {gold}', 'we’re so back'],
    behind: ['it’s so over', 'negative aura', 'Copium'],
    win: ['W', 'W W W', 'absolute cinema', '+∞ aura', 'peak'],
    loss: ['L', 'it’s so over', '-∞ aura', 'canon event'],
  },
  backseat: {
    good: ['finally they listen to me', 'that’s what i said 5 minutes ago', 'see? just fight', 'ok coach approved'],
    bad: ['i SAID ward the pit', 'that’s on the jungler', 'why would you fight there', 'unbelievable decision making', 'buy {item} please'],
    bigBad: ['i’ve been saying this all game', 'hire me', 'how do pros not see that', 'that call was so bad'],
    win: ['good game, my coaching paid off', 'they followed my advice tbh'],
    loss: ['should have listened to chat', 'draft lost this, i called it'],
  },
  wholesome: {
    good: ['nice play!', 'well played {short}', 'peepoClap'],
    bad: ['nice play {oppShort}', 'unlucky {short}, you got this', 'still a great game'],
    win: ['gg wp both teams', 'what a game, thanks for the show', 'congrats {short}!'],
    loss: ['gg wp, {oppShort} deserved it', 'heads up {short}, great effort', 'proud of both teams'],
  },
};

/** Original copypastas ({short}/{oppShort}/{star}/{ourjg}/{oppjg} filled in). PG-13, about the game only. */
export const COPYPASTAS: string[] = [
  'I don’t always watch {short} games, but when I do, my Doran’s Blade is unsheathed and my heart is on Flash cooldown. 300 seconds of courage. 0 seconds of fear. {SHORT} FIGHTING',
  'Hello, I am the Baron. I have been in this pit for 20 minutes. Nobody visits. Nobody calls. Today they came by and didn’t even bring flowers. Please respect the Baron. Thank you.',
  'Ward the pixel bush. Ward the pixel bush. My grandmother wards the pixel bush. My grandmother is Iron 4. WARD. THE. PIXEL. BUSH.',
  'Excuse me {oppShort}? Yes hello, this is the outer turret. I would like to report being dived four times in one minute. I have a family. I had plates.',
  'Day 47 of asking {short} to ward the dragon pit before the fight. They have not warded the dragon pit. I will keep asking. See you tomorrow for day 48.',
  'If {star} gets a pentakill today I will eat my keyboard. Not a metaphor. The salt is ready. The ketchup is ready. I am ready.',
  '{short} jungle pathing explained: top side, bot side, my side, your side, river side, wherever the camera is NOT 5Head',
  'Me: one game then bed. The game: 47 minutes, 3 Barons, a base race and an Elder steal. Me at 4am: just one more game Bedge',
  'Scientists say the average chatter makes 47 macro calls per minute while being hardstuck Silver. I am the average chatter. Ward the river.',
  'This is my {short} jersey. I wear it every game. I have not washed it since the last title. It smells like victory (and also not great).',
  'Hi, I’m the Rift Herald. I’d like to talk to you about your turret’s extended warranty.',
  'Pros: 10 CS a minute. Me: misses the cannon, blames lag, alt-F4, uninstalls, reinstalls, queues again within 6 minutes.',
  'BREAKING: local viewer types “gg” at 10 minutes, then watches the entire comeback in total silence. More at 11.',
  'Chat, I have analysed the VOD frame by frame. The problem is they are losing. Thank you for coming to my TED talk 5Head',
  '♪ Farming in the jungle, the minions start to sing ♪ nobody wants to fight ♪ it’s a farming simulator thing ♪ catJAM',
  'Ladies and gentlemen, we got him. The {oppShort} jungler has been spotted. He was in his own jungle the whole time.',
  'Every time someone types ff in chat, a Poro loses its snack. Please. Think of the Poros.',
  'Dear diary, today the bot lane got dived for the 6th time. The turret is fine. It is the support’s feelings I’m worried about.',
  'I am a simple viewer. I see a steal, I type STOLEN. I see a throw, I type KEKW. I see {short} win, I type W. Life is simple.',
  'Patch notes: Chat — backseat gaming effectiveness reduced by 100%. Was too strong in Silver.',
  'My mom asked why I’m screaming at a 40-minute farming simulator. I said it’s the meta, Mom. She said it’s a Tuesday. She’s right.',
  '{SHORT} fans: we’re so back. {SHORT} fans 4 minutes later: it’s so over. {SHORT} fans 2 minutes later: WE’RE SO BACK.',
  'This chat has more mechanics than both teams combined. Unfortunately, they are all typing mechanics.',
  'Uninstalled League 6 times this year. Still here. Still watching. Still Silver. Still believe. {SHORT}',
  'POV: you are the cannon minion. Everybody wants you. Nobody protects you. Then they miss you anyway.',
  'I’m not saying the {oppShort} top laner is lost, but his minimap just filed a missing person report.',
  'Today’s game is brought to you by Flash: because walking away is for people without a cooldown.',
  'If you are reading this, ward your jungle. If you are not reading this, also ward your jungle.',
  'The year is 2035. Chat is still asking “who’s winning?”. Somebody answers. Chat asks again 4 seconds later.',
  'HEY {OPPSHORT} JUNGLER, I KNOW YOU’RE READING THIS. THE SCUTTLE IS TOP SIDE. YOU’RE WELCOME. — a concerned neutral fan',
  'Fun fact: 100% of teams that destroy the enemy Nexus go on to win the game. Stay hydrated.',
  'Me before the game: I’m a neutral viewer. Me after first blood: {SHORT} OR NOTHING.',
  'Kid named Flash cooldown: 300 seconds. Kid named Baron: shows up at 20. Kid named {ourjg}: nowhere to be found.',
  'Nobody: … Literally nobody: … {short} support at minute 3: *walks into four enemies to place one ward*',
  'Roses are red, Baron is purple, they took it without vision, and now I’m a turtle.',
  'They said “play for late game”. It’s minute 38. I have aged. My snacks have aged. The Nexus remains. Play for late game.',
  'Step 1: get a lead. Step 2: get a bigger lead. Step 3: walk into the river without vision. Step 4: chat types KEKW. Classic.',
  'Hello {oppShort}, it’s me, your conscience. Please ward before Baron. Sincerely, every viewer in this chat.',
  'Do you ever just watch a support roam mid and feel something? No? Just me? {oursup} you beautiful human.',
  'Breaking news: Dragon soul has been spotted wearing sunglasses. Experts say it is “extremely cool” and “probably the game”.',
  'I was born in the pit. Molded by it. I didn’t see vision until I was already a man. — the Baron, probably',
  'Alright chat, deep breath. In: Copium. Out: Hopium. In: Copium. Out: we’re so back. Repeat until the Nexus explodes.',
  'What if the real Baron… was the friends we made along the way? (no it was the Baron, it was worth 1500 gold)',
];

/** Short meme formats people post without a full pasta. */
export const MEMES: string[] = [
  'chat is this real?', 'chat, is this real or am I dreaming', 'chat is this the throw?', 'chat are we cooked', 'chat is he him?',
  '-1000 aura', '+1000 aura', '-500 aura for that flash', '+500 aura, clean', 'aura check', 'aura diff',
  'W', 'L', 'W W W', 'L L L', 'massive W', 'huge L', 'W play', 'L call', 'W chat', 'L chat',
  'ratio', 'ratio + skill issue', 'skill issue', 'massive skill issue', 'issue of the skill variety', 'diff', 'gap', 'gapped',
  'first time watching?', 'first time watching league?', 'first time watching {short}?', 'it’s always like this, welcome',
  'nobody asked KEKW', 'average chat moment', 'chat moment', 'this chat KEKW', 'we live in a society', 'it is what it is',
  'Clueless we’re fine', 'Aware', 'Copium', 'HOPIUM', 'ICANT', 'LULW', 'OMEGALUL', 'Stare', 'Okayge', 'Chatting',
  'NOTED', 'this is fine', 'emotional damage', 'certified classic', 'core memory unlocked', 'canon event',
  'main character moment', 'side character energy', 'NPC dialogue', 'zero thoughts head empty', 'the lore deepens', 'this is peak',
  'chat i’m scared', 'chat hold me', 'chat i need a minute', 'i need to lie down', 'my heart', 'my blood pressure',
  'clip it', 'CLIP IT', 'clipped', 'someone clip that', 'that’s going in the montage', 'that’s a thumbnail',
  'bro', 'bruh', 'ayo', 'nah', 'nahhh', 'sheesh', 'yikes', 'oof', 'big oof', 'welp', 'well well well', 'oh no', 'oh no no no', 'OH NO',
  'lmao', 'LMAO', 'lol', 'LOL', 'XD', 'xdd', 'haha', 'HAHAHA', '?', '??', '???', '!!!', '...', 'hmm', 'monkaHmm', 'what', 'WHAT',
];

/** Keyboard smashes and caps-lock hype (big moments). */
export const SMASH: string[] = [
  'ASDJKLASDJ', 'AJSKDLAJSD', 'QWERUIOP', 'ksdfhjkdsf', 'AAAAAAAAAAA', 'AAAAAAAAAAAAAAAA', 'HOLY', 'HOLYYYYY', 'HOLY MOLY',
  'WHAT', 'WHAT??', 'WHAT WAS THAT', 'NO WAY', 'NO SHOT', 'NO SHOT BRO', 'BROOOOO', 'YOOOOOO', 'YOOOO WHAT', 'LETS GOOOOOOOO',
  'I’M SCREAMING', 'MY NEIGHBOURS HEARD THAT', 'SKDJFHKSDJF', 'AKSJDHAKSJD', 'jsdhfkjsdhf', 'OMG OMG OMG', 'BRO WHAT',
  'HOW', 'HOW????', 'EXCUSE ME', 'SIT DOWN', 'STAND UP', 'GET UP', 'NOOOOOO', 'NOOOOOOOOOOO', 'YESSSSSSS', 'WHAT WAS THAT ????',
];

/** Lane "diff" calls (filled from the biggest gold gap between laners). */
export const DIFF_LINES: string[] = [
  '{diffrole} diff', '{diffrole} diff tbh', '{diffrole} gap', 'massive {diffrole} diff', '{diffname} diff', '{diffname} gapping his lane',
  '{diffrole} diff, {diffgold} gold', 'the {diffrole} diff is real', '{diffside} {diffrole} is just better', '{diffrole} diff, it’s not close',
  'coach diff', 'draft diff', 'manager diff', 'smite diff', 'flash diff', 'ward diff', 'vision diff', 'macro diff', 'comms diff', 'mental diff',
  '{leader} diff', 'everything diff', 'gaming chair diff', 'hydration diff', 'sleep schedule diff',
];

/** Farming jokes for quiet stretches. */
export const FARM: string[] = [
  'this is a farming simulator', 'farming simulator ResidentSleeper', 'Stardew Valley: Rift edition', 'cs simulator 2026', 'everyone is farming, peace treaty signed',
  'harvest season on the rift', 'ResidentSleeper wake me up at Baron', 'they’re farming like the minions owe them money', 'peaceful farming, love it',
  'nobody wants to fight, it’s a gentlemen’s agreement', 'the minions are the real MVPs', 'cs diff is the only diff today', 'Bedge farming stream',
  'just a nice relaxing farming game', 'if I wanted farming I’d play a farm game KEKW', 'Bedge', 'Okayge farm', 'the gold graph is a flat line Bedge',
  'both junglers on a camping trip', 'wake me up when something happens', 'catJAM farming music catJAM', 'ResidentSleeper ResidentSleeper',
];

/** Food / life chatter for quiet stretches. */
export const FOOD: string[] = [
  'ordering pizza mid-game, priorities', 'my ramen is cold now, worth it', 'who else snacking rn', 'brb microwave', 'back, what did i miss',
  'made tea, ready for the late game', 'dinner at the desk again', 'chips are gone and it’s only minute {mins}', 'popcorn ready for teamfights',
  'energy drink #3, let’s go', 'my cat is watching with me', 'mom says dinner is ready, she can wait', 'snack break while they farm',
  'just finished my homework for this', 'watching on my phone in the bus', 'on the treadmill watching this', 'cooking pasta, appropriately',
];

/** Pause chatter (the viewer paused the playback). */
export const PAUSE: string[] = [
  'PauseChamp', 'tech pause?', 'pause???', 'is it paused or is my stream frozen', 'who paused', 'refs checking something', 'bio break KEKW',
  'pause = snack time', 'unpause pls', 'Bedge waiting', '?????', 'frozen?', 'F5', 'my stream is lagging or what', 'refresh gang',
  'pause in a pro game, monkaHmm', 'chat, the game stopped', 'technical difficulties Okayge', 'Chatting while we wait', 'someone kicked the cable KEKW',
];

/** Emote waves: on big moments chat floods with one token (combo counter). Tokens are filled with the event ctx. */
export const WAVES: Record<string, { tokens: string[]; tone?: 'hype' | 'sad' | 'lore'; size: [number, number]; pri: number }> = {
  penta:      { tokens: ['PENTAKILL', 'PogChamp', 'POGGERS', '{KILLER}', 'HYPERS'], tone: 'hype', size: [26, 48], pri: 5 },
  quadra:     { tokens: ['PauseChamp', 'ONE MORE', 'Pog'], tone: 'hype', size: [14, 26], pri: 4 },
  outplay:    { tokens: ['5Head', 'GIGACHAD', 'Pog', 'OUTPLAYED', 'HE’S HIM'], tone: 'hype', size: [12, 24], pri: 3 },
  multi_them: { tokens: ['D:', 'monkaW', 'NotLikeThis'], tone: 'sad', size: [8, 16], pri: 3 },
  ace_us:     { tokens: ['ACE', 'EZ Clap', 'Pog', 'GIGACHAD'], tone: 'hype', size: [14, 28], pri: 4 },
  ace_them:   { tokens: ['o7', 'Sadge', 'PepeHands', 'NotLikeThis'], tone: 'sad', size: [10, 22], pri: 4 },
  steal_us:   { tokens: ['STOLEN', 'KEKW', 'Pog', 'OMEGALUL', '5Head'], tone: 'hype', size: [18, 36], pri: 5 },
  steal_them: { tokens: ['NOOO', 'D:', 'KEKW', 'ICANT'], tone: 'sad', size: [12, 26], pri: 5 },
  baron_us:   { tokens: ['BARON', 'Pog', 'catJAM'], tone: 'hype', size: [8, 16], pri: 2 },
  baron_them: { tokens: ['monkaW', 'D:', 'DEFEND'], tone: 'sad', size: [6, 12], pri: 2 },
  elder_us:   { tokens: ['ELDER', 'EZ Clap', 'GIGACHAD'], tone: 'hype', size: [10, 20], pri: 3 },
  elder_them: { tokens: ['monkaW', 'RUN', 'D:'], tone: 'sad', size: [8, 16], pri: 3 },
  soul_us:    { tokens: ['SOUL', 'catJAM', 'Pog'], tone: 'hype', size: [6, 12], pri: 2 },
  comeback:   { tokens: ['WE ARE SO BACK', 'Pog', 'HOPIUM', 'COMEBACK'], tone: 'hype', size: [18, 34], pri: 4 },
  throw:      { tokens: ['KEKW', 'ICANT', 'LULW', 'THROW', 'Aware'], tone: 'sad', size: [16, 30], pri: 4 },
  baserace:   { tokens: ['monkaW', 'BASE RACE', 'monkaS', 'monkaGIGA'], size: [16, 30], pri: 4 },
  end_us:     { tokens: ['END END END', 'GO GO GO', 'PauseChamp'], tone: 'hype', size: [8, 16], pri: 3 },
  defend:     { tokens: ['DEFEND', 'monkaW', 'HOLD'], tone: 'sad', size: [8, 16], pri: 3 },
  win:        { tokens: ['W', 'GG', '{SHORT}', 'EZ Clap', 'catJAM'], tone: 'hype', size: [26, 46], pri: 5 },
  loss:       { tokens: ['L', 'o7', 'Sadge', 'GG'], tone: 'sad', size: [16, 30], pri: 5 },
  lore_nexus: { tokens: ['NEXUS SAID NO', 'ICANT', 'KEKW', 'AS WRITTEN'], tone: 'lore', size: [20, 40], pri: 5 },
  fb_us:      { tokens: ['Pog', 'FIRST BLOOD'], tone: 'hype', size: [5, 10], pri: 1 },
  fb_them:    { tokens: ['Sadge', 'D:'], tone: 'sad', size: [4, 8], pri: 1 },
  raid:       { tokens: ['{RAIDER} RAID', 'peepoArrive', 'HeyGuys'], size: [12, 24], pri: 3 },
  timeout:    { tokens: ['o7', 'MODS', 'KEKW'], size: [4, 8], pri: 1 },
  pause:      { tokens: ['PauseChamp', '?'], size: [5, 10], pri: 1 },
  gift:       { tokens: ['peepoClap', 'PogChamp', 'GIFTED'], size: [6, 12], pri: 2 },
  copypasta:  { tokens: [], size: [0, 0], pri: 0 },
};

/** Emote families for emote-only spam by mood. */
export const EMOTE_MOOD: Record<'hype' | 'sad' | 'laugh' | 'scared' | 'bored' | 'cope' | 'neutral', string[]> = {
  hype: ['Pog', 'PogChamp', 'POGGERS', 'PogU', 'HYPERS', 'GIGACHAD', 'EZ Clap', 'catJAM', 'peepoClap', 'FeelsStrongMan', 'Kreygasm'],
  sad: ['Sadge', 'PepeHands', 'NotLikeThis', 'FeelsBadMan', 'BibleThump', 'o7', 'Deadge'],
  laugh: ['KEKW', 'OMEGALUL', 'LULW', 'LUL', 'ICANT', 'PepeLaugh', 'xdd'],
  scared: ['monkaS', 'monkaW', 'monkaGIGA', 'D:', 'WutFace'],
  bored: ['ResidentSleeper', 'Bedge', 'Okayge', 'Chatting', 'Stare'],
  cope: ['Copium', 'COPIUM', 'HOPIUM', 'Clueless', 'Aware', 'Prayge'],
  neutral: ['catJAM', 'NODDERS', 'monkaHmm', '5Head', 'NOTED', 'Kappa', 'SeemsGood', 'Okayge'],
};

/** Items backseat gamers want bought. */
export const ITEMS: string[] = ['QSS', 'Zhonya’s', 'Mercury’s Treads', 'Executioner’s Calling', 'Serpent’s Fang', 'Banshee’s Veil', 'Guardian Angel', 'Randuin’s Omen', 'Thornmail', 'Morellonomicon', 'Mortal Reminder', 'Edge of Night', 'Spirit Visage', 'Frozen Heart', 'Mikael’s Blessing', 'a Control Ward', 'Oracle Lens', 'Plated Steelcaps'];

/** League names per region, and cities for the timezone crowd. */
export const REGION_LEAGUE: Record<string, string> = { KR: 'LCK', CN: 'LPL', EMEA: 'LEC', NA: 'LCS', BR: 'CBLOL', APAC: 'LCP' };
export const LEAGUES = ['LCK', 'LPL', 'LEC', 'LCS', 'CBLOL', 'LCP'];
export const CITIES: string[] = [
  'Seoul', 'Busan', 'Shanghai', 'Chengdu', 'Berlin', 'Paris', 'Madrid', 'Warsaw', 'Stockholm', 'London', 'Toronto', 'LA', 'New York', 'Chicago',
  'São Paulo', 'Rio', 'Taipei', 'Hanoi', 'Ho Chi Minh City', 'Manila', 'Sydney', 'Bangkok', 'Mexico City', 'Lisbon', 'Istanbul', 'Jakarta',
  'Auckland', 'Vancouver', 'Lima', 'Copenhagen', 'Helsinki', 'Dublin', 'Johannesburg', 'Tokyo', 'Kuala Lumpur', 'Santiago', 'Prague', 'Athens',
];
