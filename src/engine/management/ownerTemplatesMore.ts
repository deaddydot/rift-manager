// Owner content pack: mail and choice requests for new events and "self-aware" anomalies (merged into OWNER_T / QUIRK_T at load).
import type { OwnerTemplate } from './ownerTemplates';

export const MORE_OWNER_T: Record<string, OwnerTemplate> = {
  anomaly_jump: {
    subj: ['What happened to {player}?', '{player}: {old} → {ovr}?!', 'About {player}’s overnight improvement'],
    body: [
      '{player} went from {old} to {ovr} overnight. Plus {delta}. I’ve seen players improve, but usually it takes a season, not a single night’s sleep. Whatever you did, keep doing it — and tell me what it was.',
      'Our scouting report says {player} is now rated {ovr}. Yesterday it said {old}. Either the scouts are wrong or something remarkable happened between dinner and breakfast. I’d like to know which.',
      '+{delta} for {player} in one night. I’m not complaining. I’m just asking. Is this a glitch? Please tell me it’s not a glitch. Glitches get patched.',
    ],
    trait: {
      patient: ['{player} jumped from {old} to {ovr} overnight. I usually preach patience, but I won’t argue when patience pays out early. Let’s not rush to explain it. Let’s just let him play.'],
      impatient: ['{player}: {old} to {ovr} in one night. THIS is the speed I want from everyone. Can you do it again by Friday? To the whole roster?'],
      frugal: [
        '{player} is now a {ovr} on a {old} salary. That is the best value-for-money deal in the history of this club. Do NOT let his agent find out.',
        '+{delta} for {player} and it didn’t cost us a single cent. I’ve read the invoices twice. There are no invoices. Beautiful.',
      ],
      generous: ['A {ovr}! Yesterday {player} was a {old}! I’m taking him and the whole team to dinner at the good place. Clearly something in this building is working.'],
      ambitious: ['+{delta} overnight for {player}. Now we’re talking. A {ovr} is a trophy-level player. Do the same for four more and we win Worlds.'],
      meddling: ['{player} jumped to {ovr}. I suspect it’s the drill I emailed you last week, the one with the cones. You’re welcome. I have eleven more drills.'],
      superstitious: [
        '{player}: {old} to {ovr} overnight. I moved the lucky cactus to his desk on Monday. I’m not saying it was the cactus. I’m saying it was the cactus.',
        'My astrologer predicted “a sudden rise in the house of {short}”. {player} gained {delta} overnight. She is getting a raise.',
      ],
      publicity: ['{player} is suddenly a {ovr}! That’s a story! “From Nobody to Somebody in One Night.” I’ve called three journalists and a documentary crew. Get him media-trained by Thursday.'],
      oldSchool: ['{player} climbed from {old} to {ovr} in a single night. In my day, improvement took years of early mornings. I don’t trust shortcuts. I do trust a {ovr}. Mixed feelings.'],
      dataNerd: [
        '{player}: {old} → {ovr}, +{delta} in a single update. My model gave that a 0.0003% probability. My analyst asked whether we’d accidentally loaded a save file from the future.',
        'I’ve re-run the model 40 times. {player} is a {ovr}. Standard deviation is now a meaningless concept in this building. I need to lie down.',
      ],
      sentimental: ['I always believed in {player}. Now the numbers do too: {old} to {ovr} overnight. I’m having his jersey framed. Again.'],
      hotHeaded: ['{PLAYER} IS A {OVR} NOW?! FROM {OLD}?! I SPILLED MY COFFEE. GOOD SPILL. WHAT DID YOU DO?!'],
    },
  },
  anomaly_edit: {
    subj: ['About {player}’s… adjustment', 'Someone edited {player}', 'A curious change in the database'],
    body: [
      '{player} went from {old} to {ovr} overnight. I don’t know what you did in that database and I don’t want to know. I just want it to keep working.',
      'My assistant noticed {player}’s file was “last modified by {mgr}” at 2am. He is now rated {ovr}, up from {old}. I have told my assistant to stop noticing things.',
      '+{delta} for {player}, and the change log has your fingerprints all over it. Officially, this is a miracle of modern coaching. Unofficially, please don’t do it in front of the auditors.',
    ],
    trait: {
      patient: ['I preach patience, {mgr}, and you clearly found the shortcut menu. {player}: {old} → {ovr}. I’ll pretend I believe it was “hard work in scrims”.'],
      impatient: ['Finally, someone who doesn’t wait around for development curves. {player} is a {ovr}. Now open the editor again and do the rest of the roster. Today.'],
      frugal: ['You turned {player} into a {ovr} without spending a cent on transfers. I don’t understand the method and I don’t need to. This is the most cost-effective thing anyone at this club has ever done.'],
      generous: ['{player} is a {ovr} now. I suspect a few clicks were involved. Either way, dinner is on me — for the player, the staff and whoever built that database.'],
      ambitious: ['If you have editing powers, {mgr}, use them for trophies. {player} at {ovr} is a start. A championship roster is the goal.'],
      meddling: [
        'Since you can apparently edit players now, I have some notes. Can you give {player} better Baron calls? And can I have a login? Read-only. Mostly read-only.',
        'I saw {player} go from {old} to {ovr}. Next time you open that editor, call me first. I have a list of adjustments. It’s laminated.',
      ],
      superstitious: ['{player} jumped to {ovr} on the same night you were “working late in the database”. My astrologer says tampering with numbers angers the Rift spirits. I’ve lit a candle on his behalf. Just in case.'],
      publicity: ['Nobody needs to know how {player} got to {ovr}. The press release says “intense private training camp”. I’ve already approved the photos.'],
      oldSchool: ['{player}: {old} → {ovr} in one night, and the editor was open on your laptop. In my day, you earned your numbers. I find this deeply suspicious. I will also be fielding him every match.'],
      dataNerd: [
        'The change log shows a manual edit to {player} (+{delta}) at an unusual hour. My model can’t predict manual edits. Please send me the CSV so I can at least update the baseline.',
        'I’ve tagged {player}’s +{delta} in my dataset as “divine intervention (managerial)”. It ruins my regression, but I admire the confidence.',
      ],
      sentimental: ['I know what you did to {player}’s numbers, {mgr}. I’m choosing to remember it as the night he finally believed in himself.'],
      hotHeaded: ['DID YOU JUST EDIT {PLAYER}?! FROM {OLD} TO {OVR}?! …I’M NOT ANGRY. I’M IMPRESSED. DO IT AGAIN.'],
    },
  },
  anomaly_drop: {
    subj: ['Bad news about {player}', '{ovr}? {player} was a {old} yesterday', 'A worrying scouting report'],
    body: [
      'Our scouting report has {player} at {ovr}. Yesterday he was {old}. Nobody can explain it. I want answers, and I want the old {player} back.',
      '{player} dropped from {old} to {ovr} overnight. I didn’t know a player could lose that much in one night’s sleep. Please tell me this is a bug and not a career.',
      'I’m told {player} is now rated {ovr}. That’s not a dip, that’s a cliff. Please find out what happened before the fans do.',
    ],
    trait: {
      patient: ['{player} slipped from {old} to {ovr}. One bad night in the database doesn’t define a player. Give him time, support and maybe a day off.'],
      impatient: ['{player} is a {ovr} now?! I don’t have time for a rebuild. Get his level back up or find a replacement. By next week.'],
      frugal: ['We pay {player} like a {old}. He now plays like a {ovr}. I would like to discuss performance-based salaries. Today.'],
      generous: ['{player} dropped to {ovr}. Rough patch. Book him a weekend off and some extra coaching sessions — on me. We look after our own.'],
      ambitious: ['A {ovr} doesn’t win trophies. {player} was a {old} yesterday. Whatever happened, undo it, or start scouting.'],
      meddling: ['{player} fell to {ovr}. I watched his solo queue games last night and I have notes. Forty-two notes. I’ll come by tomorrow to explain them in person.'],
      superstitious: [
        '{player} is down to {ovr}. I KNEW it. Someone moved the lucky cactus off his desk yesterday. Find the culprit.',
        'My astrologer warned me about “a falling star in the house of {short}”. I thought she meant a comet. She meant {player}.',
      ],
      publicity: ['{player} dropped to {ovr}. If the press asks, he’s “experimenting with new champions”. Keep the cameras away from his scrims for a while.'],
      oldSchool: ['{player}: {old} → {ovr}. This is what happens when discipline slips. Early nights and morning drills, starting tomorrow.'],
      dataNerd: [
        '{player} fell from {old} to {ovr} in one update. My model treats that as a data-entry error. My analyst checked: it is not a data-entry error. We are both upset.',
        'A swing of {delta} points overnight for {player}. I’ve plotted his rating history. It looks like a ski slope. I don’t like skiing.',
      ],
      sentimental: ['{player} dropped to {ovr}. Numbers come and go. He’s still one of ours. Please make sure he knows the club is behind him.'],
      hotHeaded: ['{PLAYER} WENT FROM {OLD} TO {OVR}?! OVERNIGHT?! WHO DID THIS?! I WANT NAMES!'],
    },
  },
  anomaly_drop_edit: {
    subj: ['Did you just nerf {player}?', 'About {player}’s numbers', 'The change log'],
    body: [
      '{player} is down from {old} to {ovr}, and the change log says it was you. I know the devs nerf champions. I didn’t know managers nerfed their own players.',
      'Help me understand: you opened the database and made one of our own players worse? {player} is now a {ovr}. Is this some kind of challenge run?',
      'I’m not going to ask why {player}’s file was edited from {old} down to {ovr}. I’m going to ask once, politely: please don’t do it again.',
    ],
    trait: {
      patient: ['You lowered {player} to {ovr}. I assume there’s a long-term plan. I’d love to hear it. Slowly. With diagrams.'],
      impatient: ['You nerfed {player}? On purpose? We are trying to WIN, {mgr}. Undo it. Now.'],
      frugal: ['If you’re going to make {player} a {ovr}, at least edit his salary down too. We are paying {old} money for {ovr} performance.'],
      dataNerd: ['Manual edit detected: {player}, {old} → {ovr}. My model now predicts we lose more often. My model would also like to know why.'],
      superstitious: ['You lowered {player} to {ovr}? My astrologer calls it a humility ritual. I’ll allow it, but only for three series.'],
      oldSchool: ['Making life harder for yourself on purpose. Hm. {player} at {ovr}. I respect a manager who wants a challenge. I don’t respect losing.'],
      sentimental: ['{player} didn’t deserve that, {mgr}. {old} to {ovr} with a few clicks. Whatever the reason, he’s owed an apology and an explanation.'],
      hotHeaded: ['YOU NERFED {PLAYER}?! OUR OWN PLAYER?! I’M GOING FOR A WALK. A LONG ONE.'],
    },
  },
  possessed: {
    subj: ['{player} is on fire', '{player} is unstoppable', 'A {kda} KDA?!'],
    body: [
      '{player} has a {kda} KDA over his last {games} games, with {mvps} MVP awards. On paper he’s a solid squad player. On the Rift he looks like a legend. I’ll take it.',
      '{mvps} MVPs in {games} games for {player}. I checked twice. I checked his rating. Nothing has changed except that he’s suddenly unstoppable. Pure coincidence, they tell me.',
      'I don’t know what has gotten into {player}, but a {kda} KDA over {games} games is the stuff of legend. Don’t change his chair. Don’t change his keyboard. Don’t change anything.',
    ],
    trait: {
      patient: ['{player} has been on a {kda} KDA run over {games} games. Form comes and goes, so let’s not overreact. But let’s enjoy it while it’s here.'],
      impatient: ['{player} is playing like a superstar right now. {mvps} MVPs! Use him. Every game. Build every draft around him before it wears off.'],
      frugal: ['{player} is producing superstar numbers ({kda} KDA, {mvps} MVPs) on a squad-player salary. I’d like to freeze this moment in time. And his contract.'],
      generous: ['{mvps} MVPs in {games} games! {player} is getting a bonus, a nice dinner and a new chair. Possibly two chairs.'],
      ambitious: ['A {kda} KDA. This is what title-winning form looks like. Ride it all the way to the trophy.'],
      meddling: ['I’ve been studying {player}’s VODs. I believe his success comes from the warding tip I mentioned at the team dinner. I’ll send the rest of my tips to the other players.'],
      superstitious: [
        '{player} is possessed. In the good way. {kda} KDA over {games} games. I had his mouse blessed last month. Everyone laughed at me then. Nobody is laughing now.',
        'My astrologer says a friendly spirit has taken up residence in {player}’s headset. Under no circumstances is anyone to clean that headset.',
      ],
      publicity: ['{player} is the story of the season! {mvps} MVPs! I’ve booked him on two podcasts and a morning show. He’ll be fine. He’s unstoppable, after all.'],
      oldSchool: ['{player}: {kda} KDA, {mvps} MVPs. No secret trick, no shortcut, just a player in form. I approve. Tell him to keep his head down and keep working.'],
      dataNerd: [
        '{player}’s rating says he should average about a 3 KDA. He’s at {kda} over {games} games. My model calls it “statistically impolite”. My analyst calls it “a spreadsheet emergency”.',
        'I ran 10,000 simulations of {player}’s last {games} games. He wins {mvps} MVPs in eleven of them. Eleven. And yet here we are.',
      ],
      sentimental: ['{player} has worked so hard for this club, and now look at him: {mvps} MVPs in {games} games. This is the kind of story the fans remember forever.'],
      hotHeaded: ['{PLAYER}!!! {KDA} KDA!!! {MVPS} MVPS!!! I’VE WATCHED THE HIGHLIGHTS NINE TIMES. GOING FOR TEN.'],
    },
  },
  slump: {
    subj: ['About {player}’s form', '{player} is struggling', 'A {kda} KDA. Really?'],
    body: [
      '{player} is one of our best players, and over his last {games} games he’s posted a {kda} KDA. Something isn’t clicking. I trust you to find out what.',
      'A {kda} KDA over {games} games from {player}. We pay him to carry, not to be carried. Talk to him.',
      'Every star has a slump. {player}’s is lasting {games} games and counting. Let’s end it before the fans start writing songs about it.',
    ],
    trait: {
      patient: ['{player} is in a rough patch ({kda} KDA in {games} games). Great players come back. Keep backing him.'],
      impatient: ['{games} games of {player} playing like that. I don’t have the patience for slumps. Bench him or turn it around.'],
      frugal: ['{player} earns more than anyone in the building and has a {kda} KDA. Per kill, he is the most expensive player in the league.'],
      superstitious: ['{player} has had a {kda} KDA ever since someone washed his lucky jersey. I am not saying it’s connected. I am saying nobody touches the laundry again.'],
      dataNerd: ['{player}: {kda} KDA over {games} games, two full standard deviations below his career line. Either he’s cursed or my model is. Hopefully him; models are expensive.'],
      meddling: ['I watched {player}’s last {games} games frame by frame. His camera angle is wrong. I’ve drawn a diagram. Can I show him?'],
      sentimental: ['{player} has given this club so much. A slump doesn’t change that. Please tell him the owner is still his biggest fan.'],
      hotHeaded: ['{KDA} KDA?! FROM {PLAYER}?! I’VE SEEN BETTER NUMBERS IN MY OWN SOLO QUEUE GAMES. AND I’M GOLD 3.'],
    },
  },
  glow_up: {
    subj: ['{player}’s progress', 'Training is paying off', '+{delta} for {player}'],
    body: [
      '{player} has improved by {delta} points over the last {weeks} weeks. That’s what good training looks like. Well done to you and the staff.',
      'I like a player who gets better every week. {player} has done exactly that: +{delta} over {weeks} weeks. Keep it up.',
      '{weeks} weeks of work, +{delta} for {player}. Slow, steady and real. That’s the kind of growth I can explain to the board.',
    ],
    trait: {
      patient: ['+{delta} over {weeks} weeks. THIS is how it’s done. No shortcuts, just work. I’m very proud of {player}.'],
      impatient: ['+{delta} in {weeks} weeks for {player}. Good. Could it be +{delta} in half the time? Just asking.'],
      generous: ['{player} has grown +{delta} in {weeks} weeks. I’m sending a thank-you hamper to the coaching staff and a new monitor to {player}.'],
      ambitious: ['+{delta} in {weeks} weeks. Good. Keep that curve going and {player} becomes a trophy winner.'],
      oldSchool: ['{player} earned every one of those {delta} points the hard way, over {weeks} weeks. No databases, no tricks. That’s a proper footballer’s attitude. I mean esports. You know what I mean.'],
      dataNerd: ['{player}: +{delta} over {weeks} weeks, a clean upward trendline with an R² of 0.94. It is the most beautiful chart I have made this year.'],
      sentimental: ['Watching {player} grow week by week is why I love this club. +{delta} in {weeks} weeks. Our own little success story.'],
    },
  },
  money_glitch: {
    subj: ['Where did {amount} come from?', 'The bank balance', 'An unexplained deposit'],
    body: [
      'The club account went up by {amount} overnight. No sponsor, no prize money, no transfer. Just… more money. Our balance is now {balance}. Is this a glitch? Don’t answer that.',
      'My accountant called me at 6am to report {amount} that appeared in our account from nowhere. He sounded scared. I’ve told him to stop asking questions and start counting.',
      'I have run businesses for decades and I have never seen {amount} simply appear. The bank says it’s ours. If this has anything to do with the finance screen, I’ve decided I didn’t see it.',
    ],
    trait: {
      patient: ['{amount} appeared in the account overnight. I suggest we don’t spend it all at once. Or at all, until we understand where it came from.'],
      impatient: ['{amount} appeared overnight? Excellent. Spend it before it disappears. Sign someone good. This week.'],
      frugal: [
        '{amount}. Overnight. From nowhere. I’ve checked the balance eleven times this morning and it still says {balance}. I don’t trust money I didn’t save penny by penny.',
        'Nobody touches the {amount}. It goes in a safe, the safe goes in another safe, and I keep both keys.',
      ],
      generous: ['{amount} out of nowhere! The players get a bonus, the staff get a bonus, and I’m buying everyone dinner. It’s practically free.'],
      ambitious: ['{amount} from the heavens. Fine. The heavens clearly want us to win trophies. Spend it on players who win trophies.'],
      meddling: ['I’ve seen the extra {amount}. Before you spend it: I already have a shortlist of players. Seven names. I’ll bring the list round tonight.'],
      superstitious: [
        '{amount} appeared the morning after I hung a lucky horseshoe over the accounts office. My astrologer predicted “unexpected abundance”. Nobody move the horseshoe.',
        'Money from nowhere is a sign. My astrologer says we must not question it, or it leaves the way it came. So: nobody question it.',
      ],
      publicity: ['{amount} out of nowhere! Should we announce it? “Mystery Benefactor Backs {short}!” The headlines write themselves. Actually, maybe don’t mention it to anyone with a calculator.'],
      oldSchool: ['Money doesn’t just appear, {mgr}. It’s earned. And yet here is {amount} that nobody earned. I don’t like it. I’m keeping it, but I don’t like it.'],
      dataNerd: [
        'The balance jumped {amount} with no matching transaction. My analyst says the spreadsheet must be broken. We rebuilt the spreadsheet from scratch. It still says {balance}.',
        'I’ve modelled every revenue stream we have. None of them explains {amount} overnight. I’ve added a new row to the budget called “???”.',
      ],
      sentimental: ['An extra {amount}, and no explanation. I like to think the history of this club is looking after us. Let’s spend it on something that matters to the fans.'],
      hotHeaded: ['WHERE DID {AMOUNT} COME FROM?! I’M NOT ANGRY! I’M CONFUSED! IT’S A LOT OF MONEY! I LOVE IT! WHAT IS HAPPENING?!'],
    },
  },
  superteam: {
    subj: ['About our lineup', 'An average of {avg}', 'Is this even fair?'],
    body: [
      'Our starting lineup averages {avg}. I looked at the other rosters in the {league}. Ours looks like it was built with cheat codes.',
      'An average rating of {avg} across the starters. I’ve never owned a team like this. If we don’t win everything, I will have questions.',
      'Rival owners keep asking me how we assembled this roster (average {avg}). I tell them “good management”. You and I both know it’s good management plus something else.',
    ],
    trait: {
      ambitious: ['A {avg}-rated lineup. Anything less than every trophy is now a failure. I mean that.'],
      frugal: ['Average rating {avg}. I dread to think what the wage bill… wait, why is the wage bill fine? Never mind. Don’t tell me.'],
      meddling: ['A lineup averaging {avg} and you still won’t use my draft notes? Imagine how good we’d be with them.'],
      superstitious: ['Average {avg}. My astrologer says such power attracts bad luck. I’ve ordered extra lucky socks for the whole starting five.'],
      publicity: ['A {avg}-average superteam! I’m calling it “The Dream Five”. The merchandise is already printing.'],
      oldSchool: ['A lineup averaging {avg}. Talent is wonderful. Talent without discipline is a highlight reel that loses finals. Early mornings, please.'],
      dataNerd: ['Average starter rating: {avg}. My model gives us a 97% chance in every series. It has never said that before. Either it’s broken or we’re simply that good.'],
      hotHeaded: ['{AVG} AVERAGE?! WE ARE A SUPERTEAM! I WANT A PARADE BEFORE WE’VE EVEN WON ANYTHING!'],
    },
  },
  too_good: {
    subj: ['{streak} unbeaten. Is this real?', 'Still unbeaten?', 'The streak is getting suspicious'],
    body: [
      '{streak} series without a loss. I’m thrilled. I’m also starting to wonder whether this is real. Pinch me. Actually, don’t.',
      'We’re unbeaten in {streak} series. Rival owners have started asking whether we’ve found a bug. I said no. We haven’t found a bug. Have we?',
      '{streak} straight series without defeat, and our record together is now {record}. At this point a loss would feel like a glitch. Please don’t test that theory.',
    ],
    trait: {
      patient: ['{streak} unbeaten. Wonderful. I’ve waited a long time for this, so I’m in no hurry for it to end. Stay humble and keep going.'],
      impatient: ['{streak} unbeaten, good. But a streak isn’t a trophy. Streaks are nice. Trophies are nicer. Hurry up.'],
      frugal: ['{streak} series unbeaten and the players keep collecting win bonuses. I may need to renegotiate. Please lose one. No. Don’t. I’m conflicted.'],
      generous: ['{streak} unbeaten! I’ve run out of restaurants to take the team to. I’m opening a new one. It will be called “Unbeaten”.'],
      ambitious: [
        '{streak} unbeaten. Now I want an unbeaten {season}: regular season, playoffs, everything. Write that down.',
        'Unbeaten in {streak}. Good. History only remembers the ones who finish the job. Finish the job.',
      ],
      meddling: ['{streak} unbeaten. I’ll admit my draft notes haven’t been needed lately. I’ll keep sending them anyway, to be safe.'],
      superstitious: [
        '{streak} unbeaten. I haven’t washed my lucky socks since the streak began. My dry cleaner has stopped calling. It’s a sacrifice I’m willing to make.',
        'My astrologer says the stars have “never aligned like this before”. She is now asking for a percentage.',
      ],
      publicity: ['{streak} unbeaten! The media are calling us “the team that forgot how to lose”. I suggested the name. Keep giving them reasons to use it.'],
      oldSchool: ['{streak} unbeaten. Good. Now watch for complacency. Streaks end the morning people start sleeping in.'],
      dataNerd: [
        '{streak} unbeaten. My model puts the probability of this at roughly 1 in 4,000. My analyst suggested we “check the server logs for anomalies”. I’ve told him to stop being ungrateful.',
        'I’ve stopped updating the win-probability graph. It just says 100% and blinks. I’m not sure it’s supposed to blink.',
      ],
      sentimental: ['{streak} series unbeaten. I’ve followed this club for a long time and I’ve never felt like this. Thank you for giving the fans this.'],
      hotHeaded: ['{STREAK} UNBEATEN!!! IS THIS REAL?! IS THIS A DREAM?! IF THIS IS A GLITCH, NOBODY FIX IT!!!'],
    },
  },
  team_renamed: {
    subj: ['Why are we called {team}?', 'The name change', 'Who renamed my club?'],
    body: [
      'I went to bed owning {oldname} and woke up owning {team}. I don’t remember signing anything. I sign a lot of things. Did I sign something?',
      'The club is now apparently called {team}. Not {oldname}. {team}. The letterheads are wrong, the jerseys are wrong, and my business cards are very wrong. Explain.',
      'Someone renamed {oldname} to {team} overnight. The paperwork looks official. The signature looks like mine. I have questions, mainly for myself.',
    ],
    trait: {
      frugal: ['Do you know what it costs to reprint every jersey, banner and mug from {oldname} to {team}? I do. I added it up twice.'],
      meddling: ['If we were going to rename the club, I had a list. {team} wasn’t on it. Next time, ask me first.'],
      superstitious: ['A name change without consulting my astrologer?! {team} has a completely different numerology from {oldname}. She is recalculating our entire season.'],
      publicity: ['{team}! A rebrand! Nobody told me, but I love the buzz. Should I pretend it was my idea? It was my idea.'],
      oldSchool: ['{oldname} was a perfectly good name. You don’t change a name overnight. In my day, a name meant something. What does {team} mean?'],
      dataNerd: ['Brand recognition for {team} is currently 0%. {oldname} was at 61%. I’ve opened a new tab in the spreadsheet called “WHY”.'],
      sentimental: ['{oldname} was the name on the first jersey I ever bought. Now it says {team}. I’m sure there’s a reason. I’d like to hear it gently.'],
      hotHeaded: ['WHO RENAMED {OLDNAME} TO {TEAM}?! WAS IT ME?! I DON’T THINK IT WAS ME! IT MIGHT HAVE BEEN ME!'],
    },
  },
  teleport_transfer: {
    subj: ['How did {player} get here?', 'About {player}’s paperwork', 'A new face in the gaming house'],
    body: [
      '{player} was playing for {from} on Monday. Today he’s in our gaming house wearing our jersey. There’s no transfer fee, no signing ceremony, no paperwork. Just {player}.',
      'I’m happy to have {player}. I would be even happier to know how he got here from {from}. The league office would also like to know. Please have an answer that isn’t “he just appeared”.',
      'Our legal team cannot find a single document about {player}’s move from {from}. He seems to think he’s always been here. I’m starting to agree with him.',
    ],
    trait: {
      frugal: ['{player} arrived from {from} with no transfer fee. I don’t know how and I refuse to find out. Best deal of my life.'],
      ambitious: ['{player} from {from}, no fee. Excellent. Do it again with someone better.'],
      superstitious: ['{player} appeared out of thin air from {from}. My astrologer says it’s a good omen: he was “summoned”, like in the game.'],
      publicity: ['{player} from {from} is ours?! Announce it! I don’t care how! Film a welcome video before anyone asks questions.'],
      oldSchool: ['A player doesn’t just walk from {from} into our gaming house without a handshake and a signature. In my day there were forms. Many forms. I liked the forms.'],
      dataNerd: ['{player} shows up in our database with no transfer record from {from}. My model lists him as “spawned”. I checked: that is not a recognised recruitment term.'],
      sentimental: ['{player} must miss {from} a little. Make him feel at home here. However he arrived, he’s one of us now.'],
      hotHeaded: ['{PLAYER} IS HERE?! FROM {FROM}?! WITH NO PAPERWORK?! I LOVE IT AND I’M TERRIFIED!'],
    },
  },
  mystery_player: {
    subj: ['Who is {player}?', 'A new {role} player?', 'There’s a stranger on our roster'],
    body: [
      'There’s a player called {player} on our roster. He plays {role}. Nobody in the building knows who signed him. He seems nice. Who is he?',
      'I searched every scouting database for {player} and found nothing. No youth career, no solo queue history, nothing. And yet he’s listed as our {role}. Should I be worried?',
      '{player} turned up at training this morning with a contract that says {role}. My lawyers say it’s valid. My scouts say he doesn’t exist. Somebody is wrong.',
    ],
    trait: {
      frugal: ['{player} is on the payroll and I didn’t approve a salary. How much does a mystery {role} player cost? I need a number.'],
      meddling: ['I’d like to interview {player} personally. I have a 40-question form for new players. He skipped it. Nobody skips the form.'],
      superstitious: ['A mysterious {role} player named {player} appeared overnight. My astrologer says strangers bring luck. Give him a jersey and the seat next to the lucky cactus.'],
      publicity: ['A mystery {role} player! The fans will go wild for the story. Don’t reveal anything. Let them guess. Mystery sells.'],
      oldSchool: ['A {role} player nobody has heard of. Fine. Put him through the morning drills and we’ll find out what he’s made of.'],
      dataNerd: ['{player} has no data. None. A {role} player with zero history. My model divides by zero every time I open his profile.'],
      hotHeaded: ['WHO IS {PLAYER}?! WHY IS HE PLAYING {ROLE}?! WHY DOES EVERYONE ELSE SEEM CALM ABOUT THIS?!'],
    },
  },
  staff_jump: {
    subj: ['{staff} has levelled up', 'About our {staffrole}', 'What happened to {staff}?'],
    body: [
      '{staff}, our {staffrole}, is suddenly rated {delta} points higher than last week. I didn’t pay for any course. Did you?',
      'Everyone says {staff} became a genius overnight (+{delta}). I’m not complaining. I’m asking whether we need a pay rise before another club notices.',
      'Our {staffrole} {staff} left the building last night and came back this morning {delta} points better. Whatever happened, can we arrange it for the rest of the staff?',
    ],
    trait: {
      frugal: ['A +{delta} {staffrole} for the same salary. {staff} is my new favourite employee. Do not say the word “raise” anywhere near the office.'],
      generous: ['{staff} deserves recognition for that +{delta}. Dinner on me, and a proper nameplate on the office door.'],
      meddling: ['I’d like to sit in on one of {staff}’s sessions to see what changed. I’ll bring a notebook. And suggestions.'],
      superstitious: ['{staff} improved +{delta} the same week we turned the fish tank to face east. Coincidence is just luck that hasn’t been explained yet.'],
      oldSchool: ['+{delta} overnight for a {staffrole}? Experience is earned over decades, not overnight. Still, I’ll take it.'],
      dataNerd: ['{staff}’s rating jumped +{delta}. The staff model doesn’t even have a variable for that. I’ve added one. It’s called “{staff}”.'],
      hotHeaded: ['{STAFF} IS +{DELTA} NOW?! WHO IS TRAINING THE TRAINERS?! I WANT THAT PERSON TOO!'],
    },
  },
  player_birthday: {
    subj: ['Happy birthday, {player}!', '{player} turns {age}', 'Birthday at the gaming house'],
    body: [
      'It’s {player}’s birthday today — {age}! Please pass on my best wishes, and make sure there’s cake after scrims.',
      '{player} turns {age} today. I’ve signed a card. Please make sure the rest of the team signs it too, legibly.',
      'A birthday at the club: {player} is {age} today. A win this week would be the perfect present.',
    ],
    trait: {
      frugal: ['{player} turns {age}. I’ve approved one cake. Medium-sized. Candles are a separate budget line.'],
      generous: ['{player} is {age} today! The cake is on me, and so is a nice dinner for the whole team. Choose somewhere expensive.'],
      superstitious: ['{player} turns {age} today. My astrologer says his new year is ruled by Baron. Let him take the Baron calls this week.'],
      publicity: ['{player}’s birthday! Film the cake moment. Candles, singing, the works. The fans love this content.'],
      oldSchool: ['{player} is {age}. Happy birthday. Cake after training, not before. Training first.'],
      dataNerd: ['{player} turns {age}. I’ve updated his age curve in the model. The projection looks excellent. Happy birthday, I suppose.'],
      sentimental: ['{player} is {age} today. I remember the day he joined us. Time flies when you love a club. Please give him my warmest wishes.'],
      hotHeaded: ['HAPPY BIRTHDAY {PLAYER}!!! {AGE}!!! I SENT A CAKE!!! IT’S VERY BIG!!!'],
    },
  },
  games_milestone: {
    subj: ['{n} games for {player}', 'A milestone for {player}', '{player}: {n} and counting'],
    body: [
      '{player} has now played {n} games in our colours. That’s loyalty and consistency. Please pass on my congratulations.',
      '{n} games for {team}. {player} has earned a place in the club’s history books. I’ll make sure there’s a page for him.',
      '{player} reached {n} games for the club this week. Milestones like that are built one Baron call at a time.',
    ],
    trait: {
      frugal: ['{n} games for {player}. A loyal player is a player we never had to pay a transfer fee to replace. I admire that.'],
      generous: ['{n} games! {player} gets a milestone bonus and a team dinner in his honour. My treat.'],
      publicity: ['{n} games for {player}! I want a tribute video, a ceremony before the next match and a hashtag.'],
      oldSchool: ['{n} games for one club. That’s how it used to be. Players stayed. Tell him I respect that.'],
      dataNerd: ['{player}: {n} games, and I have every single one in a spreadsheet. Would he like a printed copy? It’s quite thick.'],
      sentimental: ['{n} games for {player}. I’m having a commemorative jersey made with “{n}” on the back. I may have cried a little while ordering it.'],
    },
  },
  sold_out: {
    subj: ['SOLD OUT!', 'A full house', 'Not a single empty seat'],
    body: [
      'The venue was sold out last match day. Every seat. I walked around the concourse just to hear the noise. This is what I bought a club for.',
      'A full house for {team}. The fans are {fans} and the ticket office is happy. Let’s give them a reason to come back.',
      'Sold out. My assistant had to find me a seat in the production booth. I didn’t mind. I could see everything.',
    ],
    trait: {
      frugal: ['Sold out! Ticket revenue is a beautiful thing. Please don’t spend it before it reaches the bank.'],
      generous: ['Sold out! Next match day, the first thousand fans through the door get a free scarf. On me.'],
      superstitious: ['Sold out. My astrologer says a full house brings full luck. Next time I’m buying the lucky cactus its own ticket.'],
      publicity: ['A sold-out arena! Did we get crowd shots? I want crowd shots. With me in them.'],
      dataNerd: ['100% attendance. My demand model says we could have sold 2,300 more tickets. Should we build another stand? I have a spreadsheet for that.'],
      sentimental: ['A full house. I remember when we could barely fill the front row. Look at us now.'],
      hotHeaded: ['SOLD OUT!!! THE NOISE!!! I LOST MY VOICE AND I DON’T CARE!!!'],
    },
  },
  empty_seats: {
    subj: ['Empty seats', 'The venue was {pct}% full', 'Where were the fans?'],
    body: [
      'The venue was only {pct}% full last match day. I could hear the casters from the car park. We need the fans back.',
      '{pct}% attendance. The fans are {fans}. I’d like a plan to fill those seats — results first, promotions second.',
      'I counted the empty seats from my box. I stopped counting at a number I didn’t like. {pct}% full is not good enough for {team}.',
    ],
    trait: {
      patient: ['{pct}% attendance. The fans will return when the results do. Keep building.'],
      frugal: ['{pct}% full. Every empty seat is money we didn’t earn. I’ve calculated how much. You don’t want to know.'],
      publicity: ['{pct}% full?! The broadcast showed EMPTY SEATS. On camera! Next time, the cameras point at the full sections only.'],
      dataNerd: ['Attendance at {pct}%. Correlation with recent results: 0.82. In plain words: win more, sell more.'],
      sentimental: ['Only {pct}% full. The fans who did come were wonderful. Let’s win back the ones who didn’t.'],
      hotHeaded: ['{PCT}%?! I COULD HEAR MYSELF THINK IN THERE! I DON’T WANT TO HEAR MYSELF THINK!'],
    },
  },
  ticket_hike: {
    subj: ['About the new ticket prices', 'Tickets now ${price}', 'The price rise'],
    body: [
      'I see tickets are now ${price}. I hope the product on stage is worth it. The fans will expect more for their money.',
      'Ticket prices are up to ${price}. The finance team is pleased. The fans are {fans}. Let’s keep both groups in mind.',
      '${price} a ticket. That’s a statement of confidence. Now the team has to play like a ${price} team.',
    ],
    trait: {
      frugal: ['${price} a ticket! Finally someone understands revenue. I may frame the new price list.'],
      generous: ['${price} tickets, fine. But I’m funding 200 free seats per match for students. Non-negotiable.'],
      ambitious: ['${price} a ticket. Champions charge champion prices. Now become champions.'],
      publicity: ['${price}? Premium pricing for a premium club. Make the experience match: lights, lasers, the works.'],
      dataNerd: ['${price} sits right at the peak of my demand curve. Any higher and attendance drops 11%. I’ve drawn a red line. Please respect the red line.'],
      sentimental: ['${price} for a ticket… I worry about the loyal fans who’ve been with us since the start. Let’s make sure there are still affordable seats for them.'],
      hotHeaded: ['${PRICE}?! THE FANS WILL BE FURIOUS! …Or they’ll pay. They always pay. I LOVE THE FANS!'],
    },
  },
  patch_day: {
    subj: ['Patch {patch} is out', 'Have you seen {champ}?', 'The devs buffed {champ}'],
    body: [
      'Patch {patch} just dropped and everyone says {champ} is the big winner. I trust you and the coaches are already all over it.',
      'I read the patch {patch} notes. Well, I read the headline: {champ}. What’s our plan?',
      'New patch, new meta. The devs have made {champ} very strong in {patch}. Let’s be the team that figures it out first.',
    ],
    trait: {
      impatient: ['{champ} is strong in {patch}. Every other team already knows. Why are we still practising the old meta?'],
      meddling: ['Patch {patch}: {champ} is broken. I’ve already written three drafts around {champ}. I’ll send them over. Please use at least one.'],
      superstitious: ['Patch {patch} favours {champ}. My astrologer says {champ} is aligned with our star sign this month. Pick it.'],
      publicity: ['{champ} is the champion everyone’s talking about. If we pick it on stage, the clip goes everywhere. Make it happen.'],
      oldSchool: ['Another patch. {patch}. In my day the game didn’t change every two weeks. Learn {champ}, I suppose.'],
      dataNerd: ['Patch {patch}: I’ve pulled every early game. {champ} is winning 56.4% of them. My model says first-pick it. My model is rarely wrong about patches.'],
      hotHeaded: ['{CHAMP} IS BROKEN IN {PATCH}! BAN IT OR PICK IT, BUT DO SOMETHING!'],
    },
  },
  contract_renewed: {
    subj: ['{player} stays!', 'About {player}’s extension', '{years} more year(s) of {player}'],
    body: [
      '{player} has signed a {years}-year extension. Good business, and good news for the fans.',
      'Glad to see {player} commit to {team} for another {years} year(s). Stability wins championships.',
      'The ink is dry on {player}’s {years}-year deal. Now let’s give him something to celebrate.',
    ],
    trait: {
      frugal: ['{years}-year extension for {player}. I read every clause. I hope you did too.'],
      ambitious: ['{player} locked in for {years} year(s). Good. That’s {years} more year(s) of trophy chances. Don’t waste any of them.'],
      superstitious: ['{player} signed for {years} year(s) on a Tuesday. My astrologer says Tuesday contracts are the luckiest. Excellent timing.'],
      publicity: ['{player} extended! I want a signing photo with me holding the pen. A big pen.'],
      dataNerd: ['{player}, {years}-year extension. By my projections, that deal covers his peak years. Nicely done.'],
      sentimental: ['{player} is staying with us for {years} more year(s). Loyalty like that is rare these days. It made my week.'],
      hotHeaded: ['{PLAYER} STAYS!!! {YEARS} MORE YEAR(S)!!! BEST NEWS ALL SEASON!!!'],
    },
  },
  giant_killing: {
    subj: ['We beat {oppShort}!', '{score} against the league leaders', 'Giant-killers!'],
    body: [
      'Nobody gave us a chance against {opp}. {score}. I’ve never been happier to see the experts proved wrong.',
      '{oppShort} are the best team in the {league}, and we just beat them {score}. Frame this one.',
      'Underdogs, they said. {score} against {opp}, I say. Remember this feeling, and use it.',
    ],
    trait: {
      patient: ['We beat {oppShort} {score}. This is what the long project looks like when it pays off. Keep building.'],
      generous: ['{score} vs {oppShort}! Bonuses for everyone. Dinner for everyone. Possibly a holiday for everyone. Let me calm down first.'],
      ambitious: ['We beat the league leaders, {score}. Good. Now we ARE the team to beat. Act like it.'],
      superstitious: ['{score} against {oppShort}! I wore the red socks AND brought the cactus. The double ritual. It’s unbeatable.'],
      publicity: ['{score} vs {oppShort}! Giant-killers! The clip is everywhere. Get me on a podcast before the hype fades.'],
      dataNerd: ['My model gave us almost no chance against {oppShort}. We won {score}. I’ve never been so happy to be wrong. I’m not even fixing the model.'],
      sentimental: ['Beating {opp} as underdogs… this is the kind of night the fans will talk about for years.'],
      hotHeaded: ['WE BEAT {OPPSHORT}!!! {SCORE}!!! THE TOP TEAM!!! I’M STANDING ON MY DESK!!!'],
    },
  },
  rival_anomaly: {
    subj: ['Have you seen {oppShort}’s {player}?', 'Something fishy at {oppShort}', '+{delta} overnight at {oppShort}?'],
    body: [
      '{player} at {oppShort} improved +{delta} overnight. Overnight! I want to know what they’re doing over there — and why we aren’t doing it.',
      'Rumour is {oppShort}’s {player} jumped +{delta} in a single night. Either their staff are geniuses or someone has been in the database. Keep an eye on it.',
      '{oppShort}’s owner is already bragging at the owners’ dinner about {player}’s +{delta}. Apparently it happened overnight. I hate it.',
    ],
    trait: {
      frugal: ['{oppShort} got +{delta} out of {player} without buying anyone. That’s exactly the kind of efficiency I want here.'],
      ambitious: ['If {oppShort} can find +{delta} overnight, so can we. I don’t care how. Well, I care a little. Mostly I care about winning.'],
      meddling: ['I’ve asked my contacts at {oppShort} what happened to {player}. Nobody is talking. I’ll keep digging. You keep winning.'],
      superstitious: ['{player} at {oppShort} jumped +{delta}. They must have a lucky cactus too. I want a bigger cactus.'],
      publicity: ['{oppShort}’s {player} is all over the news after a +{delta} jump. That should be OUR headline. Find me a headline.'],
      oldSchool: ['+{delta} overnight at {oppShort}. In my day, we called that cutting corners. Let them have shortcuts. We’ll have discipline.'],
      dataNerd: ['{oppShort}’s {player}: +{delta} in one update. Statistically implausible. I’ve filed it in a folder titled “Suspicious Things Other Teams Do”.'],
      hotHeaded: ['+{DELTA} OVERNIGHT FOR {PLAYER}?! AT {OPPSHORT}?! THIS IS AN OUTRAGE! I’M CALLING THE LEAGUE! I’M NOT ACTUALLY CALLING THE LEAGUE!'],
    },
  },
};

