// Fan Pulse scenarios + owner mail for the paths up the league pyramid (management/ascension.ts):
// a big brand's naming-rights offer, accepting / declining it, the move up, the brand leaving, promotion and
// relegation through the series, a bought spot and fan crowdfunding. Merged into FAN_TEMPLATES / OWNER_T lazily.
import type { Templates } from './fanTemplates';
import type { OwnerTemplate } from './ownerTemplates';

export const ASC_META: Record<string, { s: number; tag: string; harsh?: boolean }> = {
  brand_rumor: { s: 1, tag: 'BigMoney' },
  brand_rename: { s: 1, tag: 'NewName' },
  brand_declined: { s: -0.5, tag: 'NotForSale' },
  ascension_complete: { s: 2, tag: 'MovingUp' },
  brand_exit: { s: -1, tag: 'EndOfAnEra' },
  league_promoted: { s: 2, tag: 'Promoted' },
  league_relegated: { s: -2, tag: 'Relegated', harsh: true },
  slot_bought: { s: 1.5, tag: 'BoughtIn' },
  crowdfund: { s: 1.5, tag: 'FanFunded' },
};

export const ASC_TEMPLATES: Record<string, Templates> = {
  brand_rumor: {
    insider: ['Hearing {brand} have been in talks with {oldName}. Big talks. League-spot big.', 'Sources: a global brand is circling {short}. Think “{brand}” and think {target}.', 'Not a normal sponsor deal. {brand} want their name on the club and {short} in the {target}.'],
    analyst: ['If the {brand} rumours are true, {short} could skip the slow road to the {target}. That would be the story of the offseason.', 'Brands don’t buy {league} teams. They buy a story. {short} winning everything is a story.'],
    diehard: ['{brand} want US? After this season? Of course they do.', 'Whatever the front office decides about {brand}: this team earned the attention.'],
    memer: ['{brand} {short} sounds like a boss you meet in Act 3', 'me refreshing socials for the {brand} announcement every 30 seconds'],
    doomer: ['They’ll rename us after a {category} and we’ll still go 0-5 in the {target}.'],
    casual: ['wait is {short} getting sponsored by {brand}?? huge', '{brand}?? like THE {brand}??'],
    rival: ['Imagine needing a {brand} cheque to get out of the {league}.'],
  },
  brand_rename: {
    diehard: ['{newName}. Weird to type. But if it gets us to the {target}, I’ll wear the shirt.', 'They can put any name on the jersey. The badge on my heart says {oldName}.', 'From {league} grinders to the {target}. I don’t care what we’re called. LET’S GO.'],
    casual: ['{newName} going to the {target}!! What a glow up', 'new name, new league, same boys'],
    analyst: ['{brand} covering most of a {target} buyout is the kind of shortcut lower-league clubs dream of. The pressure starts now.', 'Naming rights for a league spot. Pragmatic. The real test is whether this roster can stay up in the {target}.'],
    memer: ['{newName} sounds like a {category} commercial because it is one', 'POV: your favourite team is now a {category} ad and you love it', 'can’t wait for “{brand} presents: Baron steal of the week”'],
    doomer: ['We sold our name. If we go straight back down, we sold it for nothing.', 'Watch {brand} pull out the moment we lose five in a row.'],
    toxic: ['SELLOUTS. {oldName} was a name. {newName} is a logo.', 'Renamed after a {category}. Amazing. Truly.'],
    wholesome: ['Whatever the name, this is the same team that made us believe. Proud of you, {short}.', 'Lower-league club getting a real shot at the {target}. This is why we watch.'],
    rival: ['Bought, not earned. Enjoy the {target}, {newName}.', 'Paid promotion. Literally.'],
    insider: ['The {brand} money doesn’t stop at the spot — expect them to push for a big signing too.'],
    intl: ['A {league} team going to the {target} with a {brand} name? Your scene is wild. Love it.'],
  },
  brand_declined: {
    diehard: ['Turned down {brand} to keep the name. Respect. Now win promotion the hard way.', '{oldName} stays {oldName}. That means something.'],
    analyst: ['Saying no to a {brand}-funded {target} spot is a bold bet on the promotion route. It had better pay off.'],
    doomer: ['We said no to the {target}. NO. To the {target}.'],
    memer: ['{brand}: here is a league spot\n{short}: no thanks we enjoy suffering'],
    toxic: ['Who in the front office turned down {brand}? Name and shame.'],
    wholesome: ['Keeping our name feels right. We’ll get there our own way.'],
    casual: ['wait we said no?? to {brand}??'],
  },
  ascension_complete: {
    diehard: ['{team} in the {target}. I’ve waited years to type that.', 'From the {from} to the {target}. Whatever happens next, we were here for this.'],
    casual: ['first {target} season lets gooo', 'cannot believe we’re a {target} team now'],
    analyst: ['Step one done: {team} are a {target} club. Step two is surviving in it — the gap from the {from} is real.'],
    memer: ['{target} teams when they see who just joined: 👀', 'the {from} is now a memory. a beautiful, beautiful memory'],
    doomer: ['Enjoy it while it lasts. The {target} eats new arrivals.'],
    wholesome: ['To everyone who watched us in the {from} with 200 viewers: this one’s for you.'],
    rival: ['Welcome to the {target}. Bring a helmet.'],
    intl: ['Love to see a club climb from the {from} to the {target}. Good luck!'],
  },
  brand_exit: {
    diehard: ['{oldName} is back. Finally feels like home again.', '{brand} gone. Name back. Now let’s prove we belong.'],
    analyst: ['The {brand} money leaves with the name. The budget sheet just got a lot tighter.'],
    memer: ['{brand} logo removed from the jersey, team immediately 10% faster'],
    doomer: ['No {brand}, no money, no chance.'],
    wholesome: ['Thank you {brand} for the ride. Welcome back, {oldName}.'],
    toxic: ['Even the sponsor gave up on us.'],
  },
  league_promoted: {
    diehard: ['WE ARE GOING UP. {team} in the {target} next season!', 'Earned it on the Rift. No cheque, no shortcut. PROMOTED.'],
    casual: ['PROMOTED!!! {target} here we come'],
    analyst: ['Promotion through the series is the hardest way up. {team} did it — now the squad needs {target}-level depth.'],
    memer: ['{league} speedrun complete. Next level: {target}.'],
    doomer: ['Great. Now we get stomped by {target} teams every week.'],
    wholesome: ['From the bottom of the pyramid to the {target}. So proud.'],
    rival: ['Enjoy the {target}. See you back down here next year.'],
  },
  league_relegated: {
    diehard: ['Relegated. It hurts. We’ll be back.', 'Down to the {target}. I’m still buying the shirt.'],
    doomer: ['Relegated. Of course. Of course we are.'],
    toxic: ['Relegated. Everyone responsible should be gone by Monday.'],
    analyst: ['Relegation to the {target} means smaller revenue and a squad that will be picked apart. The rebuild starts now.'],
    wholesome: ['We go down together and we come back up together.'],
    memer: ['{short} speedrunning the league pyramid in the wrong direction'],
    rival: ['Don’t let the door hit you on the way down.'],
  },
  slot_bought: {
    diehard: ['We BOUGHT our way into the {target}. Ownership actually delivered.', 'Whatever it cost — {team} are a {target} club now.'],
    analyst: ['Buying a {target} spot is the fast track. The roster has to justify the price now.'],
    memer: ['{short} unlocked the {target} DLC'],
    toxic: ['Money can buy a spot. It can’t buy wins.'],
    wholesome: ['Whatever route, we made it. {target} bound!'],
    casual: ['we’re in the {target} next year?? insane'],
    rival: ['Couldn’t win promotion so you bought it. Classic.'],
  },
  crowdfund: {
    diehard: ['Pledged what I could for the {target} spot. Let’s make it happen.', 'Crowdfunding our way to the {target}. This fanbase is different.'],
    memer: ['skipped lunch for a month to fund a league spot. worth it'],
    wholesome: ['Seeing the pledges roll in for {short} made my week.'],
    analyst: ['A {pledge} fan pledge won’t buy a {target} spot alone, but it changes the maths.'],
    doomer: ['Watch the board take our money and buy nothing.'],
    casual: ['just chipped in for the {target} spot!'],
  },
};

