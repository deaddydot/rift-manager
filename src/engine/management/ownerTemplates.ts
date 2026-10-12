// Owner content: name pools, personality traits, greetings / sign-offs and message templates.
// Placeholders in {braces}; trait-specific lines are preferred when the owner has that trait.
import type { OwnerTrait, RegionId } from '../types';
import { MORE_OWNER_T, MORE_QUIRK_T } from './ownerTemplatesMore';
import { LORE_OWNER_T, LORE_QUIRK_T } from './loreTemplates';

export const OWNER_NAMES: Record<RegionId, { first: string[]; last: string[]; eastern?: boolean }> = {
  KR: { first: ['Ji-hoon', 'Min-jun', 'Seo-yeon', 'Hyun-woo', 'Dong-hyun', 'Ji-woo', 'Sung-min', 'Eun-ji', 'Tae-yang', 'Young-ho', 'Hye-jin', 'Jae-won'], last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Shin'], eastern: true },
  CN: { first: ['Wei', 'Jun', 'Hao', 'Lei', 'Ming', 'Xin', 'Yu', 'Jing', 'Tao', 'Fang', 'Bo', 'Qiang'], last: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun'], eastern: true },
  EMEA: { first: ['Henrik', 'Sophie', 'Marco', 'Élodie', 'Lukas', 'Carlos', 'Ingrid', 'Matteo', 'Anja', 'Pierre', 'Oliver', 'Zofia'], last: ['Lindqvist', 'Moreau', 'Rossi', 'Becker', 'García', 'Nowak', 'de Vries', 'Andersen', 'Laurent', 'Novak', 'Fischer', 'Kowalski'] },
  NA: { first: ['Brad', 'Jessica', 'Chad', 'Madison', 'Tyler', 'Ashley', 'Grant', 'Kendra', 'Duke', 'Courtney', 'Logan', 'Whitney'], last: ['Whitmore', 'Sterling', 'Hollis', 'McAllister', 'Crawford', 'Vance', 'Bradshaw', 'Kingsley', 'Holloway', 'Prescott', 'Langford', 'Beaumont'] },
  BR: { first: ['João', 'Ana', 'Rafael', 'Beatriz', 'Thiago', 'Camila', 'Felipe', 'Larissa', 'Gustavo', 'Mariana'], last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Ferreira', 'Almeida', 'Ribeiro', 'Carvalho', 'Barbosa'] },
  APAC: { first: ['Minh', 'Hiroshi', 'Kenji', 'Linh', 'Arturo', 'Yuki', 'Tuan', 'Ayumi', 'Ramon', 'Mai'], last: ['Nguyen', 'Tanaka', 'Tran', 'Sato', 'Reyes', 'Pham', 'Watanabe', 'Santos', 'Le', 'Kobayashi'] },
};

export const OWNER_TITLES = ['Chairman', 'Owner & CEO', 'Founder & Owner', 'Majority Owner', 'President', 'Club Owner'];
/** [third person (profile), first person (“I …” in mail)]. */
export const OWNER_BACKGROUNDS: [string, string][] = [
  ['made a fortune in semiconductor logistics', 'made a fortune in semiconductor logistics'], ['inherited a telecom conglomerate', 'inherited a telecom conglomerate'],
  ['sold a food-delivery app for an obscene amount', 'sold a food-delivery app for an obscene amount'], ['built the biggest chain of PC bangs in the region', 'built the biggest chain of PC bangs in the region'],
  ['also owns a football club and wants a second trophy cabinet', 'also own a football club and want a second trophy cabinet'], ['runs an energy-drink empire', 'run an energy-drink empire'],
  ['is a retired pro player turned venture capitalist', 'am a retired pro player turned venture capitalist'], ['made billions in real estate', 'made billions in real estate'],
  ['co-founded a streaming platform', 'co-founded a streaming platform'], ['owns a chain of fried-chicken restaurants', 'own a chain of fried-chicken restaurants'],
  ['runs a family shipping dynasty', 'run a family shipping dynasty'], ['invented a very popular gaming chair', 'invented a very popular gaming chair'],
];

export const TRAIT_INFO: Record<OwnerTrait, { label: string; desc: string; color: string }> = {
  patient: { label: 'Patient', desc: 'Believes in long-term projects. Slow to anger.', color: '#4ade80' },
  impatient: { label: 'Impatient', desc: 'Wants results yesterday. Losing streaks hit hard.', color: '#f87171' },
  frugal: { label: 'Frugal', desc: 'Hates overspending and watches every dollar.', color: '#facc15' },
  generous: { label: 'Generous', desc: 'Rewards success with bonuses and budget raises.', color: '#22c55e' },
  ambitious: { label: 'Ambitious', desc: 'Only trophies count. Big stages matter most.', color: '#f0c674' },
  meddling: { label: 'Meddling', desc: 'Can’t resist interfering in sporting decisions.', color: '#fb923c' },
  superstitious: { label: 'Superstitious', desc: 'Lucky charms, rituals and omens.', color: '#a78bfa' },
  publicity: { label: 'Publicity-hungry', desc: 'Loves headlines, cameras and celebrities.', color: '#e879f9' },
  oldSchool: { label: 'Old-school', desc: 'Discipline, early mornings, no nonsense.', color: '#94a3b8' },
  dataNerd: { label: 'Data nerd', desc: 'Spreadsheets, models and win-probability graphs.', color: '#38bdf8' },
  sentimental: { label: 'Sentimental', desc: 'Loyal to fan favourites and club history.', color: '#f472b6' },
  hotHeaded: { label: 'Hot-headed', desc: 'Emotional reactions and ALL-CAPS emails.', color: '#ef4444' },
};

export const GREETINGS: Partial<Record<OwnerTrait, string[]>> & { any: string[] } = {
  any: ['{mgr},', 'Hello {mgr},', 'Dear {mgr},'],
  impatient: ['{mgr}.', 'Straight to the point, {mgr}:'],
  patient: ['Dear {mgr},', 'Good evening {mgr},'],
  hotHeaded: ['{MGR}!', '{mgr}!!'],
  sentimental: ['My friend,', 'Dear {mgr}, my friend,'],
  oldSchool: ['Manager {mgr},', 'Good morning {mgr} (it is 5:45am, I have been up for an hour),'],
  dataNerd: ['Hi {mgr} — quick data point:', '{mgr}, I ran the numbers.'],
  publicity: ['Hey superstar!', '{mgr}! Big news day!'],
  generous: ['{mgr}, my friend,'],
};

export const SIGNOFFS: Partial<Record<OwnerTrait, string[]>> & { any: string[] } = {
  any: ['Regards,', 'Best,', 'Talk soon,'],
  impatient: ['Don’t make me ask twice.', 'Results. That’s all.'],
  patient: ['We’re building something. Keep going.', 'Steady hands.'],
  frugal: ['And watch the receipts.', 'Every dollar counts.'],
  generous: ['Dinner’s on me next week.', 'Proud of this club.'],
  ambitious: ['Second place is the first loser.', 'Trophies. Trophies. Trophies.'],
  meddling: ['Call me after the next draft.', 'My door (and my notes) are always open.'],
  superstitious: ['Don’t change your socks.', 'Knock on wood.'],
  publicity: ['Smile for the cameras!', 'Let’s get trending.'],
  oldSchool: ['Back in my day, we didn’t have energy drinks.', 'Discipline wins.'],
  dataNerd: ['— sent from my 47-tab spreadsheet', 'The numbers never lie.'],
  sentimental: ['This club means everything to me.', 'With love for the club,'],
  hotHeaded: ['!!!', 'I’M FINE. Everything is FINE.'],
};

/** Greetings / sign-offs that only fit good news. */
export const UPBEAT = new Set(['Hey superstar!', '{mgr}! Big news day!', 'Dinner’s on me next week.', 'Proud of this club.', 'We’re building something. Keep going.', 'Smile for the cameras!', 'Let’s get trending.', 'This club means everything to me.', 'With love for the club,', 'Talk soon,']);

export interface OwnerTemplate { subj: string[]; body: string[]; trait?: Partial<Record<OwnerTrait, string[]>> }

export const OWNER_T: Record<string, OwnerTemplate> = {
  welcome: {
    subj: ['A word from your owner', 'Welcome aboard — from the owner’s office'],
    body: ['I’m {owner}, and I own {team}. I {background}. I don’t say this lightly: this club is my pride. The fans expect {expect}, and so do I.\n\nMy door is always open. My patience is not infinite.'],
    trait: {
      impatient: ['I’m {owner}. I own {team}. I {background}, and I didn’t get there by waiting. The fans expect {expect}. I expect more. Let’s not waste time.'],
      patient: ['I’m {owner}, owner of {team}. I {background}, so I know great things take time. The fans expect {expect} — we’ll get there together, step by step.'],
      superstitious: ['I’m {owner}, owner of {team}. I {background}. My astrologer says this is our year, and she has never been wrong (twice). The fans expect {expect}.'],
      dataNerd: ['I’m {owner}, owner of {team}. I {background}. My models give this roster a projected finish of {prerank} in the {league}. The fans expect {expect}. Beat the model.'],
    },
  },
  season_start: {
    subj: ['My expectations for {season}', 'A new season, {mgr}', 'Season {season}: let’s talk'],
    body: ['A new season begins. Last year is history. My expectation for {season}: {expect}. Don’t let the fans down.', 'Season {season}. The fans want {expect}. I want the same, delivered with style.'],
    trait: {
      ambitious: ['Season {season}. I didn’t buy this club to finish mid-table. I want silverware. Minimum: {expect}.'],
      patient: ['Season {season}. Whatever the table says in March, I care about where we are in September. Build it right.'],
      superstitious: ['Season {season}. I’ve had the gaming house blessed, the fish tank re-filled and the lucky cactus repotted. The rest is on you.'],
      frugal: ['Season {season}. Win, but win efficiently. I’ll be reading every invoice.'],
    },
  },
  big_win: {
    subj: ['What a result!', 'THAT is the {short} I want to see', '{score} vs {oppShort} — bravo'],
    body: ['{score} against {opp}. I watched it twice. Keep this energy.', 'Beating {oppShort} like that makes me proud to own this club.', 'My phone hasn’t stopped buzzing since the {oppShort} series. Good buzzing, for once.'],
    trait: {
      hotHeaded: ['I JUMPED OUT OF MY CHAIR. {score} VS {OPPSHORT}. INCREDIBLE.'],
      dataNerd: ['Pre-match model had us at {winpct}%. We won {score}. I love it when the model is wrong in our favour.'],
      publicity: ['We’re trending! {score} vs {oppShort} is everywhere. Keep giving them highlights.'],
      superstitious: ['I wore the red socks today. {score}. Coincidence? I think not.'],
      generous: ['{score} vs {oppShort}! Order the team the most expensive dinner in town. On me.'],
    },
  },
  bad_loss: {
    subj: ['We need to talk about {oppShort}', 'Unacceptable', 'That loss', 'A question about the {oppShort} series'],
    body: ['Losing {score} to {opp} is not what I pay for. I want to know what went wrong.', 'I expected a win against {oppShort}. I’d like an explanation by the end of the week.', 'We were favourites against {oppShort}. Favourites win. Fix it.'],
    trait: {
      patient: ['Losing to {oppShort} hurt, but one result doesn’t define us. Learn from it and move on.'],
      impatient: ['{score} vs {oppShort}. Again, we let a winnable series go. My patience is running out.'],
      hotHeaded: ['WHAT WAS THAT?! {score} AGAINST {OPPSHORT}?! I threw my remote at the TV. It was a very expensive TV.'],
      dataNerd: ['We had a {winpct}% pre-match edge and lost {score}. That’s not variance, that’s a process problem.'],
      meddling: ['I rewatched the {oppShort} draft. Why didn’t we pick what I suggested? Call me.'],
      superstitious: ['Someone moved the lucky cactus before the {oppShort} series. I want to know who.'],
    },
  },
  rival_win: {
    subj: ['We own the {rival}', 'Bragging rights!', 'Best day of the month'],
    body: ['Beating {oppShort} in the {rival} — I’ll be insufferable at the next owners’ dinner. Thank you.', 'Nothing beats beating {oppShort}. Nothing.'],
    trait: {
      hotHeaded: ['WE BEAT {OPPSHORT}!!! I called their owner. He didn’t pick up. COWARD.'],
      generous: ['We won the {rival}! The players get a feast on me tonight. Training tomorrow, though.'],
    },
  },
  rival_loss: {
    subj: ['Not them. Anyone but them.', 'The {rival}', 'Losing to {oppShort}…'],
    body: ['Of all the teams to lose to. {oppShort}’s owner already sent me a meme. I did not laugh.', 'The {rival} matters to the fans and to me. That result stings.'],
    trait: {
      hotHeaded: ['{OPPSHORT}. WE LOST TO {OPPSHORT}. I need a week off.'],
      sentimental: ['This rivalry is our history. Losing it hurts the soul of the club.'],
    },
  },
  win_streak: {
    subj: ['{streak} in a row!', 'Keep the streak alive', 'The streak'],
    body: ['{streak} straight series wins. The board is delighted. Don’t let it go to anyone’s head.', '{streak} in a row. This is what I imagined when I bought this club.'],
    trait: {
      superstitious: ['{streak} in a row. Nobody changes ANYTHING. Same seats, same snacks, same socks.'],
      dataNerd: ['{streak} consecutive wins. The probability of this by chance is low. You’re doing something right.'],
      generous: ['{streak} in a row — I’m sending the players a little something. You too.'],
      impatient: ['{streak} wins. Good. Now win the trophy.'],
    },
  },
  loss_streak: {
    subj: ['{streak} losses in a row', 'Concerned about the last {streak} series', 'What is happening?', 'This losing run'],
    body: ['That’s {streak} series lost in a row. I want a plan, not excuses.', '{streak} straight losses. The fans are restless and frankly, so am I.'],
    trait: {
      patient: ['{streak} losses in a row. I’m not panicking. But I am watching closely.'],
      impatient: ['{streak} losses in a row. I don’t do losing streaks. End it. This week.'],
      hotHeaded: ['{STREAK} LOSSES. IN. A. ROW. I can’t sleep.'],
      oldSchool: ['{streak} losses. In my day we’d have the players running laps at dawn. Maybe we still should.'],
      superstitious: ['{streak} losses. I’ve called a feng shui consultant. Do not argue.'],
    },
  },
  title: {
    subj: ['CHAMPIONS!', 'We did it!', 'A trophy for {team}'],
    body: ['Champions of the {comp}! I’ve waited for this moment. Thank you. There’s a bonus of {amount} on its way to the club account.', 'The {comp} is ours. Enjoy tonight — then let’s win the next one. I’ve authorised a {amount} bonus.'],
    trait: {
      hotHeaded: ['CHAMPIONS!!! I’M CRYING. I’M NOT CRYING. {AMOUNT} BONUS. I’M CRYING.'],
      sentimental: ['Champions of the {comp}. I thought about the first day I watched this club play. I’m so proud. {amount} bonus for the club.'],
      ambitious: ['The {comp} is ours. Good. That’s one. I want them all. Here’s {amount} to make it happen.'],
      frugal: ['Champions of the {comp}. I don’t say this often: here’s a {amount} bonus. Don’t get used to it.'],
      publicity: ['CHAMPIONS! We’re on every front page! Book the parade. Here’s {amount}. And get me on the trophy photo.'],
    },
  },
  final_loss: {
    subj: ['So close', 'The final', 'Runners-up'],
    body: ['Runners-up in the {comp}. A good run, but finals are for winning. We go again.', 'One series away. It hurts. Learn from it and come back stronger.'],
    trait: {
      ambitious: ['Second place in the {comp}. Nobody remembers second place. Remember that.'],
      patient: ['A final in the {comp}. It stings, but I like where this project is going.'],
      hotHeaded: ['SO CLOSE. I broke a vase. Next time we win it.'],
    },
  },
  elim: {
    subj: ['Our {comp} is over', 'Eliminated', 'A disappointing end'],
    body: ['Out of the {comp} — {place}. I expected more. Let’s review everything.', 'Eliminated from the {comp} ({place}). The fans deserved better.'],
    trait: {
      patient: ['Eliminated from the {comp} ({place}). Painful, but I see what you’re building. Keep going.'],
      impatient: ['Out of the {comp}. {place}. This cannot become a habit.'],
      dataNerd: ['Eliminated ({place}). I’ve prepared a 30-slide post-mortem. You’ll find it on your desk.'],
      sentimental: ['Out of the {comp}. Please thank the players for me. They gave everything.'],
    },
  },
  qualify_intl: {
    subj: ['We’re going to {event}!', 'International qualification!', '{event}!'],
    body: ['We qualified for {event}. This is why I own a club. Make our region proud.', '{event}! The sponsors are calling already. Go win it.'],
    trait: {
      publicity: ['{event}! Book the cameras, the documentary crew and the private jet. I want the world to see us.'],
      generous: ['{event}! I’m upgrading the team’s flights to business class. And there’s {amount} for preparation.'],
      ambitious: ['{event}. Qualifying is not the goal. Winning is.'],
    },
  },
  playoffs: {
    subj: ['Playoffs!', 'Into the {comp}', 'Now it gets serious'],
    body: ['We’re in the {comp}. Regular season done, now the part that matters.', 'Playoffs. Everything we’ve done comes down to these series.'],
    trait: {
      superstitious: ['Playoffs! I’ve booked the same hotel rooms as last time we won something.'],
      impatient: ['Playoffs. Good. Anything less than a final is a disappointment.'],
    },
  },
  monthly_good: {
    subj: ['Monthly review: excellent', 'A very good month', '{month} in review'],
    body: ['{month} in numbers: {record} in series, fans are {fans}, finances {net}. Superb work.', 'A month like {month} ({record}) makes my job easy. Keep it up.'],
    trait: {
      dataNerd: ['{month}: {record}, net {net}, fan sentiment {fans}. Every KPI is green. I made a chart. It goes up.'],
      generous: ['{month} was excellent ({record}). Keep this up and there’s more budget where that came from.'],
      frugal: ['{month}: {record} and net {net}. Results AND discipline. My favourite combination.'],
    },
  },
  monthly_bad: {
    subj: ['Monthly review: concerning', '{month} was not good enough', 'We need to talk about {month}'],
    body: ['{month}: {record} in series, fans are {fans}, finances {net}. That’s not acceptable.', 'I’ve looked at {month} ({record}). I need to see a reaction.'],
    trait: {
      patient: ['{month} was difficult ({record}). I’m not changing course — but I need to see progress.'],
      impatient: ['{month}: {record}. One more month like that and I start making calls.'],
      dataNerd: ['{month}: {record}. Every trendline is pointing the wrong way. Attached: 12 trendlines.'],
      frugal: ['{month}: {record} and we lost {net}. Losing games AND money? Pick one. Preferably neither.'],
    },
  },
  monthly_meh: {
    subj: ['Monthly check-in', '{month} review'],
    body: ['{month}: {record}. Fine. Not great, not terrible. I want great.', 'A steady {month} ({record}). Steady doesn’t win trophies.'],
    trait: {
      patient: ['{month}: {record}. Steady progress. That’s all I ask.'],
    },
  },
  raise: {
    subj: ['Budget raise approved', 'You’ve earned it', 'More resources'],
    body: ['Given the results, I’m injecting {amount} into the club. Spend it wisely.', 'Good work deserves backing. {amount} is on its way to the club account.'],
    trait: {
      generous: ['I believe in this project. {amount} for the club — and more if we keep winning.'],
      frugal: ['Against every instinct I have, I’m approving {amount}. I expect receipts.'],
    },
  },
  finance_negative: {
    subj: ['The bank called', 'We are in the red', 'Finances'],
    body: ['The club balance is {balance}. That is a negative number. Negative numbers make me nervous.', 'We’re {balance} in the red. I want a plan to fix the finances.'],
    trait: {
      frugal: ['{balance}. NEGATIVE. Do you know how many energy drinks that is? I’ve calculated it. It’s a lot.'],
      generous: ['We’re at {balance}. I don’t mind spending, but I mind spending without results.'],
      hotHeaded: ['{BALANCE}?!?! WHO SPENT MY MONEY?!'],
    },
  },
  finance_profit: {
    subj: ['Healthy books', 'A profitable month', 'The accountant smiled'],
    body: ['Net {net} last month. The accountant smiled for the first time in years.', 'Profit of {net}. Nice to see the club pay its own way.'],
    trait: {
      frugal: ['Net {net}. Beautiful. Framing the spreadsheet.'],
      ambitious: ['Net {net}. Good — now reinvest it in trophies.'],
    },
  },
  wage_bill: {
    subj: ['About the wage bill', 'Payroll'],
    body: ['Payroll is now {amount} a year. That’s a lot of zeros. They’d better be worth it.', 'The wage bill jumped to {amount}. I hope the results jump too.'],
    trait: { frugal: ['Payroll: {amount}/year. I had to sit down. Then lie down.'], generous: ['{amount} a year in wages. Fine, if that’s what winning costs.'] },
  },
  fans_angry: {
    subj: ['The fans are angry', 'Have you seen social media?', 'Fan unrest'],
    body: ['Fan sentiment is “{fans}”. People are posting hashtags I won’t repeat. Turn this around.', 'The fans are furious, and when they’re furious the sponsors get nervous.'],
    trait: {
      publicity: ['We’re trending for the WRONG reasons. I can’t open my phone. Fix the vibes.'],
      sentimental: ['The fans are hurting. They’re the heart of this club. Give them something to believe in.'],
      patient: ['The fans are upset. They’ll come around if we keep building. But let’s give them a win soon.'],
    },
  },
  fans_happy: {
    subj: ['The fans love us', 'Good vibes', 'Social media is on fire (good fire)'],
    body: ['Fan sentiment is “{fans}”. Merch is flying, tickets are selling. This is what I wanted.', 'The fans are buzzing. Keep giving them reasons.'],
    trait: { publicity: ['We’re trending for the RIGHT reasons! I’ve retweeted everything. Even the memes.'] },
  },
  sponsor_new: {
    subj: ['New sponsor: {sponsor}', 'About the {sponsor} deal'],
    body: ['The {sponsor} deal is signed. Good business.', '{sponsor} on the jersey. Fine by me as long as the cheques clear.'],
    trait: {
      publicity: ['{sponsor}! I’ve already arranged a photo shoot. Wear something nice.'],
      oldSchool: ['{sponsor}… In my day, sponsors made things you could hold. Anyway. Fine.'],
      frugal: ['{sponsor} money. Lovely. Put it in the bank, not in a new chair.'],
    },
  },
  star_signed: {
    subj: ['{player}!', 'About the {player} signing', 'A statement signing'],
    body: ['Signing {player} sends a message to the whole league. Now make it pay off.', '{player} in our colours. I like it. The wage, less so.'],
    trait: {
      ambitious: ['{player}! That’s the kind of name that wins trophies. More of this.'],
      frugal: ['{player} is great. {player}’s salary is… also great. Too great. Make it worth it.'],
      publicity: ['{player}! I want a welcome video, a press conference and a billboard downtown.'],
    },
  },
  fanfav_sold: {
    subj: ['Why did {player} leave?', 'About {player}', '{player}'],
    body: ['Letting {player} go was a big decision. I hope you know what you’re doing — the fans are not happy.', '{player} was a fan favourite. Explain to me why he’s gone.'],
    trait: {
      sentimental: ['{player} was part of our history. I had his jersey framed in my office. I’m very disappointed.'],
      frugal: ['{player} gone and his wages off the books. Painful for the fans, but the numbers work.'],
    },
  },
  facility: {
    subj: ['The new {facility}', 'About the {facility} upgrade'],
    body: ['I saw the {facility} upgrade. Investment in the future — I approve.', 'The {facility} looks great. Now let’s see the results.'],
    trait: {
      dataNerd: ['The {facility} upgrade: I estimate a 3.2% improvement in something. Good call.'],
      frugal: ['The {facility} upgrade cost HOW much? It had better be gold-plated.'],
      oldSchool: ['A fancy {facility}. In my day we trained in a basement and liked it.'],
    },
  },
  coach_new: {
    subj: ['Our new head coach', 'Welcome {coach}'],
    body: ['{coach} is the new head coach. I trust your judgement — for now.', 'New coach, new chapter. I want to see {coach}’s ideas on stage quickly.'],
    trait: { meddling: ['{coach} is in. I’ve sent him my draft notes. All 60 pages.'] },
  },
  milestone: {
    subj: ['{n} series wins', 'A milestone'],
    body: ['That’s {n} series wins under your management ({record}). Not bad at all.', '{n} series wins with you in charge. Here’s to the next {n}.'],
    trait: { sentimental: ['{n} series wins together. I remember your first day. Look at us now.'] },
  },
  anniversary: {
    subj: ['{years} year(s) together', 'Happy anniversary!'],
    body: ['{years} year(s) ago today you took charge of {team}. Record since: {record}. Here’s to many more.', 'It’s been {years} year(s). {record} in series. I don’t regret hiring you. Mostly.'],
    trait: { hotHeaded: ['{years} YEAR(S)! We’ve had our moments. I only threw one chair. Happy anniversary!'], generous: ['{years} year(s) together! I’ve sent you a bottle of something expensive.'] },
  },
  new_year: {
    subj: ['Happy New Year!', 'New year, new trophies'],
    body: ['Happy New Year to you and the team. Let’s make it a year to remember.', 'A new year. I have exactly one resolution: trophies.'],
    trait: { superstitious: ['Happy New Year! My astrologer says {season} is the Year of the Baron Steal. Prepare accordingly.'], generous: ['Happy New Year! I’ve sent gift baskets to every player.'] },
  },
  lunar_new_year: {
    subj: ['Happy Lunar New Year!', 'Lunar New Year wishes'],
    body: ['Happy Lunar New Year! Red envelopes are on the way to the players.', 'Wishing the whole team luck and prosperity this Lunar New Year.'],
    trait: { superstitious: ['Happy Lunar New Year! I’ve hung lanterns in the gaming house. Do NOT take them down.'] },
  },
  xmas: {
    subj: ['Season’s greetings', 'Happy holidays'],
    body: ['Happy holidays to you and the team. Rest well — we go again soon.', 'Merry Christmas! Thank you for a year of hard work.'],
    trait: { generous: ['Happy holidays! Every player gets a bonus — and a very large hamper.'], frugal: ['Happy holidays. I’ve sent everyone a card. A nice card. It has glitter.'] },
  },
  halloween: {
    subj: ['Happy Halloween', 'Spooky season'],
    body: ['Happy Halloween! The scariest thing I saw this year was our early game in spring.', 'Happy Halloween. Remember: the only thing we fear is a 0-2 Baron throw.'],
    trait: { superstitious: ['Halloween. I’ve hung garlic over the scrim room door. It stays until Worlds.'] },
  },
  birthday: {
    subj: ['It’s my birthday', 'Another year older'],
    body: ['It’s my birthday today. The best present would be a win this week. Hint, hint.', 'Another year older. The only gift I want is three points. Or a trophy. A trophy is fine too.'],
  },
  ultimatum_1: {
    subj: ['We need to talk', 'I’m worried', 'Concerns'],
    body: ['I’ll be honest: confidence in the project is slipping. I need to see a reaction, soon.', 'Results, fans, the mood around the club — none of it is where it should be. Consider this a friendly warning.'],
    trait: { patient: ['I don’t like writing this. I’m still behind you, but the board is restless. Give me something to work with.'], hotHeaded: ['THIS IS A WARNING. A FRIENDLY ONE. FOR NOW.'] },
  },
  ultimatum_3: {
    subj: ['Final warning', 'Last chance'],
    body: ['You didn’t deliver. This is your final warning: {promise} by {deadline}, or I will have to consider other options.', 'I’ve defended you to the board for long enough. {promise} by {deadline}. No more excuses.'],
    trait: { sentimental: ['This hurts me to write. But I owe it to the club: {promise} by {deadline}. Please.'] },
  },
  last_straw: {
    subj: ['I’m out of patience', 'Interviews'],
    body: ['You missed the target again. I’ve started taking calls from other managers. I haven’t made a decision. Yet.', 'The board met without you today. That’s all I’ll say. Turn this around.'],
  },
  reprieve: {
    subj: ['Reprieve', 'Back on track', 'Well done'],
    body: ['Things are looking up. Consider the warnings withdrawn. Keep it going.', 'You turned it around. I knew you could. Mostly.'],
    trait: { hotHeaded: ['I TAKE BACK EVERYTHING I SAID. (Not everything. Most things.)'] },
  },
  promise_kept: {
    subj: ['A promise kept', 'You delivered'],
    body: ['You promised: {promise}. You delivered. That’s how you build trust.', '{promise} — done. I like managers who keep their word.'],
  },
  promise_broken: {
    subj: ['A promise broken', 'You gave me your word'],
    body: ['You promised: {promise}. It didn’t happen. I’ll remember that.', '{promise}. That was the deal. The deal is broken.'],
    trait: { patient: ['We agreed: {promise}. It didn’t happen. Disappointing, but I value honesty over excuses. Next time.'], hotHeaded: ['YOU PROMISED. {PROMISE}. AND?!'] },
  },
  wager_won: {
    subj: ['I won the bet!', 'Pay up, {rivalOwner}!'],
    body: ['We beat {oppShort}, which means {rivalOwner} owes me {stake}. Thank you. Bonus for the players.', 'WE WON THE BET. {rivalOwner} has to deliver {stake}. Best week ever.'],
  },
  wager_lost: {
    subj: ['I lost the bet', 'About that bet…'],
    body: ['We lost to {oppShort}. I now owe {rivalOwner} {stake}. I will be reminding you of this.', 'Thanks to that {oppShort} result I must hand over {stake} to {rivalOwner}. Humiliating.'],
  },
  wager: {
    subj: ['A friendly wager', 'I made a bet', 'About our next match'],
    body: ['I bumped into {rivalOwner}, who owns {opp}, at a charity gala. Words were exchanged. We now have a friendly wager on our next match: the loser owes the winner {stake}. Win this one for me.', '{rivalOwner} from {oppShort} said our roster is “cute”. So I bet {stake} that we beat them next time. No pressure.'],
    trait: { hotHeaded: ['{rivalOwner} CALLED OUR TEAM “MID”. I bet {stake} we beat {oppShort}. WIN. THIS. GAME.'], superstitious: ['I bet {rivalOwner} {stake} on the {oppShort} match. My tarot cards say it’s a lock. Don’t prove the cards wrong.'] },
  },
  ritual_good: {
    subj: ['The ritual WORKS', 'I told you so'],
    body: ['{wins} wins from 3 series since we started the ritual. Coincidence? There are no coincidences.', 'The spirits have spoken: {wins} wins from 3. We are keeping the ritual. Forever.'],
  },
  ritual_bad: {
    subj: ['About the ritual…', 'The spirits are displeased'],
    body: ['Only {wins} win(s) from 3 series. Clearly somebody performed the ritual incorrectly. I have my suspicions.', '{wins} win(s) in 3. My fortune teller says the ritual was “misaligned”. She is recalibrating.'],
  },
  ignored: {
    subj: ['You ignored me', 'No reply?'],
    body: ['I asked you a question about {topic} and heard nothing back. I decided myself.', 'Silence is also an answer, {mgr}. I went ahead on {topic} without you.'],
  },
};

/** Quirky requests that offer choices. Options are defined in owner.ts; outcomes keyed by option id. */
export const QUIRK_T: Record<string, { subj: string[]; body: string[]; out: Record<string, string[]> }> = {
  nephew: {
    subj: ['A small favour', 'My nephew', 'Trial request'],
    body: ['My nephew {nephew} is {rank} in solo queue (his words: “basically Challenger”). He’d love a trial week with the team. It would mean a lot to my sister. And to me.'],
    out: {
      trial: ['{nephew} went 0/9 in his first scrim, then 1/7, then cried a bit. My sister is thrilled. Thank you.', '{nephew} had the time of his life. The players were very kind. He now says he “taught them wave management”.'],
      ambassador: ['{nephew} is our new Community Ambassador. He has a lanyard. He’s never been happier.'],
      decline: ['I see. My sister will not be inviting me for dinner. Thanks for that.', 'Fine. {nephew} says your loss. I say the same.'],
    },
  },
  streamer: {
    subj: ['A BIG idea', 'Celebrity signing?', 'Content opportunity'],
    body: ['Have you heard of {streamer}? {followers} followers! I want them in a {short} jersey as a content creator. Imagine the views. It’ll cost about {cost}, but think of the exposure.'],
    out: {
      sign: ['{streamer} is officially part of the {short} family! The announcement video has more views than our last final.'],
      collab: ['The one-off {streamer} stream did numbers. Not life-changing numbers, but numbers.'],
      decline: ['You’re missing the future of esports. I’ll forward you the analytics. Again.'],
    },
  },
  jersey: {
    subj: ['New jersey concept', 'I designed something', 'Kit redesign'],
    body: ['I’ve had an idea for next season’s jersey: {design}. Production would cost around {cost}. I think it’s iconic. Tell me it’s iconic.'],
    out: {
      approve: ['The {design} jersey is in production. The fans are… talking about it. That’s good, right?'],
      vote_classic: ['The fans voted for the classic design. Democracy is overrated.'],
      vote_chaos: ['THE FANS CHOSE MY DESIGN. I knew they had taste.'],
      veto: ['Vetoed. You have no vision. But fine.'],
    },
  },
  visit: {
    subj: ['I’m coming to the gaming house', 'Visit this week', 'Can I sit in on scrims?'],
    body: ['I’d like to drop by the gaming house this week and sit in on scrims. Just to observe. I won’t say a word. (I might say a few words.)'],
    out: {
      scrims: ['Great visit! I only unplugged one keyboard by accident. The support says it was “mid-teamfight”. Details.', 'I sat in on scrims. I gave a short motivational speech. Forty minutes is short.'],
      dinner: ['Lovely team dinner. The jungler eats more than I expected. Good to see the boys relaxed.'],
      busy: ['Too busy for the owner? Noted.'],
    },
  },
  tweet: {
    subj: ['About my post…', 'Did you see what I posted?', 'Small social media situation'],
    body: ['Last night I posted: “{tweet}”. It has 40,000 replies. My assistant says that’s bad. What do we do?'],
    out: {
      delete: ['Deleted. I’ve been told to “touch grass”. I touched a very expensive lawn.'],
      meme: ['We printed it on T-shirts. They sold out in an hour. I am a marketing genius.'],
      statement: ['The PR team issued a statement. Nobody read it. Crisis averted, I suppose.'],
    },
  },
  rename: {
    subj: ['A bold idea: rebranding', 'New name, new era', 'I’ve been thinking about our name'],
    body: ['I want to rebrand the club as “{newName}”. Fresh, modern, unforgettable. My marketing guru loves it. He charges a lot, so he must be right.'],
    out: {
      accept: ['We are now {newName}! The fans are… passionate about it. Passion is good!'],
      vote_keep: ['The fans voted to keep the name. 91% of them. My guru says the other 9% are “the real fans”.'],
      vote_change: ['The fans voted for {newName}! History is made.'],
      refuse: ['You’re refusing? On MY club? …Fine. But I’m keeping the business cards.'],
    },
  },
  rename_back: {
    subj: ['About the name…', 'Maybe the old name was fine'],
    body: ['The fans really don’t like “{newName}”. My guru has stopped answering my calls. Should we go back to {oldName}?'],
    out: {
      revert: ['We’re {oldName} again. Let us never speak of this.'],
      keep: ['We keep {newName}. Bold. I like bold.'],
    },
  },
  fire_coach: {
    subj: ['About the coach', 'I think it’s time', 'A change at the top?'],
    body: ['After these results I think {coach} has to go. The fans are calling for it, and frankly so am I. Your call — but I want an answer.'],
    out: {
      fire: ['{coach} has been released. A fresh voice will help. Find someone good.'],
      back: ['You’re backing {coach}. Okay. It’s on both of you now.'],
      review: ['Fine: {coach} gets three more series. Two wins, or we revisit this.'],
    },
  },
  star_wish: {
    subj: ['Get me {star}', 'A dream signing', 'I want {star}'],
    body: ['I watched {star} play last night. I want {star} in our jersey. Can you make it happen before the window closes?'],
    out: {
      try: ['That’s what I like to hear. Don’t disappoint me.'],
      realistic: ['Not realistic? Everything is realistic with enough money. …Fine. I’ll drop it. For now.'],
    },
  },
  injection: {
    subj: ['I want to invest', 'Reward for great work', 'An offer you can’t refuse'],
    body: ['The club is flying. I want to put {amount} of my own money behind you. How would you like it?'],
    out: {
      cash: ['{amount} is in the transfer budget. Go get someone good.'],
      facility: ['The {facility} upgrade is on me. Contractors arrive Monday.'],
      bonus: ['Player bonus pool approved. The players are smiling. Even the jungler.'],
    },
  },
  cost_cuts: {
    subj: ['We need to cut costs', 'Money problems', 'The budget situation'],
    body: ['The balance is {balance}. I’m not running a charity. What’s your plan?'],
    out: {
      promise: ['Good. Positive balance in 60 days. I’ll be counting.'],
      injection: ['Fine. {amount} from my pocket. This is a loan of trust, not a gift.'],
      cut: ['Snacks downgraded, taxis replaced with buses. The players are grumbling. The accountant is singing.'],
    },
  },
  superstition: {
    subj: ['Very important instructions', 'A ritual', 'My fortune teller called'],
    body: ['My fortune teller was very clear: {ritual}. For the next three series. Please humour me. It costs almost nothing.'],
    out: {
      humor: ['Thank you. The spirits are pleased. I am pleased.'],
      ignore: ['Ignoring the spirits. Bold. Don’t come crying to me.'],
    },
  },
  documentary: {
    subj: ['Documentary proposal', 'Lights, camera, {short}!', 'A streaming platform called'],
    body: ['A streaming platform wants to film an all-access documentary about {team} this season. They’d pay {amount}. Cameras in the gaming house, in the draft room, everywhere.'],
    out: {
      accept: ['The documentary crew moves in Monday. The working title is “{short}: Unbreakable”. No pressure.'],
      limited: ['Limited access agreed. They get match days, not the gaming house. Smaller cheque, fewer cameras.'],
      decline: ['No documentary. Do you know how many people want to see me on screen? Many. Many people.'],
    },
  },
  spreadsheet: {
    subj: ['My model', 'I built something', 'Data-driven drafting'],
    body: ['I built a draft model over the weekend. It says {champ} is criminally underrated this patch (expected win rate +{edge}%). Will you use it?'],
    out: {
      adopt: ['You’re using the model! I’ve added three more tabs.'],
      thank: ['“Thanks, I’ll take a look.” I know what that means. Fine.'],
      counter_good: ['Your counter-model is… actually better than mine. I respect that. I hate it, but I respect it.'],
      counter_bad: ['Your model has a circular reference in cell F17. Amateur.'],
    },
  },
  bootcamp: {
    subj: ['Discipline', 'A proper bootcamp', 'Back to basics'],
    body: ['The players are soft. I want 6am wake-ups, cold showers and a week at a mountain bootcamp. No energy drinks. That’s how champions are made.'],
    out: {
      approve: ['Mountain bootcamp booked. The mid laner asked if there’s Wi-Fi. There is not.'],
      compromise: ['Morning runs, but keep the energy drinks. Compromise. I hate compromise.'],
      decline: ['Soft. Everybody is so soft these days.'],
    },
  },
  party: {
    subj: ['You’re invited', 'My birthday party', 'Saturday night'],
    body: ['I’m throwing a birthday party on Saturday and I expect the whole team to be there. Formal dress. There will be a string quartet and a very large cake.'],
    out: {
      attend: ['What a party! The support sang karaoke. I’ll never forget it. Neither will he.'],
      video: ['The birthday video from the players made me cry. Don’t tell anyone.'],
      card: ['A card. Lovely. Very… efficient.'],
    },
  },
  nft: {
    subj: ['Digital collectibles!', 'A revenue idea', 'Web3, but tasteful'],
    body: ['A partner wants to launch limited-edition digital collectibles of our players. They’d pay us {amount}. Everybody is doing it. Well, everybody was.'],
    out: {
      accept: ['Collectibles launched! Revenue: good. Fan reaction: let’s not look.'],
      decline: ['No collectibles. The partner says we’re “stuck in Web2”. I’ll live.'],
    },
  },
  mascot: {
    subj: ['We need a mascot', 'Meet our new mascot?', 'Mascot proposal'],
    body: ['Every great club has a mascot. I propose {mascot}. It costs about {cost}. Tell me you love it.'],
    out: {
      approve: ['{mascot} has arrived. The fans adore it. The players are slightly afraid of it.'],
      decline: ['No mascot. {mascot} will be very sad. I will be sadder.'],
    },
  },
  duel: {
    subj: ['1v1 me', 'A challenge', 'Solo queue showdown'],
    body: ['I’ve been grinding solo queue (Gold 3, thank you very much). I challenge you to a 1v1 on stream. Mid lane, first blood wins.'],
    out: {
      letwin: ['I WON! Against a professional manager! I’ve had the clip framed.'],
      crush_good: ['You destroyed me. In 47 seconds. Honestly? Respect.'],
      crush_bad: ['You destroyed me in 47 seconds. On stream. I’m not talking to you for a while.'],
      decline: ['Scared? I understand. Gold 3 is a scary rank.'],
    },
  },
  charity: {
    subj: ['Charity stream', 'Giving back', 'A good cause'],
    body: ['I’d like the team to host a 12-hour charity stream for the local children’s hospital. Good for the soul, good for the brand.'],
    out: {
      yes: ['The charity stream raised a fortune. I’m so proud of this club.'],
      no: ['Too busy for charity. I’ll make a donation myself, but the fans noticed.'],
    },
  },
  promise_results: {
    subj: ['What can you promise me?', 'I need a commitment', 'Promises'],
    body: ['Results have not been good enough. Tell me what you can promise. I will hold you to it.'],
    out: {
      win3: ['Three wins in the next four series. I’m writing it down.'],
      playoffs: ['Playoffs it is. Don’t make me remind you.'],
      none: ['No promises. Honest, at least. Not very reassuring.'],
    },
  },
  guarantee: {
    subj: ['Press conference tomorrow', 'Guarantee the win?', 'A statement to the media'],
    body: ['We play {opp} next. The media want a quote. I want you to publicly GUARANTEE a win. Confidence sells tickets.'],
    out: {
      guarantee: ['“We will beat {oppShort}.” It’s on every website. No pressure.'],
      humble: ['A humble answer. Very professional. Very boring.'],
    },
  },
  pet: {
    subj: ['A new staff member', 'Chief Morale Officer', 'Meet {mascot}'],
    body: ['My dog {mascot} is wonderful with people. I’d like {mascot} to spend match weeks at the gaming house as “Chief Morale Officer”. Proven stress relief.'],
    out: {
      approve: ['{mascot} has started work. Productivity: unclear. Happiness: through the roof.'],
      decline: ['{mascot} is heartbroken. So am I.'],
    },
  },
  jet: {
    subj: ['Travel plans for {event}', 'The jet'],
    body: ['For {event} I’d like to fly the team in my private jet. It has a sauna. The players will arrive refreshed.'],
    out: {
      jet: ['Jet booked. The sauna is warmed up. The ADC is already asking for a second sauna.'],
      commercial: ['Commercial flights. With the fans. How… humble.'],
    },
  },
  ultimatum: {
    subj: ['Ultimatum', 'This is serious', 'I need results'],
    body: ['I’ll be blunt. Confidence in this project is at an all-time low. I need results — now. What will it be?'],
    out: {
      accept: ['Three wins from the next five series. That’s the deal.'],
      time: ['Four wins from the next seven. More time, higher bar. Don’t waste it.'],
    },
  },
};

export const NEPHEW_NAMES = ['xXDarkBaronXx', 'Lil{last}', 'TheChosenOne777', 'NoScopeKing', '{last}Jr_Gaming', 'FakerButBetter', 'BigBrainPlays', 'MidOrFeed2009'];
export const NEPHEW_RANKS = ['Gold 2', 'Platinum 4', 'Diamond 2', 'Emerald 3', 'Silver 1 (“smurfing”)', 'Diamond 4'];
export const STREAMERS = ['PogChampion', 'xQueenie', 'BaronBoss', 'NightOwlNina', 'TheLoudGuy', 'CozyCarry', 'Midnight_Maddie', 'KaiTheTitan', 'DrDisrespectful', 'GrandmaGamer'];
export const DESIGNS = ['neon lime with a giant portrait of me on the back', 'gold chrome, everywhere', 'a dragon wearing sunglasses', 'tuxedo print (formal on the Rift)', 'camouflage, so the enemy can’t see us', 'a QR code that links to my podcast', 'tie-dye “for the vibes”', 'pinstripes like a 1920s gangster'];
export const TWEETS = ['we are 100% winning Worlds this year, screenshot this', 'honestly our jungler could beat anyone in a 1v1 including me', 'just had lunch with a very famous player… can’t say who… but stay tuned 👀', 'ranking my players from favourite to least favourite (thread)', 'if we lose this weekend I’m shaving my head', 'is Baron the purple worm or the dragon? asking for a friend', 'the referee was clearly biased (there are no referees in League, I have been informed)'];
export const RENAMES = ['{short} Hyper Dragons', '{last} Esports', 'Team Synergy {short}', '{short} Galaxy Titans', 'The {last} Collective', '{short} Infinity', 'Royal {short} Elite'];
export const RITUALS = ['the support must walk on stage first', 'nobody wears green on match days', 'the team eats only white rice before series', 'the head coach must carry a jade turtle in his pocket', 'the gaming house fish tank must be facing east', 'everyone taps the lucky cactus before leaving the house', 'the mid laner must put his left sock on first'];
export const MASCOTS = ['a three-metre inflatable Poro named Sir Pushalot', 'a person in a dragon costume called Smaug-ly', 'a golden retriever named Baron', 'an animatronic minion called Cannon', 'a giant foam crab named Scuttle'];
export const PETS = ['Biscuit', 'Captain Waffles', 'Mochi', 'Duke', 'Peanut', 'Noodle'];
export const WAGER_STAKES = ['a very expensive dinner', 'his yacht for a weekend', 'wearing the winner’s jersey at the next owners’ meeting', 'a donation to the winner’s favourite charity', 'his vintage sports car (for one afternoon)'];
export const PS_LINES: Partial<Record<OwnerTrait, string[]>> = {
  superstitious: ['PS: Don’t wash the lucky jersey.', 'PS: My astrologer says Thursdays are bad for Baron calls.'],
  meddling: ['PS: I watched the VOD. We need to talk about the jungle pathing.', 'PS: Have you considered playing my favourite champion? Just a thought.', 'PS: I have some thoughts on the draft. Call me.'],
  dataNerd: ['PS: I’ve attached a spreadsheet. 47 tabs.', 'PS: Our dragon control is 3.4% below expected. Just saying.'],
  publicity: ['PS: Can I get a cameo in the next team vlog?', 'PS: I was on TV again. Did you see?'],
  oldSchool: ['PS: Lights out at 10pm. For everyone.', 'PS: Mobile phones are not allowed at dinner. I’m serious.'],
  frugal: ['PS: Who ordered 300 energy drinks?', 'PS: The office air conditioning is on too high.'],
  generous: ['PS: I’ve booked the team a spa day.', 'PS: New chairs for everyone. Don’t argue.'],
  sentimental: ['PS: I found an old photo of the first-ever roster. Made me emotional.'],
  hotHeaded: ['PS: Sorry about the last email. Not really.'],
};

// Content packs: owner reactions to new events, "self-aware" anomalies and the T1-vs-LPL lore.
Object.assign(OWNER_T, MORE_OWNER_T, LORE_OWNER_T);
Object.assign(QUIRK_T, MORE_QUIRK_T, LORE_QUIRK_T);