export const MORE_QUIRK_T: Record<string, { subj: string[]; body: string[]; out: Record<string, string[]> }> = {
  anomaly_probe: {
    subj: ['What do we do about {player}?', 'The {player} situation', '{player}: {old} → {ovr}. Next steps?'],
    body: [
      '{player} leapt from {old} to {ovr} overnight, and I can’t stop thinking about it. We could have the analysts dig into it, keep quiet and let it ride, show him off to the media, or lock him into a new deal before anyone else notices. What’s your call?',
      '+{delta} in a single night for {player}. One instinct says we should do something about it. My other instinct says touching it might break it. You’re the manager — how do we handle this?',
      'Everyone in the building is talking about {player}’s jump to {ovr}. I want a decision before the rumours start: investigate it, protect it, promote it or secure it. Which is it?',
    ],
    out: {
      report_good: [
        'The analytics report is in: {player}’s improvement is real. Better positioning, better decisions, better everything. I’ve had it bound in leather.',
        'Forty pages of analysis, one conclusion: {player} is simply a {ovr} now. No error, no glitch. I’ve emailed it to the whole board.',
      ],
      report_weird: [
        'The analysts finished their report on {player}. Page one says “the data says he’s a different person”. Page two is blank. The lead analyst has asked for a week off.',
        'The report concludes that {player}’s numbers were “changed by forces outside the simulation”. I’ve asked the analysts to stop reading forums at work.',
        'Our analyst compared {player} before and after. His exact words: “Same name, same chair, completely different player.” Then he closed his laptop and went for a walk.',
      ],
      jinx: [
        'Agreed. Nobody touches anything. Nobody analyses anything. Nobody even says his rating out loud.',
        'Good call. I’ve put a sign on {player}’s desk: DO NOT DISTURB THE MIRACLE.',
      ],
      cameras: [
        '{player} did the media rounds. The headline: “{old} to {ovr}: Inside the Rise of {player}”. He answered every question with “I just practise a lot.” Perfect.',
        'Three interviews, one photo shoot and a feature article. {player} looked slightly nervous, but the fans loved every minute.',
      ],
      extend: [
        'We’re opening talks with {player}’s agent today, before every other club reads the same scouting report we did.',
        'Contract talks with {player} are underway. His agent asked “why now?”. I said “no reason”. Very smooth.',
      ],
    },
  },
  windfall: {
    subj: ['About the mystery {amount}', 'What do we do with the money?', 'The {amount} question'],
    body: [
      'The mystery {amount} is still sitting in our account. The bank insists it’s ours. I’d like a decision on what to do with it: reinvest it, pay it out, or have it audited. What do you suggest?',
      'Nobody can explain the {amount}, and I’m tired of staring at it. We could put it into facilities, I could take it as a dividend (it is my club, after all), or we could bring in an auditor. Your recommendation?',
      '{amount} of unexplained money is sitting in our account, and our balance is {balance}. Do we spend it, take it, or question it?',
    ],
    out: {
      reinvest: [
        'The {amount} is going into the facilities. New monitors, new chairs, a better scrim room. If the money vanishes tomorrow, at least the chairs stay.',
        'Reinvested. The builders start Monday. I asked the contractor whether he cared where the money came from. He said “not really”. I like him.',
      ],
      dividend: [
        'Dividend received. Thank you. I’ve put it somewhere very safe and very far away from this club.',
        'I’ve taken the {amount} as a dividend. Don’t look at me like that. It’s my club. Mostly.',
      ],
      audit_clean: [
        'The auditors went through every ledger. Their conclusion: the {amount} is entirely legitimate. They couldn’t say why. They just said it was. I’ll take it.',
        'Audit complete. Nothing wrong, nothing missing, nothing explained. The money is ours. The auditor seemed more surprised than anyone.',
      ],
      audit_weird: [
        'The auditor resigned halfway through. His last note simply says “the ledger balances, but it shouldn’t”. We’re keeping the money.',
        'The audit is done. Next to the {amount} entry, the ledger just says “trust me”. The auditor has gone on a long holiday. Legally, we’re fine. I think.',
        'The auditor asked whether anyone had “been in the finance screen”. I said I don’t know what that is. He said that’s probably for the best and handed in his badge.',
      ],
    },
  },
  possessed_contract: {
    subj: ['{player}’s future', 'Strike while {player} is hot?', 'Decision time on {player}'],
    body: [
      '{player} is in the form of his life: a {kda} KDA and {mvps} MVPs. Do we reward him with a bonus and a new deal, wait to see whether it lasts, or sell him while every club wants him? What do you think?',
      'I keep getting calls about {player}. With {mvps} MVPs, his value has never been higher. Part of me wants to sign him for life. Part of me wants to cash in. What’s your plan?',
      'A {kda} KDA from a player rated like {player} doesn’t happen often. Form like this could be the new normal, or it could vanish next week. How should we play it?',
    ],
    out: {
      extend: [
        '{player} has a bonus and a new contract. He signed it in about four seconds. Let’s hope the form lasts longer than that.',
        'Done: a new deal and a bonus for {player}. If the form fades, at least he’ll be a very happy squad player.',
      ],
      wait: [
        'We wait. Sensible. Boring, but sensible. If his value doubles, I’m reminding you of this email.',
        'Waiting it is. Form is temporary, class is permanent, and contracts are expensive. I’ll keep watching.',
      ],
      shop: [
        '{player} is on the market. Three clubs called within the hour. One of them offered a fee that made my accountant sit down.',
        'We’re listening to offers for {player}. Please break it to him gently — and only after the next series.',
      ],
    },
  },
};