export const ASC_OWNER_T: Record<string, OwnerTemplate> = {
  brand_offer: {
    subj: ['{brand} want to rename us', 'About the {brand} offer'],
    body: ['{brand} have offered to put their name on our club and pay for most of a {target} spot. I’ve seen the numbers: it could save us years in the {league}. The name is your call — I just want us in the {target}.'],
    trait: {
      sentimental: ['{brand} want our name. That name means something to the people who’ve followed us since the {league}. If you take the deal I’ll understand — just think of them first.'],
      ambitious: ['{brand} are offering us the {target}. Take it. Names change; leagues are forever.'],
      frugal: ['A brand paying for our league spot is the best deal this club will ever see. I’d sign before they change their minds.'],
      publicity: ['{newName}… it has a ring to it. Every headline in the region will carry it. I like it.'],
      oldSchool: ['In my day clubs earned their place on the Rift. But I won’t pretend a {target} spot doesn’t tempt me.'],
      impatient: ['Wait years for promotion, or take the {target} now? This isn’t a hard decision.'],
    },
  },
  brand_yes: {
    subj: ['On to the {target}', 'The {brand} deal'],
    body: ['Signed. {newName} it is. Now make sure we deserve the {target}.'],
    trait: {
      sentimental: ['It’s strange to see {newName} on the shirts. Let’s make the old name proud anyway.'],
      ambitious: ['This is how big clubs are built. The {target} is the beginning, not the end.'],
      frugal: ['{brand} pay, we play. Best business this club has ever done.'],
    },
  },
  brand_no: {
    subj: ['About {brand}', 'You turned down {brand}'],
    body: ['You said no to {brand}. I hope you know what you’re doing — that was a {target} spot on a plate.'],
    trait: {
      sentimental: ['Thank you for keeping our name. Some things aren’t for sale.'],
      ambitious: ['I won’t lie: turning down a {target} spot is hard to swallow. Win promotion and I’ll forget about it.'],
      frugal: ['We just turned down free money. Please tell me there’s a plan.'],
    },
  },
};
