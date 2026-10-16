// Club drama: random off-the-Rift events. For the user's club an event is an inbox mail with 3–4 choices,
// an outcome line, sometimes a follow-up mail days later, fan posts and a news item once it goes public.
// For other clubs it's a news item only (`world`).
//
// Placeholders in {braces} are filled at runtime: {team} {short} {player} {player2} {opp} {oppShort} {celeb}
// {amount} {city} {event} {days} {staff}. A template whose placeholders can't all be filled is skipped, so every
// list keeps variants that only need {team}/{short}. Option labels and hints carry no placeholders at all.
//
// Content rules: players are real people. Accusations are always unproven claims made by others, never facts;
// the only confirmed "violation" is solo-queue account sharing (cheat_allegation → minor). No romance, no
// comments on anyone's looks, nothing beyond trespassing. Stalking and crowd safety are treated seriously.
// Celebrities, brands, venues and ex-staff are fictional; the governing body is always "the league".
import type { FanPersona } from '../types';

export type FanTemplates = Partial<Record<FanPersona, string[]>>;

export type DramaKind =
  | 'stalker_van' | 'cheat_allegation' | 'crazy_fan' | 'stage_invader' | 'leaked_scrims' | 'tell_all'
  | 'food_poisoning' | 'internet_outage' | 'viral_meme' | 'fan_petition' | 'celebrity_fan' | 'rival_trashtalk'
  | 'visa_issue' | 'noise_complaint' | 'account_hacked' | 'charity_stream' | 'tampering' | 'fan_meet_chaos';

export interface DramaText {
  /** Sender of the inbox mail. */
  from: string[];
  subject: string[];
  /** The situation, 1–3 sentences. */
  body: string[];
  /** Option id → button label, consequence hint and outcome lines. */
  options: Record<string, { label: string; hint: string; outcome: string[] }>;
  /** Follow-up mails days later, by follow-up id. */
  follow?: Record<string, { subject: string[]; body: string[] }>;
  /** When it becomes public about the user's club. */
  news?: { headline: string[]; body: string[] };
  /** The same thing happening at another club ({team}/{player} are that club's). */
  world?: { headline: string[]; body: string[] };
}

export const DRAMA_TEXT: Record<DramaKind, DramaText> = {
  // ------------------------------------------------------------------ stalker van
  stalker_van: {
    from: ['Head of security', 'House manager', 'Team manager'],
    subject: ['The van outside the gaming house', 'Someone is watching the house', 'Unknown van parked outside — again', 'Security concern at the gaming house'],
    body: [
      'A white van has been parked across from the gaming house for {days} days, and the players have seen someone inside filming the windows. Fans spotted it on a stream and are already shaming the owner online.',
      'Same van, same spot, four mornings running. Someone inside has been filming {player} coming back from the gym, and the players are understandably rattled.',
      'The players have stopped opening the curtains. A van with tinted windows has been parked outside the {short} house for days with a camera pointed at the front door.',
      'A van has been sitting outside the gaming house since the weekend and someone in it keeps filming whoever comes and goes. Fans have noticed and are calling it out everywhere.',
    ],
    options: {
      police: {
        label: 'Report it to the police', hint: 'Slow but proper · players reassured',
        outcome: [
          'Officers took statements from the staff and promised regular patrols on the street. The players say it helps just knowing it’s on record.',
          'The police logged the plate and the doorbell-camera footage. Nothing dramatic yet, but the house feels calmer.',
          'A report is filed and patrols have been stepped up. The van’s owner now has the police’s attention instead of ours.',
        ],
      },
      statement: {
        label: 'Ask fans to respect privacy', hint: 'Free · fans rally, van may stay',
        outcome: [
          'The statement asked everyone to give the players space and stop sharing the address. Fans responded with a wave of support — the van, less so.',
          '“Our players live here. Please let them.” The post went far, and the replies are overwhelmingly on the players’ side.',
        ],
      },
      security: {
        label: 'Hire private security', hint: 'Costs money · players feel safe',
        outcome: [
          'Two guards now cover the gate around the clock. The players went back to opening the curtains.',
          'A security firm installed cameras and a night patrol. Expensive, but morale in the house noticeably improved.',
          'Private security is on site. {player} walked to the gym this morning without looking over their shoulder once.',
        ],
      },
      ignore: {
        label: 'Ignore it', hint: 'Free · players stay uneasy',
        outcome: [
          'You decided not to escalate. The players keep the blinds down and the mood in the house stays tense.',
          'Nothing was done, and the players have started using the back door.',
          'No action taken. {player} has quietly asked the staff whether the van is still there — twice a day.',
        ],
      },
    },
    follow: {
      van_back: {
        subject: ['The van is back', 'It’s parked outside again', 'Van sighting — same plate'],
        body: [
          'The van returned last night and parked one street over. Staff have logged the time, and the players have been asked not to engage.',
          'Same van, new spot. Someone was filming the house again this morning, and the players are not sleeping well.',
          'It’s back. The house manager recognised the plate at 7am and the players are rattled all over again.',
        ],
      },
      van_gone: {
        subject: ['The van is gone', 'The street is clear', 'No sign of the van'],
        body: [
          'No sign of the van for a full week now. Whatever made them leave, the players are finally relaxed again.',
          'The van has not come back. The house manager says the curtains were open this morning for the first time in weeks.',
          'All clear outside the gaming house. The players celebrated by eating breakfast on the balcony.',
        ],
      },
    },
    news: {
      headline: ['{team} raise privacy concerns after van parked outside gaming house', '{short} players filmed at gaming house; club asks for privacy', 'Privacy scare at the {short} gaming house'],
      body: [
        '{team} confirmed an unknown vehicle had been parked outside the team’s gaming house for several days, with someone filming the players. The club asked fans not to visit or share the address.',
        'A van parked outside the {short} gaming house has drawn widespread criticism online. The club said player safety and privacy come first.',
      ],
    },
    world: {
      headline: ['{team} report a van watching their gaming house', 'Privacy scare at the {short} gaming house', '{team} ask fans to stop sharing gaming-house address', 'Fans rally behind {team} after gaming-house filming'],
      body: [
        '{team} say a van has been parked outside their gaming house for days with someone filming the players. The community has rallied behind the roster.',
        'Players at {team} have reportedly been filmed through the windows of their gaming house. The club has contacted the authorities.',
        'After fans spotted an unknown vehicle outside the {short} house on stream, the club asked everyone to respect the players’ privacy.',
        '{player} reportedly stopped streaming from the {short} house after a van spent days filming the building. The club has stepped up security.',
      ],
    },
  },

  // ------------------------------------------------------------------ cheating allegation (unproven)
  cheat_allegation: {
    from: ['PR manager', 'Team manager', 'Social media manager'],
    subject: ['Scripting accusations about {player}', 'Accusations after last night’s game', 'A streamer is pushing a cheating claim', 'The “suspicious dodge” clip'],
    body: [
      'After {player}’s monster performance, a big streamer clipped a few “too perfect” dodges and suggested scripts. There is zero evidence, but the clip is everywhere.',
      'People online are claiming {player} ghosted the broadcast during the last series. The booth delay makes that basically impossible, but a streamer with a huge audience keeps pushing it.',
      'One of our players is being accused of scripting after a ridiculous performance. The “evidence” is a slowed-down clip with red circles on it, and a popular streamer has amplified it to millions.',
      'A viral thread claims a {short} player is using third-party software. Nobody has shown anything real, but the accusation is trending and sponsors are asking questions.',
    ],
    options: {
      handcam: {
        label: 'Stream with a hand-cam', hint: 'Free · proves it live, risky if it goes badly',
        outcome: [
          '{player} agreed to stream solo queue with a hand-cam all week. The first night pulled a huge audience, accusers included.',
          'The player agreed to a hand-cam stream. Chat is watching every keypress — exactly what we wanted.',
        ],
      },
      league: {
        label: 'Ask the league to investigate', hint: 'Slow · official verdict',
        outcome: [
          'We formally requested a review of the account and client data. The league says it will report back within a couple of weeks.',
          'The league opened a routine review at our request. Until it reports, the club’s line is simple: we have nothing to hide.',
        ],
      },
      legal: {
        label: 'Send a cease-and-desist', hint: 'Costs money · could look heavy-handed',
        outcome: [
          'Legal counsel sent a letter to the streamer. The clip came down within hours — and a new clip about the letter went up within minutes.',
          'The cease-and-desist worked: the accusations were deleted. Some fans applauded, others said it made the club look nervous.',
        ],
      },
      ignore: {
        label: 'Ignore the noise', hint: 'Free · rumour may linger',
        outcome: [
          'The club stayed silent. The rumour keeps circulating, though most serious analysts have already debunked it.',
          'You let the clip run its course. Half the internet has moved on; the other half has made it their whole personality.',
          'No comment from the club. {player} has muted the word “script” on every app.',
        ],
      },
    },
    follow: {
      cleared: {
        subject: ['League review: no evidence found', '{player} cleared', 'Case closed'],
        body: [
          'The league reviewed {player}’s accounts and client data and found no evidence of third-party software. The allegations are officially closed.',
          'Investigation complete: no scripts, no ghosting, nothing. The league has publicly confirmed our player is clean.',
          'The league’s review came back spotless. The streamer who started it has gone suspiciously quiet.',
        ],
      },
      minor: {
        subject: ['League review: a minor finding', 'Review outcome — account sharing', 'Not scripts, but…'],
        body: [
          'The league found no evidence of scripts, but it did find that {player}’s solo queue account had been shared with someone else. That’s against the rules: a small fine and a formal warning.',
          'Good news and slightly embarrassing news. The cheating claims are baseless — but the review flagged account sharing in solo queue, so we’ve been handed a minor fine and a warning.',
          'No scripts, no ghosting. The only finding was a shared solo queue account, which earned a small fine and a stern letter.',
        ],
      },
      handcam_win: {
        subject: ['The hand-cam stream worked', 'Doubters silenced', 'Hand-cam numbers are in'],
        body: [
          '{player}’s hand-cam stream turned into the show of the week: clean mechanics, live, with chat watching every keypress. The clip that started it all has quietly been deleted.',
          'A week of hand-cam solo queue and the accusations have evaporated. If anything, the footage made our player look even better.',
          'The hand-cam stream was a hit. Even the loudest accusers are now posting “ok fair, they’re just good”.',
        ],
      },
    },
    news: {
      headline: ['{team} respond to cheating accusations against {player}', '{short} player at centre of unproven scripting claims', 'Scripting rumours swirl around {team}'],
      body: [
        'Online accusations that a {team} player used third-party software have spread after a viral clip. No evidence has been presented, and the club has called the claims baseless.',
        'A popular streamer has questioned a {short} player’s mechanics after a standout game. {team} say the accusations are unfounded and welcome any review.',
      ],
    },
    world: {
      headline: ['Unproven scripting claims target {team}’s {player}', 'Hand-cam calls grow for {player} after viral clip', '{team} dismiss cheating rumours as “internet nonsense”', 'Streamer’s clip sparks scripting debate around {short}'],
      body: [
        'A viral clip has led some viewers to accuse {player} of scripting. No evidence has been presented, and {team} have called the claims baseless.',
        'After a dominant performance, {player} is facing online accusations of ghosting the broadcast. {team} point out the booth delay makes it impossible.',
        'A popular streamer’s slowed-down clips have sparked unfounded cheating rumours around {team}. The club says it welcomes any review.',
        'Accusations against a {short} player are trending, but no evidence has surfaced. Most analysts have already called it a non-story.',
      ],
    },
  },

  // ------------------------------------------------------------------ obsessive fan
  crazy_fan: {
    from: ['Head of security', 'Team manager', 'Player welfare officer'],
    subject: ['A fan who won’t take the hint', 'Concern about an obsessive fan', 'Letters, visits and boundaries', '{player} keeps being followed'],
    body: [
      'The same fan has turned up at the gaming house, at {player}’s favourite restaurant and outside the gym this week, and sends dozens of letters a day. {player} stays polite, but is clearly uncomfortable.',
      'We have a fan who knows the players’ schedule better than we do. They were waiting outside after scrims three nights in a row, and the mailbox is overflowing.',
      'A fan has been following {player} around town and posting their location online. It hasn’t crossed a line yet, but the staff want to act before it does.',
      'One supporter has sent over a hundred letters this week and keeps appearing wherever the team eats. The players want it handled kindly — but handled.',
    ],
    options: {
      escort: {
        label: 'Security escort', hint: 'Costs money · player feels safe',
        outcome: [
          '{player} now has a security escort for trips outside the house. The fan still shows up, but keeps their distance.',
          'A guard accompanies the players on outings for the next few weeks. Annoying for everyone, reassuring for the one who matters.',
        ],
      },
      meet: {
        label: 'Supervised meet', hint: 'Free · could calm it or feed it',
        outcome: [
          'A short meet with staff present: a photo, a signed jersey and a clear, kind explanation of boundaries. The fan seemed to understand.',
          'The meet went politely. Staff explained what’s okay and what isn’t; whether it sticks, time will tell.',
        ],
      },
      police: {
        label: 'Involve the police', hint: 'Firm · serious response',
        outcome: [
          'The police spoke to the fan and explained the consequences of continuing. The letters have stopped for now.',
          'Officers issued a formal warning. The club also asked fans not to share the players’ locations online.',
        ],
      },
      ignore: {
        label: 'Ignore it', hint: 'Free · may escalate',
        outcome: [
          'Nothing changes. The letters keep coming, and the players are eating in more often.',
          'You hope it fades on its own. Security keeps a quiet eye on the gate.',
          'No action for now. {player} has started ordering takeout instead of going out.',
        ],
      },
    },
    follow: {
      fan_escalates: {
        subject: ['Security incident at the gaming house', 'Someone climbed the fence', 'It escalated'],
        body: [
          'Last night the fan climbed the gaming-house fence and knocked on the windows. Nobody was hurt, the police were called, and the players are shaken.',
          'Security found the fan in the garden at 2am after they climbed the fence. The police have dealt with the trespassing; staff are checking in on {player}.',
          'The situation escalated: the fan got over the fence and into the garden before security reached them. Police are involved and the players are staying together tonight.',
        ],
      },
      fan_calm: {
        subject: ['Things have settled down', 'The letters stopped', 'Update on the fan situation'],
        body: [
          'No visits and no letters this week. The fan posted an apology for overstepping, and {player} is relieved.',
          'It’s been quiet. Security has scaled back, and the players are going out to dinner again.',
          'The situation has calmed down completely. The staff will keep an eye out, but the house feels normal again.',
        ],
      },
    },
    news: {
      headline: ['{team} ask fans to respect player boundaries', '{short} address safety concerns around an obsessive fan'],
      body: [
        '{team} have asked supporters to respect players’ privacy after a fan repeatedly turned up at the gaming house and around town.',
        'The club confirmed it is handling a situation involving a fan following one of its players, and asked people not to share players’ locations.',
      ],
    },
    world: {
      headline: ['{team} step up security for {player}', '{team} ask fans to respect privacy', 'Fan boundaries in focus at {short}'],
      body: [
        '{team} have increased security after a fan repeatedly showed up at the gaming house and around town to see {player}.',
        'The club asked supporters not to share players’ locations online after a run of uninvited visits.',
        '{player} has reportedly been receiving dozens of letters a day from a single fan. {team} say they are handling it with care.',
      ],
    },
  },

  // ------------------------------------------------------------------ stage invader
  stage_invader: {
    from: ['League operations', 'Event manager', 'Team manager'],
    subject: ['The stage invader', 'League unhappy about the stage incident', 'About that hug on stage'],
    body: [
      'Right after the nexus fell, a fan vaulted the barrier and ran on stage to hug {player}. Nobody was hurt, but the league wants answers and has issued a fine.',
      'The clip of a fan sprinting past security to hug {player} has millions of views. The league is less amused and says clubs share responsibility for their supporters.',
      'A supporter got onto the stage after our win. Harmless, joyful, and absolutely against the rules — the league has sent a letter and a fine.',
    ],
    options: {
      pay: {
        label: 'Apologise and pay', hint: 'Costs money · league placated',
        outcome: [
          'We paid the {amount} fine and apologised. The league thanked us for the swift response.',
          'We paid the fine and apologised. The league considers the matter closed.',
        ],
      },
      defend: {
        label: 'Defend the fan’s passion', hint: 'Free · fans love it, league doesn’t',
        outcome: [
          'The club posted that passion is what makes esports special. Fans loved it; the league added a pointed note about “safety culture”.',
          'You stood up for the fan publicly. It was the most-liked post of the month — and the least-liked email in the league office.',
        ],
      },
      invite: {
        label: 'Invite them for content', hint: 'Content gold · league may frown',
        outcome: [
          'The stage invader got a supervised tour of the gaming house and a 1v1 against {player}. The video is a hit, and the fan has promised to stay behind the barrier forever.',
          'The fan visited the house with security present, signed a promise never to jump a barrier again, and starred in our best video of the season.',
        ],
      },
    },
    news: {
      headline: ['Fan invades the stage after {short} win', 'League reviews security after {team} stage invasion'],
      body: [
        'A supporter ran onto the stage to hug a {team} player after the match. Nobody was hurt, but the league has opened a review of event security.',
        'Viral footage shows a fan slipping past security to celebrate with {short}. The league has fined the club.',
      ],
    },
    world: {
      headline: ['Stage invader celebrates with {team}’s {player}', 'Security slip after {team} victory', 'Fan sprints on stage after {short} win'],
      body: [
        'A fan made it past security to hug {player} after {team}’s win. The player took it in good humour; the league did not.',
        'The league is reviewing event security after a supporter reached the stage during {team}’s celebration.',
        'Footage of a fan vaulting the barrier after a {short} victory has gone viral. Nobody was hurt.',
      ],
    },
  },

  // ------------------------------------------------------------------ leaked scrims
  leaked_scrims: {
    from: ['Head coach', 'Head analyst', 'Team manager'],
    subject: ['Our scrims leaked', 'Draft notes are online', 'We have a leak'],
    body: [
      'Footage from last week’s scrims and a page of our draft notes are circulating online. Whoever posted it had access to our internal drive.',
      'Someone uploaded our scrim VODs with the comms. Opponents now know our pocket picks, and fans know exactly how often our jungler sighs.',
      'A forum account posted our full priority list for the next patch. This came from the inside, and the coaches are furious.',
    ],
    options: {
      hunt: {
        label: 'Investigate the leak', hint: 'Costs money · may find the source',
        outcome: [
          'We hired a digital forensics firm to audit drive access. It won’t be cheap, but they’re confident of finding a trail.',
          'Access logs are being combed through and every password has been reset. Now we wait.',
        ],
      },
      new_strats: {
        label: 'Rebuild the strats', hint: 'Free · practice disrupted',
        outcome: [
          'The coaches binned the leaked plans and started over. Scrims will be messy for a week, but opponents are studying a playbook that no longer exists.',
          'New priority list, new pocket picks, new everything. The players groaned; the analysts haven’t slept.',
        ],
      },
      ignore: {
        label: 'Ignore it', hint: 'Free · opponents have our notes',
        outcome: [
          'You decided the leak changes little. Opponents got a peek at our habits, but habits can be broken on stage.',
          'No reaction. Somewhere, an opposing analyst is very happy.',
        ],
      },
    },
    follow: {
      leaker_found: {
        subject: ['We found the leak', 'Leak investigation: result', 'The trail leads to a former staffer'],
        body: [
          'The investigation traced the uploads to an account linked to {staff}, a staffer who left the club earlier this year. Legal is handling it, and the drive is locked down.',
          'Forensics found the leak came from an old login that was never revoked — it belonged to a former staff member. Access has been cut and the lawyers have been briefed.',
          'We have our answer: the files came through a former analyst’s account that should have been closed months ago. Lesson learned, doors locked.',
        ],
      },
      leaker_unknown: {
        subject: ['Leak investigation: dead end', 'No culprit found', 'Leak update'],
        body: [
          'The investigators couldn’t identify who leaked the files. The good news: every account has been secured, so it shouldn’t happen again.',
          'Dead end. Whoever did it covered their tracks — we’ve tightened access and moved on.',
        ],
      },
    },
    news: {
      headline: ['{team} scrim footage leaks online', '{short} draft notes leaked'],
      body: [
        'Internal scrim footage and draft notes from {team} are circulating online. The club says it is investigating.',
        'A leak of {short}’s practice material has given rivals an unexpected look behind the curtain.',
      ],
    },
    world: {
      headline: ['{team} hit by scrim leak', '{short} draft notes surface online', 'Leak exposes {team} pocket picks'],
      body: [
        'Scrim footage with team comms from {team} has surfaced online. The club is investigating how it got out.',
        'A forum post claiming to show {team}’s priority list has gone viral. Analysts are already picking it apart.',
        '{team} have reset their internal access after draft notes leaked online.',
      ],
    },
  },

  // ------------------------------------------------------------------ tell-all interview
  tell_all: {
    from: ['PR manager', 'Communications', 'Legal counsel'],
    subject: ['A former player went on a podcast', 'Tell-all interview about the club', 'Damage control needed'],
    body: [
      'A former {short} player sat down for a two-hour podcast and tore into the club: long hours, harsh review sessions and staff who “never listened”. It’s trending.',
      'An ex-player has given a tell-all interview about life at {team}. Some of it is exaggerated, some of it stings, and all of it is being clipped.',
      'A former academy player published a long post slamming the club culture. The replies are split between “finally someone said it” and “sounds like a normal job”.',
    ],
    options: {
      respond: {
        label: 'Public rebuttal', hint: 'Free · could fuel the fire',
        outcome: [
          'The club posted a detailed rebuttal. Some fans were convinced; others started a second thread about the rebuttal.',
          'Our statement set the record straight on several points. The story lost steam, but the comment section is still a battlefield.',
        ],
      },
      silence: {
        label: 'No comment', hint: 'Free · story fades slowly',
        outcome: [
          'No comment. The story dominated the weekend and faded by Tuesday.',
          'We stayed quiet. The current players privately told the staff they don’t recognise the picture painted.',
        ],
      },
      legal: {
        label: 'Send a legal letter', hint: 'Costs money · looks defensive',
        outcome: [
          'Legal counsel sent a letter about the most serious claims. The ex-player edited the video — and then posted about the letter.',
          'The letter got a correction on two points. It also got a headline: “Club lawyers up”.',
        ],
      },
    },
    news: {
      headline: ['Former player criticises {team} culture', '{team} respond to tell-all interview'],
      body: [
        'A former {team} player has criticised the club’s working culture in a long interview. The club says it does not recognise the picture painted.',
        'Claims about long hours and harsh reviews at {short} have sparked a wider debate about player welfare in esports.',
      ],
    },
    world: {
      headline: ['Ex-player tell-all puts {team} under the spotlight', 'Former {short} player speaks out', '{team} push back on podcast claims'],
      body: [
        'A former {team} player has described a demanding culture at the club in a podcast interview. {team} have disputed the account.',
        'Comments from an ex-{short} player about review sessions and long hours have sparked a wider welfare debate.',
        '{team} say they “don’t recognise” the club described in a former player’s viral interview.',
      ],
    },
  },

  // ------------------------------------------------------------------ food poisoning
  food_poisoning: {
    from: ['Team manager', 'Performance coach', 'House manager'],
    subject: ['Half the team is sick', 'Bad takeout, worse timing', 'Food poisoning in the house'],
    body: [
      'Last night’s takeout has knocked out most of the roster. The bathrooms are fully booked, and match week starts in two days.',
      'Everyone who ate the late-night seafood is down with food poisoning. {player} hasn’t left bed since 6am.',
      'The team ordered from a new place after scrims, and now four of five starters are sick. Today’s practice plan is in the bin.',
    ],
    options: {
      rest: {
        label: 'Cancel scrims, rest', hint: 'Lose practice · full recovery',
        outcome: [
          'Scrims cancelled, fluids distributed, everyone in bed. They should be fine by match day, if a little rusty.',
          'Full rest day. The house was eerily quiet apart from the rattle of electrolyte packets.',
        ],
      },
      push: {
        label: 'Push through', hint: 'Keep practice · players drained',
        outcome: [
          'The team scrimmed anyway, with a bucket next to every chair. Practice happened, but so did a lot of AFK moments.',
          'You kept the schedule. The players respected the grit and resented the decision in roughly equal amounts.',
        ],
      },
      chef: {
        label: 'Hire a team chef', hint: 'Costs money · better meals from now on',
        outcome: [
          'A full-time team chef starts on Monday. No more mystery takeout — and the nutrition coach is thrilled.',
          'We hired a chef. The players are already lobbying for a dessert budget.',
        ],
      },
    },
    news: {
      headline: ['Food poisoning hits {team} before match week', '{short} roster sidelined by bad takeout'],
      body: [
        'Several {team} players are recovering from food poisoning ahead of a crucial week. The club expects everyone to be available.',
        'A bad takeout order has disrupted {short}’s preparation. Staff say the players are on the mend.',
      ],
    },
    world: {
      headline: ['Food poisoning sweeps the {team} house', '{team} cancel scrims after bad takeout', '{short} preparation hit by stomach bug'],
      body: [
        'Most of the {team} roster is reportedly recovering from food poisoning after a late-night takeout order.',
        '{team} have cancelled scrims this week after several players fell ill. {player} was reportedly hit hardest.',
        'Stomach trouble at {short}: the club says the players should be fit for match day.',
      ],
    },
  },

  // ------------------------------------------------------------------ internet outage
  internet_outage: {
    from: ['House manager', 'Head coach', 'IT support'],
    subject: ['The internet is down', 'Outage at the gaming house', 'No internet for days'],
    body: [
      'A cable was cut during roadworks and the gaming house has no internet. The provider says {days} days, which in provider-speak means “eventually”.',
      'The fibre is down across the whole street. The players are scrimming on phone hotspots at 180 ping.',
      'Our internet has been out since yesterday and the provider can’t give a fix date. Scrims are cancelled until we find a solution.',
    ],
    options: {
      pc_bang: {
        label: 'Practise at a PC bang', hint: 'Cheap · less ideal setup',
        outcome: [
          'The squad has taken over the back row of a local PC bang. The regulars are thrilled; the coaches miss their whiteboard.',
          'Practice moved to an internet café. The setup isn’t perfect, but the energy is weirdly great.',
        ],
      },
      hotel: {
        label: 'Move to a bootcamp hotel', hint: 'Costs more · practice continues',
        outcome: [
          'Everyone packed into a bootcamp hotel with a proper connection. Expensive, but scrims run on schedule.',
          'The team relocated to a bootcamp facility for the week. Business as usual, with room service.',
        ],
      },
      wait: {
        label: 'Wait it out', hint: 'Free · practice lost',
        outcome: [
          'You waited for the fix. The players rediscovered board games, and solo queue LP stayed frozen.',
          'No internet, no scrims. The team watched VODs someone had downloaded to their phone.',
        ],
      },
    },
    news: {
      headline: ['Internet outage knocks {team} offline', '{short} forced out of the gaming house by outage'],
      body: [
        '{team}’s gaming house has been without internet for several days after roadworks cut a cable. The club has made alternative arrangements.',
        'An outage has disrupted {short}’s practice schedule. Players were spotted grinding solo queue at a local internet café.',
      ],
    },
    world: {
      headline: ['{team} spotted practising at a PC bang', 'Outage leaves {team} without internet', '{short} gaming house offline'],
      body: [
        'With their gaming house offline, {team} have reportedly moved practice to a local PC bang — to the delight of its regulars.',
        'A cut cable has left {team} without internet for days. {player} has been streaming from a phone hotspot.',
        'The {short} gaming house is offline after roadworks. The club says practice will continue elsewhere.',
      ],
    },
  },

  // ------------------------------------------------------------------ viral meme
  viral_meme: {
    from: ['Social media manager', 'PR manager', 'Community manager'],
    subject: ['{player} is the meme of the week', 'That clip is everywhere', 'We are a meme now'],
    body: [
      'The clip of {player} flashing into a wall and dying to a minion has been remixed with music, subtitles and a fake documentary voice-over. It is the meme of the week.',
      'A blunder from last match is all over every feed. The edits are funny; {player} is not sure they are.',
      'One of our players’ misplays has become the community’s favourite reaction image. There are fan-made emotes already.',
    ],
    options: {
      lean_in: {
        label: 'Lean into it', hint: 'Merch money · player may not love it',
        outcome: [
          'The club dropped a limited shirt of the meme and {player} filmed a self-roasting video. Both were gone in a day.',
          'We leaned in hard. The meme is now merch, a sticker pack and an extremely popular emote.',
        ],
      },
      defend: {
        label: 'Defend the player', hint: 'Free · player appreciates it',
        outcome: [
          'The club posted a reminder that {player} has carried more games than anyone this season. The player appreciated it more than they’ll admit.',
          'Our statement asked fans to remember the highlights too. The meme lives on, but so does the support.',
        ],
      },
      ignore: {
        label: 'Ignore it', hint: 'Free · it fades in a week',
        outcome: [
          'No reaction from the club. The internet found a new meme by Thursday.',
          'You let it pass. Memes are the price of being watched.',
        ],
      },
    },
    news: {
      headline: ['{team} blunder becomes meme of the week', '{short} embrace the internet’s favourite clip'],
      body: [
        'A misplay from a {team} player has become the community’s meme of the week, with edits racking up millions of views.',
        'The internet has a new favourite clip, and it stars {short}. The club’s reaction has been watched almost as much as the clip.',
      ],
    },
    world: {
      headline: ['{player}’s flash fail is the meme of the week', '{team} clip takes over the internet', 'Everyone is remixing the {short} blunder'],
      body: [
        'A clip of {player} flashing into a wall has become the community’s favourite meme. {team} have taken it in good spirits.',
        'Edits of a {team} misplay have racked up millions of views this week. The player has reportedly changed their profile picture to it.',
        'The {short} blunder has spawned emotes, remixes and at least one fake documentary trailer.',
      ],
    },
  },

  // ------------------------------------------------------------------ bench petition
  fan_petition: {
    from: ['Community manager', 'PR manager', 'Social media manager'],
    subject: ['Fans want {player} benched', 'There’s a petition', 'Bench petition is trending'],
    body: [
      'A petition to bench {player} after the recent slump has passed ten thousand signatures. It’s mostly frustration, but the media want a comment.',
      'Fans have launched a “bench {player}” petition, complete with a stat sheet and a graph. The player has seen it.',
      'A fan petition calling for a roster change is trending. The comments mention one of our starters by name, repeatedly.',
    ],
    options: {
      back: {
        label: 'Back the player publicly', hint: 'Free · player confidence up',
        outcome: [
          'The club posted full support for {player}: “form is temporary”. The player thanked the staff privately.',
          'We publicly backed our starter. The petition is still growing, but the dressing room appreciated it.',
        ],
      },
      bench: {
        label: 'Bench them', hint: 'Fans pleased · player hurt',
        outcome: [
          '{player} has been moved to the bench for now. The petition organisers declared victory; the player went very quiet.',
          'The starter was benched. Fans cheered, and the squad noticed that the internet got its way.',
        ],
      },
      ignore: {
        label: 'Ignore it', hint: 'Free · noise continues',
        outcome: [
          'No comment from the club. The petition keeps ticking up and the topic won’t go away.',
          'You let the petition run its course. Lineups are decided in the building, not online.',
        ],
      },
    },
    news: {
      headline: ['Fans petition {team} for a roster change', '{short} bench petition passes 10,000 signatures'],
      body: [
        'Frustrated {team} supporters have launched a petition calling for a lineup change after a run of poor form.',
        'A fan petition to bench a {short} starter is gaining traction. The club has been asked to respond.',
      ],
    },
    world: {
      headline: ['{team} fans launch petition to bench {player}', 'Bench petition targets {team} starter', '{short} supporters demand a lineup change'],
      body: [
        'A fan petition calling for {team} to bench {player} after a poor run has gathered thousands of signatures.',
        '{team} supporters want changes after a rough stretch. The club says lineup decisions stay in-house.',
        'A petition with a full stat sheet is calling for a {short} lineup change. The player has reportedly logged off socials.',
      ],
    },
  },

  // ------------------------------------------------------------------ celebrity fan
  celebrity_fan: {
    from: ['Social media manager', 'Partnerships', 'PR manager'],
    subject: ['{celeb} is wearing our jersey', 'Celebrity sighting in {short} colours', 'Our mentions just exploded'],
    body: [
      '{celeb} was photographed at an airport wearing a {short} jersey, and their fanbase has flooded our socials. We gained more followers overnight than in the last month.',
      'Huge: {celeb} posted a story in our jersey with the caption “my team”. The marketing team is screaming.',
      'A very famous face was spotted in a {short} jersey and our follower count is going vertical. Their fans have a lot of questions about what a jungler is.',
    ],
    options: {
      invite: {
        label: 'Invite them over', hint: 'Small cost · massive exposure',
        outcome: [
          '{celeb} spent an afternoon at the gaming house, lost every 1v1 and loved it. The video is our most-watched ever.',
          'The visit was a hit: a tour of the house, a few games with the squad and a promise to come to a live match.',
        ],
      },
      thank: {
        label: 'Thank them publicly', hint: 'Free · nice bump',
        outcome: [
          'Our thank-you post got a reply from {celeb} — and a million new eyes on the club.',
          'The club sent a signed jersey and a thank-you post. Their fans adopted us as a second team.',
        ],
      },
      ignore: {
        label: 'Ignore it', hint: 'Free · moment passes',
        outcome: [
          'No reaction from the club. The new followers drifted away after a week.',
          'You let the moment pass. The marketing team is still not over it.',
        ],
      },
    },
    news: {
      headline: ['{celeb} spotted in a {team} jersey', 'Celebrity boost for {short}'],
      body: [
        '{team} have been flooded with new followers after {celeb} was seen wearing the club’s jersey.',
        'A celebrity sighting in {short} colours has sent the club’s socials into overdrive.',
      ],
    },
    world: {
      headline: ['{celeb} reps {team} in public', '{team} gain a famous fan', 'Celebrity sighting in {short} colours'],
      body: [
        '{celeb} was spotted wearing a {team} jersey, and the club’s socials have exploded overnight.',
        '{team} have a new celebrity supporter, and the club is clearly enjoying the attention.',
        'A famous fan in a {short} jersey has introduced the club to a whole new audience.',
      ],
    },
  },

  // ------------------------------------------------------------------ rival trash talk
  rival_trashtalk: {
    from: ['PR manager', 'Social media manager', 'Head coach'],
    subject: ['{oppShort} are talking', 'Trash talk before the match', 'They called us out'],
    body: [
      'One of {oppShort}’s players said on stream that {short} are “a free win with a nice logo”. The clip is everywhere and our fans want revenge on the Rift.',
      'Ahead of our next match, an {oppShort} player told an interviewer that we “don’t know how to play from behind”. The quote is trending.',
      'A rival player posted a meme of our logo in a recycling bin before our next match. Our players have seen it.',
    ],
    options: {
      clap_back: {
        label: 'Fire back on socials', hint: 'Free · hype up, pressure up',
        outcome: [
          'Our social team posted a perfectly timed reply. Fans loved it — now we just have to win.',
          'The clap-back went viral. The match is now the most hyped game of the week, no pressure.',
        ],
      },
      classy: {
        label: 'Stay classy', hint: 'Free · no extra pressure',
        outcome: [
          'The club replied with “see you on the Rift” and nothing else. Calm, confident, classy.',
          'No reaction. The players are saving it for the match.',
        ],
      },
      player: {
        label: 'Let the player respond', hint: 'Personal · could be iconic or awful',
        outcome: [
          '{player} answered on stream with a single line and a smirk. Chat lost its mind.',
          'Our player got the last word on stream. It was funny, it was sharp, and now everyone is watching the match.',
        ],
      },
    },
    follow: {
      aged_well: {
        subject: ['That trash talk aged well', 'Receipts', 'Who’s the free win now?'],
        body: [
          'We beat {oppShort}, and the internet has dug up the pre-match quote. Our social team has the reply typed and ready.',
          'The win is in and the trash talk has aged like milk — for them. Fans are posting the quote on loop.',
        ],
      },
      aged_badly: {
        subject: ['That aged badly', 'The trash talk is back to haunt us', 'Rough night online'],
        body: [
          'We lost to {oppShort}, and their players are reposting the pre-match drama with laughing emojis. The mentions are rough.',
          'The loss is bad; the replies are worse. Everyone is quoting the build-up back at us.',
        ],
      },
    },
    news: {
      headline: ['{short} and {oppShort} trade barbs before clash', 'Trash talk heats up ahead of {team} match'],
      body: [
        'Pre-match trash talk between {team} and {oppShort} has turned the meeting into the most anticipated game of the week.',
        'A rival’s jab at {short} has gone viral, and both fanbases are counting down to the match.',
      ],
    },
    world: {
      headline: ['{team}’s {player} stirs the pot before rival clash', 'Trash talk heats up around {team}', 'Pre-match drama: {short} vs {oppShort}'],
      body: [
        '{player} said on stream that {team}’s next opponents are “a free win”. The clip is everywhere.',
        '{team} and their next opponents have been trading jabs on social media all week. The match just got a lot more interesting.',
        'Pre-match banter involving {short} has gone viral, and both fanbases are already arguing.',
      ],
    },
  },

  // ------------------------------------------------------------------ visa trouble
  visa_issue: {
    from: ['Logistics', 'Travel coordinator', 'Team manager'],
    subject: ['Visa trouble for {player}', 'Visa delay before {event}', 'Paperwork problem'],
    body: [
      '{player}’s visa for {event} is stuck in processing. The embassy says “soon”, which is not a date.',
      'Everyone’s visa for {event} came back except {player}’s. The application is “under additional review”.',
      'One of our starters is still waiting on a visa for the international trip, and the flights are booked. Logistics needs a decision.',
    ],
    options: {
      expedite: {
        label: 'Pay to expedite', hint: 'Costs money · likely on time',
        outcome: [
          'We paid {amount} for expedited processing. The embassy now promises an answer within days.',
          'Expedited processing booked. Logistics is cautiously optimistic.',
        ],
      },
      lawyer: {
        label: 'Hire an immigration lawyer', hint: 'Costs more · safest bet',
        outcome: [
          'An immigration lawyer has taken the case and already found a missing form. Expensive, but reassuring.',
          'The lawyer is on it, with daily calls to the embassy. If anyone can speed this up, it’s her.',
        ],
      },
      wait: {
        label: 'Wait', hint: 'Free · risk of arriving late',
        outcome: [
          'You decided to wait it out. {player} refreshes the application status every twenty minutes.',
          'No extra spending. Fingers crossed the paperwork moves on its own.',
        ],
      },
    },
    follow: {
      visa_ok: {
        subject: ['Visa approved!', '{player} is cleared to travel', 'Good news from the embassy'],
        body: [
          '{player}’s visa came through. The whole squad flies out together as planned.',
          'Approved! The paperwork is done and the full roster travels on schedule.',
        ],
      },
      visa_late: {
        subject: ['Visa delayed — late arrival', '{player} will arrive late', 'Visa approved, but late'],
        body: [
          '{player}’s visa finally came through, but they will arrive {days} days after the rest of the team. They’ll practise remotely until then.',
          'The visa is approved, just not in time: our player lands {days} days late. The coaches are reworking the bootcamp schedule.',
          'Approved, but late. One of our starters will miss the first part of the bootcamp and join the team on arrival.',
        ],
      },
    },
    news: {
      headline: ['Visa delay hits {team} before {event}', '{short} star waiting on visa'],
      body: [
        'One of {team}’s players is still waiting for a visa ahead of the trip. The club says it is working with the authorities.',
        'Paperwork trouble for {short}: a starter’s visa is under additional review ahead of international play.',
      ],
    },
    world: {
      headline: ['{player}’s visa for {event} delayed', 'Visa trouble for {team}', '{team} star may arrive late'],
      body: [
        '{team} say {player}’s visa for {event} is still under review. The club hopes for a decision soon.',
        'Visa issues could see a {team} starter arrive late for international play.',
        'A paperwork delay has left {short} scrambling to adjust travel plans.',
      ],
    },
  },

  // ------------------------------------------------------------------ noise complaint
  noise_complaint: {
    from: ['House manager', 'Team manager', 'Legal counsel'],
    subject: ['Neighbours are complaining', 'Noise complaint (again)', 'A letter from next door'],
    body: [
      'The neighbours have filed a complaint about shouting from the gaming house at 3am. Apparently “BARON BARON BARON” carries through walls.',
      'A polite but firm letter from next door: late-night scrim comms are keeping their kids awake. The city has been copied in.',
      'Noise complaint number three this month. The neighbours have started recording the late-night solo queue screams.',
    ],
    options: {
      soundproof: {
        label: 'Soundproof the rooms', hint: 'Costs money · problem solved',
        outcome: [
          'We spent {amount} on acoustic panels and new windows. The neighbours sent a thank-you note.',
          'The practice rooms are soundproofed. The players can now scream about dragons in peace.',
        ],
      },
      curfew: {
        label: 'Impose a curfew', hint: 'Free · players grumble',
        outcome: [
          'Quiet hours from midnight. The players complained — quietly.',
          'A curfew is in place. Solo queue grinders are not thrilled, but the street is.',
        ],
      },
      ignore: {
        label: 'Ignore it', hint: 'Free · risk of a fine',
        outcome: [
          'No change. Last night’s Baron call was heard three houses down.',
          'You let it slide. The neighbours have started a group chat about us.',
        ],
      },
    },
    follow: {
      fined: {
        subject: ['The city fined us', 'Noise fine', 'Penalty notice from the city'],
        body: [
          'After more complaints, the city has fined the club {amount} for repeated late-night noise. The neighbours reportedly celebrated — quietly.',
          'The council has issued a fine for noise at the gaming house. The house manager is pricing up acoustic panels.',
        ],
      },
    },
    news: {
      headline: ['Neighbours complain about {team} gaming house', '{short} gaming house too loud, say neighbours'],
      body: [
        'Residents near the {team} gaming house have complained about late-night shouting during practice.',
        'Neighbours of {short} say they can hear every Baron call. The club says it is working on it.',
      ],
    },
    world: {
      headline: ['{team} gaming house hit with noise complaints', 'Neighbours vs {short}: the Baron call heard round the block', '{team} told to keep it down'],
      body: [
        'Residents near the {team} gaming house have filed noise complaints about late-night scrim comms.',
        'One neighbour claims to now know the {short} jungle pathing by heart from the shouting alone.',
        '{team} have promised to turn it down after neighbours complained about 3am solo queue sessions.',
      ],
    },
  },

  // ------------------------------------------------------------------ hacked account
  account_hacked: {
    from: ['Social media manager', 'PR manager', 'IT support'],
    subject: ['{player}’s account was hacked', 'Hacked account posting nonsense', 'Someone got into an account'],
    body: [
      '{player}’s social account was hacked overnight and posted crypto links, a lasagne recipe and a declaration that support is the only real role. The player is locked out.',
      'Someone took over one of our players’ accounts and spent three hours posting nonsense and replying to rival fans. We have it back, but screenshots are forever.',
      '{player}’s account announced a retirement, then a comeback, then a new career in competitive cooking — all within an hour. It wasn’t them.',
    ],
    options: {
      statement: {
        label: 'Official statement', hint: 'Free · clears up confusion',
        outcome: [
          'The club confirmed the account was compromised and asked fans not to click any links. Confusion cleared.',
          'Statement out: it wasn’t {player}, and no, they are not retiring to make lasagne.',
        ],
      },
      audit: {
        label: 'Security audit', hint: 'Costs money · all accounts secured',
        outcome: [
          'Every player and staff account now has two-factor authentication and a password that isn’t their main champion’s name.',
          'The audit found four more weak passwords. All fixed. Better now than during {event}.',
          'The security audit locked down every club account. IT is very proud and slightly smug.',
        ],
      },
      joke: {
        label: 'Joke about it', hint: 'Free · fans laugh, slightly risky',
        outcome: [
          'The club replied “support IS the only real role, the hacker had a point”. Fans loved it.',
          'We posted the lasagne recipe properly, with credit to “our new social media intern”. It went viral.',
        ],
      },
    },
    news: {
      headline: ['{team} player’s account hacked', '{short} social account compromised'],
      body: [
        'A {team} player’s social media account was taken over overnight and posted a stream of nonsense before being recovered.',
        '{short} confirmed a player’s account was hacked and urged fans not to click any links it shared.',
      ],
    },
    world: {
      headline: ['{player}’s account hacked, posts 400 emojis', 'Hacker takes over {team} player’s socials', '{short} account hijacked overnight'],
      body: [
        '{player}’s social account was hacked and spent the night announcing a retirement. {team} say it’s back under control.',
        'A {team} player’s account posted crypto links and hot takes before the club recovered it.',
        '{short} have tightened account security after one of their players was hacked.',
      ],
    },
  },

  // ------------------------------------------------------------------ charity stream (positive)
  charity_stream: {
    from: ['Community manager', 'Partnerships', 'PR manager'],
    subject: ['Charity stream request', 'A 12-hour stream for a good cause', 'Can the team help a charity?'],
    body: [
      'A children’s hospital charity has asked whether the team would do a 12-hour charity stream. They’d handle the donation page; we’d bring the players and the chaos.',
      'A local food bank wants to partner with the squad on a 12-hour charity marathon. Great cause, but it eats a full practice day.',
      'We’ve been asked to headline a charity stream: 12 hours, the whole roster, every donation goal unlocking a new challenge.',
    ],
    options: {
      stream: {
        label: 'Do the stream', hint: 'Lose a practice day · fans love it',
        outcome: [
          'Twelve hours, one off-role tournament and a support player in a chef’s hat later, the stream raised a fantastic total. Fans loved every minute.',
          'The charity stream was a triumph. {player} did a full game blindfolded for the final donation goal.',
        ],
      },
      donate: {
        label: 'Donate instead', hint: 'Costs money · goodwill',
        outcome: [
          'The club donated {amount} directly. The charity was grateful, and fans noticed.',
          'We made a donation instead of streaming. Quieter, but genuinely appreciated.',
        ],
      },
      decline: {
        label: 'Decline politely', hint: 'Free · missed goodwill',
        outcome: [
          'We declined, citing the practice schedule. The charity understood; some fans were disappointed.',
          'Polite no. Practice stays on track.',
        ],
      },
    },
    news: {
      headline: ['{team} host 12-hour charity stream', '{short} stream for a good cause'],
      body: [
        '{team} players went live for 12 hours to raise money for charity, with donation goals unlocking increasingly silly challenges.',
        'The {short} roster swapped scrims for a charity marathon, and the community showed up.',
      ],
    },
    world: {
      headline: ['{team} raise thousands in charity marathon', '{player} streams 12 hours for charity', '{short} give back with charity stream'],
      body: [
        '{team} spent 12 hours live for a children’s hospital charity. The donation total beat the target twice.',
        '{player} played a full game blindfolded to unlock the final donation goal of {team}’s charity stream.',
        'The {short} roster swapped scrims for a charity marathon, and the community showed up in force.',
      ],
    },
  },

  // ------------------------------------------------------------------ tampering accusation
  tampering: {
    from: ['Legal counsel', 'Team manager', 'League operations'],
    subject: ['{oppShort} accuse us of tampering', 'Tampering complaint filed', 'A letter from the league'],
    body: [
      '{oppShort} have filed a complaint claiming our staff approached one of their contracted players. The league has asked for our side.',
      'A tampering accusation has landed: {oppShort} say we contacted one of their starters without permission. It’s all over the rumour accounts.',
      'Another club has accused us of tampering with one of their players. The league wants a response within the week.',
    ],
    options: {
      deny: {
        label: 'Deny it, let the league look', hint: 'Free · risky if contact was made',
        outcome: [
          'We denied the claim and handed over our communications. The league will rule shortly.',
          'Our position is clear: no improper contact. The league is reviewing the case.',
        ],
      },
      withdraw: {
        label: 'Withdraw interest', hint: 'Lose the target · issue goes away',
        outcome: [
          'We formally withdrew any interest in the player. {oppShort} dropped the complaint the same afternoon.',
          'Interest withdrawn. The complaint went away, and so did the transfer target.',
        ],
      },
      apologise: {
        label: 'Apologise privately', hint: 'Free · smooths things over',
        outcome: [
          'A private call to their management cleared the air. The complaint was quietly withdrawn.',
          'You apologised for any misunderstanding. Relations are frosty but civil.',
        ],
      },
    },
    follow: {
      fined: {
        subject: ['League ruling: fined', 'Tampering verdict', 'We’ve been fined'],
        body: [
          'The league ruled that contact was made too early and fined the club {amount}. No further sanctions.',
          'Verdict in: the league says our approach broke the rules and issued a fine. The case is closed.',
        ],
      },
      dismissed: {
        subject: ['Tampering case dismissed', 'League ruling: no case', 'Cleared of tampering'],
        body: [
          'The league found no evidence of improper contact and dismissed the complaint. Case closed.',
          'Dismissed. The league says the accusation wasn’t supported, and {oppShort} have gone quiet.',
        ],
      },
    },
    news: {
      headline: ['{team} accused of tampering', 'League looks into tampering claim against {short}'],
      body: [
        '{team} have been accused by a rival club of approaching one of its contracted players. {team} deny wrongdoing.',
        'The league is reviewing a tampering complaint involving {short}. The club says it acted within the rules.',
      ],
    },
    world: {
      headline: ['{team} accused of tampering', 'Tampering complaint lands on {short}', 'Rival club points finger at {team}'],
      body: [
        'A rival club has accused {team} of approaching one of its contracted players. {team} deny any wrongdoing.',
        'The league is reviewing a tampering complaint involving {team}. No ruling has been made.',
        '{short} say a tampering accusation against them is “a misunderstanding” and expect it to be dismissed.',
      ],
    },
  },

  // ------------------------------------------------------------------ fan meet overcrowding
  fan_meet_chaos: {
    from: ['Event manager', 'Community manager', 'Head of security'],
    subject: ['Fan meet in {city} got out of hand', 'Overcrowding at the fan meet', 'Fan meet safety incident'],
    body: [
      'The fan meet in {city} drew three times the expected crowd. People were pressed against the barriers and we had to stop the signing early; a few minor injuries were treated on site.',
      'Yesterday’s fan meet was dangerously overcrowded: the venue let far too many people in and the doors became a bottleneck. Thankfully nobody was seriously hurt.',
      'Our fan meet had to be cut short after the crowd got dangerously packed. Fans are posting videos, and they are not happy.',
    ],
    options: {
      refund: {
        label: 'Apologise and refund', hint: 'Costs money · fans appeased',
        outcome: [
          'Everyone who bought a ticket is getting a full refund — {amount} in total — plus a signed photo in the mail.',
          'We apologised and refunded every ticket. The replies turned from anger to “at least they owned it”.',
        ],
      },
      security: {
        label: 'Promise proper security', hint: 'Free now · reputation on the line',
        outcome: [
          'The club promised capped tickets, proper barriers and trained stewards at every future event. Fans will hold us to it.',
          'We published a new event-safety plan. It’s a promise — the next fan meet will be the test.',
        ],
      },
      venue: {
        label: 'Blame the venue', hint: 'Free · fans may not buy it',
        outcome: [
          'Our statement put the blame on the venue’s door policy. Some fans agreed; many said it was our event.',
          'The club pointed at the venue. The venue pointed back. Fans are pointing at both.',
        ],
      },
    },
    news: {
      headline: ['{team} fan meet overcrowded', 'Safety questions after {short} fan meet'],
      body: [
        'A {team} fan meet was cut short after the crowd grew far beyond capacity. Several minor injuries were treated on site.',
        'Fans have criticised the organisation of a {short} event where the venue became dangerously packed.',
      ],
    },
    world: {
      headline: ['{team} fan meet in {city} cut short', 'Overcrowding at {team} fan event', 'Safety concerns after {short} fan meet'],
      body: [
        'A {team} fan meet was halted after far more fans arrived than the venue could safely hold. No serious injuries were reported.',
        'Fans waiting to meet {player} were caught in a packed crowd at a {team} event, prompting calls for better security.',
        '{short} have apologised after a fan event became dangerously overcrowded.',
      ],
    },
  },
};

// ------------------------------------------------------------------ fan posts
export const DRAMA_FAN_META: Record<string, { s: number; tag: string; harsh?: boolean }> = {
  drama_stalker_van: { s: 1, tag: 'RespectPrivacy' }, drama_van_gone: { s: 1, tag: 'GoodRiddance' },
  drama_cheat_allegation: { s: -1, tag: 'Handcam' }, drama_cleared: { s: 2, tag: 'Cleared' }, drama_minor: { s: -1, tag: 'AccountSharing' },
  drama_crazy_fan: { s: 0, tag: 'Boundaries' }, drama_stage_invader: { s: 1, tag: 'StageInvader' }, drama_leaked_scrims: { s: -1, tag: 'Leaked' },
  drama_tell_all: { s: -1, tag: 'TellAll', harsh: true }, drama_food_poisoning: { s: -1, tag: 'BadTakeout' }, drama_internet_outage: { s: 0, tag: 'PCBangArc' },
  drama_viral_meme: { s: 1, tag: 'MemeOfTheWeek' }, drama_fan_petition: { s: -1, tag: 'BenchPetition', harsh: true }, drama_celebrity_fan: { s: 2, tag: 'CelebFan' },
  drama_rival_trashtalk: { s: 0, tag: 'TrashTalk' }, drama_aged_well: { s: 2, tag: 'AgedLikeWine' }, drama_aged_badly: { s: -2, tag: 'AgedLikeMilk', harsh: true },
  drama_visa_issue: { s: -1, tag: 'VisaWoes' }, drama_noise_complaint: { s: 0, tag: 'BaronBaronBaron' }, drama_account_hacked: { s: 0, tag: 'Hacked' },
  drama_charity_stream: { s: 2, tag: 'CharityStream' }, drama_tampering: { s: -1, tag: 'Tampering' }, drama_fan_meet_chaos: { s: -1, tag: 'FanMeet' },
};

export const DRAMA_FAN: Record<string, FanTemplates> = {
  drama_stalker_van: {
    diehard: ['Whoever is in that van outside the {short} house: go home. Let the players live.', 'Players need to feel safe where they sleep. Full support to {team} on this.', 'Being a fan means respecting boundaries. That van is not fandom.'],
    wholesome: ['Sending love to the {short} players. Nobody deserves to feel watched at home 💙', 'Please don’t share the house address, everyone. Protect the players.'],
    casual: ['wait someone’s been parked outside their house filming?? that’s seriously not ok', 'just saw the van thing. hope the {short} guys are alright'],
    memer: ['the van owner’s ratio is the biggest L of the season', 'whoever owns that van has been perma-banned from the community, no appeal'],
    rival: ['I can’t stand {short} but this is genuinely creepy. Leave them alone.', 'Rivalry ends at the front door. Respect to the {short} players.'],
    analyst: ['Players who don’t feel safe at home don’t play well on stage. This is a performance issue too, and {team} should treat it as one.', 'Every league should have a gaming-house privacy policy by now. This keeps happening.'],
    intl: ['Even from abroad this looks scary. Hope the club handles it properly.', 'Gaming-house privacy should be a league-wide rule. Stay safe {short}.'],
    insider: ['Heard the staff have been logging the van for days. The club is taking this seriously.', 'Sources say {short} have asked the league for advice on gaming-house security.'],
  },
  drama_van_gone: {
    diehard: ['Van gone. Curtains open. Let’s get back to winning, {short}.', 'Good riddance to the van. The players can finally breathe.'],
    wholesome: ['So relieved for the {short} players 🥹 Enjoy the sunshine at home!', 'The house is safe again. That’s all that matters.'],
    memer: ['the van has left the server', 'van.exe has stopped working 🙏'],
    casual: ['glad the van thing is over, that was creepy', 'nice, hope the players feel better now'],
    insider: ['Hearing the players actually ate breakfast outside this week. Small wins.', 'Sources say security will stay on site for a while, just in case.'],
    analyst: ['Watch {short}’s form now that the house feels safe again. Off-Rift stress shows up in the macro.', 'Removing that distraction is worth more than any patch buff.'],
  },
  drama_cheat_allegation: {
    diehard: ['{player} is just cracked. Some people can’t accept it.', 'A slowed-down clip with red circles is not evidence. {short} stand with {player}.', 'Imagine being so good they accuse you of scripting. Ultimate compliment.'],
    analyst: ['Watched the “suspicious” dodges frame by frame. It’s reaction time plus wave reading — nothing inhuman. No evidence of anything.', 'Ghosting claims ignore the broadcast delay. These accusations don’t hold up.'],
    memer: ['{player} so good the internet thinks they’re a bot', 'the red circles in that clip are doing a LOT of heavy lifting', 'my scripts must be broken because I still miss every skillshot'],
    toxic: ['A hand-cam stream would end this in one night. Just do it.', 'The club’s silence isn’t helping. Address it properly.'],
    rival: ['Not saying anything. Just would love to see that hand-cam 👀', 'Wild how many “clean” clips are coming out of {short} lately. Show the hand-cam and we’ll talk.'],
    wholesome: ['Accusing a player without evidence is so unfair. Hang in there {player} 💙', 'Remember there’s a real person reading all this. Be kind until there’s actual proof.'],
    casual: ['is the cheating thing real or just drama? seems like no one has proof', 'saw a clip, looked like a normal good dodge to me tbh'],
    insider: ['Hearing {short} are ready to cooperate with any league review. Nothing to hide.', 'Sources say the streamer behind the clip has been asked for evidence and hasn’t provided any.'],
  },
  drama_cleared: {
    diehard: ['CLEARED. {player} was always just that good. Apologies accepted in the replies.', 'The league confirmed it. Now let’s talk about how many people owe {player} an apology.'],
    wholesome: ['So happy for {player}. That must have been a stressful few weeks 🥹', 'Cleared and still smiling. Class act.'],
    memer: ['the accusers going private one by one', 'red circle guy deleting his whole channel arc'],
    analyst: ['As expected, the review found nothing. A good reminder: a slowed-down clip is not evidence.', 'Cleared players usually come back stronger. Expect {player} to play with a chip on their shoulder.'],
    rival: ['Ok fine, {player} is clean. Still beating you though.', 'Fair enough, case closed. Respect.'],
    casual: ['so it was nothing? lol the internet', 'glad that’s settled, the drama was exhausting'],
    toxic: ['Cleared, good. Now the club should go after whoever started it.', 'The streamer who started this owes an apology. Loudly.'],
  },
  drama_minor: {
    analyst: ['To be clear: no scripts, no cheating. Account sharing in solo queue is a rules breach, not a competitive one. Small fine, fair outcome.', 'Account sharing is a common shortcut and still against the rules. A warning feels proportionate.'],
    diehard: ['Not cheating, just dumb. Pay the fine, learn the lesson, move on {short}.', 'The scripting claims were nonsense. The account-sharing thing is a slap on the wrist. Fine.'],
    memer: ['investigators: we found no scripts. also investigators: who was playing on your account at 4am', 'the most anticlimactic plot twist in esports'],
    toxic: ['Sloppy. Professionals shouldn’t be giving out their accounts. Do better.', 'Small fine, but it’s embarrassing for the club.'],
    rival: ['Not cheating, but not exactly squeaky clean either 😏', 'Imagine getting cleared of scripting and fined for account sharing.'],
    wholesome: ['A mistake, owned and dealt with. Everyone moves on 💙', 'Lesson learned, fine paid. Back to cheering 💙'],
    casual: ['so they weren’t cheating, just shared an account? that’s kinda minor right', 'so the big cheating story ended with a small fine for account sharing? anticlimactic'],
  },
  drama_crazy_fan: {
    diehard: ['Supporting a player means respecting their space. Leave {player} alone outside of matches.', 'The {short} players give so much to fans. The least we can do is respect boundaries.'],
    wholesome: ['Please remember players are people. Cheer loud at matches, give them peace at home 💙', 'Hope {player} feels safe. Nobody should be followed to dinner.'],
    casual: ['dozens of letters a DAY? that’s way too much', 'yeah this needs to stop, that’s not normal fan behaviour'],
    analyst: ['Clubs need clear protocols for this. Player welfare off the Rift matters as much as practice hours.', 'Most clubs handle this badly by waiting too long. Early, calm intervention is the right call.'],
    rival: ['Different team, same message: leave the players alone off stage.', 'I’d boo {short} all day at the arena, but following a player around town crosses a line.'],
    intl: ['Fans abroad would love to meet {player} too — at a signing, not at their house.', 'Hope {team} handles this well. Stay safe.'],
    insider: ['Security has reportedly been briefed. The club is treating it carefully.', 'Sources say the staff want this handled quietly and kindly, before it escalates.'],
  },
  drama_stage_invader: {
    memer: ['security doing an any% speedrun of failing their job', 'that fan had better movement than half the jungle pool', 'the hug heard around the world'],
    diehard: ['Wrong, but I understand the emotion. That win was huge.', 'That’s how much {short} mean to people. Now stay behind the barrier, please.'],
    analyst: ['Funny clip, real issue. Event security needs to be better; next time it might not be a friendly fan.', 'Barrier height, steward placement, response time — all of it failed. The league needs a proper review.'],
    toxic: ['Who was running security? Embarrassing for the league and the club.', 'Fines for the club because one fan got excited. Great.'],
    wholesome: ['{player} just laughed and hugged back. Wholesome chaos 😭', 'Nobody was hurt and it was pure joy. Glad everyone’s okay.'],
    casual: ['lmao did someone actually run on stage', 'the security guard’s face though'],
    rival: ['Typical {short} fans, can’t even celebrate normally.', 'Our fans would never. (Our fans absolutely would.)'],
  },
  drama_leaked_scrims: {
    analyst: ['If those draft notes are real, {short}’s priority list explains a lot about their recent games.', 'The leak gives opponents a window, not a playbook. Smart teams adapt within a week.'],
    memer: ['the leaked comms are funnier than any stream this year', 'opposing analysts reading {short}’s notes like it’s Christmas'],
    doomer: ['Great, now everyone knows our strats. Playoffs are over before they start.', 'Of course we have a leak. Of course.'],
    toxic: ['Who has access to that drive? Clean house, {short}.', 'How does a pro club leak its own scrims? Amateur hour.'],
    insider: ['Hearing the leak came from an old login nobody revoked. Basic stuff.', 'Sources say the coaches are rebuilding the whole draft plan.'],
    rival: ['Thanks for the notes, {short}. Very educational.', 'Already studied the leaked priority list. Very predictable.'],
    diehard: ['Leak or no leak, our players still have to be beaten on stage.', 'Rebuild, adapt, win anyway. That’s the {short} way.'],
  },
  drama_tell_all: {
    analyst: ['A former player’s perspective matters, but it’s one side. The truth is usually somewhere in between.', 'Long hours and hard reviews are normal in pro play. The question is whether players feel supported.'],
    doomer: ['If even half of this is true, it explains the results.', 'This is why players don’t want to sign with {short}.'],
    toxic: ['The club has some explaining to do. Silence won’t cut it.', 'Management needs to answer this, not hide behind a statement.'],
    diehard: ['One unhappy ex-player doesn’t define {team}. Current players seem happy.', 'There are two sides to every story. Let’s hear the club’s.'],
    memer: ['the podcast host’s face when the stories kept coming', 'clip farmers eating good this week'],
    insider: ['Hearing current players aren’t happy about the interview at all. Different picture inside.', 'Sources say the club disputes several specific claims.'],
    rival: ['Not surprised. Heard the same rumours for years.', 'At least our org doesn’t have former players making podcasts about us.'],
    casual: ['that interview was a lot. no idea who to believe tbh', 'kinda feels like every pro team has stories like this?'],
  },
  drama_food_poisoning: {
    memer: ['the takeout gank nobody saw coming', 'food poisoning is the only thing that’s beaten {short} this month', 'new champion just dropped: Mystery Seafood'],
    doomer: ['Match week and the team is sick. Of course.', 'This is going to be an excuse for a loss, I can feel it.'],
    wholesome: ['Get well soon {short}! Lots of water and rest 💙', 'Hope everyone feels better before the match.'],
    analyst: ['Losing two practice days before match week will show up in coordination. Watch the early game.', 'Recovery takes a few days. Expect slower reactions in the first game back.'],
    diehard: ['Even sick, I back these players over anyone. Get well and get the W.', 'Sick or not, {short} will show up. They always do.'],
    toxic: ['Pro club, ordering from random places before match week. Hire a chef.', 'Excuses ready before the match even starts. Classic.'],
    casual: ['oof, hope they’re ok, food poisoning is the worst', 'name the restaurant so I never order there'],
  },
  drama_internet_outage: {
    memer: ['the PC bang arc is the best content {short} has ever made', 'pro team, 180 ping, zero excuses', 'regulars at that PC bang just got free coaching'],
    casual: ['wait the pro team is playing at a PC bang? that’s kinda awesome', 'imagine sitting next to {player} at an internet café'],
    analyst: ['A few days of lost scrims is manageable. Two weeks would hurt.', 'A PC bang is fine for solo queue, bad for structured scrims. The bootcamp hotel is the pro move.'],
    doomer: ['Can’t even keep the internet running. Season over.', 'Watch us lose and blame the router.'],
    wholesome: ['Love that they’re making the best of it. Grind never stops 💙', '{short} players taking photos with the PC bang regulars is so sweet 🥹'],
    diehard: ['Hotspot, PC bang, carrier pigeon — {short} will find a way.', 'No internet, no problem. These players would scrim on a toaster.'],
    insider: ['Hearing the provider says it’ll be fixed “soon”. Nobody believes that.', 'Sources say the club is pricing up a bootcamp hotel if the outage drags on.'],
  },
  drama_viral_meme: {
    memer: ['{player} flashing into the wall is my new ringtone', 'this meme will outlive the patch', 'I have watched this clip 40 times and it gets funnier every time'],
    diehard: ['One clip doesn’t erase a season of carrying. Leave {player} alone.', 'Laugh at the meme, then watch {player} pop off next week.'],
    wholesome: ['{player} laughing at the meme themselves is the best part 😭', 'Every pro has a blooper. This one is just extra funny.'],
    toxic: ['It’s funny until it happens in a final.', 'Less meme, more practice.'],
    rival: ['We’ll be spamming this emote all match, {short}.', 'Our fans made the best edit of it, not even close.'],
    casual: ['I don’t even watch LoL but I’ve seen this meme five times today', 'ok that clip is genuinely hilarious'],
    analyst: ['Ironically, meme moments grow fanbases. This is good for {short}’s reach.', 'Look past the meme: that flash was a reasonable read on a bad angle. Unlucky, not clueless.'],
  },
  drama_fan_petition: {
    toxic: ['Signed. Form is form. Something has to change.', 'If the stats say bench, bench.'],
    diehard: ['Petitions don’t win games. Back the players through the rough patch.', 'I’ll never sign a petition against one of our own. Form comes back.'],
    analyst: ['The stats behind the petition are cherry-picked. The bigger problem is the team’s mid-game, not one player.', 'Benching for a slump can wreck confidence. There’s a middle ground.'],
    wholesome: ['Imagine reading a petition about yourself. Be kind, everyone 💙', 'Slumps happen. Let’s cheer louder, not sign louder.'],
    doomer: ['Bench, don’t bench, we’re losing anyway.', 'Petition or not, the problems are bigger than one player.'],
    memer: ['10k signatures and 9k of them are rival fans', 'petition to petition the petition'],
    rival: ['Signed it twice. Keep them in, actually.', 'Please keep that starter in. Asking for a friend.'],
    casual: ['is it really that bad? feels like a lot', 'didn’t know you could petition a bench lol'],
  },
  drama_celebrity_fan: {
    memer: ['{celeb} in a {short} jersey wasn’t on my bingo card', '{celeb} fans asking “what is a jungler” is my new favourite thing', '{short} just gained more followers in a day than in a year'],
    diehard: ['Welcome to the family, {celeb}! Bandwagon fans welcome, real fans forever.', 'Even the stars know {short} is the team to back.'],
    casual: ['wait {celeb} watches LoL??', 'ok I came here from {celeb}’s post, what’s happening'],
    wholesome: ['Love seeing new fans join! Welcome everyone 💙', 'Somebody teach the new fans what Baron is, please, with love.'],
    rival: ['Celebrity fans don’t win games. Just saying.', 'Cool jersey. Still lost last split.'],
    insider: ['Hearing the marketing team is already talking collab.', 'Sources say a visit to the gaming house is already being discussed.'],
    analyst: ['A celebrity bump is huge for sponsorship value. Smart clubs turn this into partnerships.', 'Follower spikes fade fast. The club needs content ready to keep the new audience.'],
  },
  drama_rival_trashtalk: {
    diehard: ['Free win? We’ll see on the Rift. {short} don’t talk, they play.', 'Save the clip. We’re going to need it after the match.'],
    memer: ['{oppShort} writing checks their botlane can’t cash', 'the pre-match trash talk to post-match silence pipeline'],
    rival: ['{oppShort} only said what everyone is thinking.', 'Free win confirmed. Sorry not sorry.'],
    analyst: ['Trash talk aside, the matchup is closer than either fanbase thinks. Draft will decide it.', 'Hype games tend to get chaotic. Expect early skirmishes and a lot of risk-taking.'],
    toxic: ['If we lose after this, it’s going to be unbearable.', 'Respond on the Rift, not on socials. Please.'],
    casual: ['oh this match just got spicy', 'wasn’t gonna watch but now I have to'],
    doomer: ['They talk because they know they’ll win. Pain incoming.', 'We’ll lose and the clip will be everywhere. Book it.'],
  },
  drama_aged_well: {
    diehard: ['Free win with a nice logo, huh? {short} SAID HELLO.', 'Receipts posted. Who’s talking now?'],
    memer: ['{oppShort}’s pre-match clip is now a {short} fan favourite', 'aged like fine wine (for us) and milk (for them)', 'quote tweet speedrun any%'],
    wholesome: ['Let the play do the talking. That’s how it’s done 💙', 'Respect to {oppShort} for the game, but tonight belongs to {short} 💙'],
    rival: ['Fine. One game. Don’t get used to it.', 'We’ll get you next time. Probably.'],
    casual: ['lol the trash talk really backfired', 'that’s the most satisfying result of the week'],
    analyst: ['Pressure turned into focus. {short} played their cleanest game in weeks.', 'They didn’t chase the noise. Patient early game, clean objective setups.'],
  },
  drama_aged_badly: {
    toxic: ['All that talk and we got rolled. Embarrassing.', 'Maybe win before firing back next time.'],
    doomer: ['I knew it. I said it. Nobody listened.', 'The clips are going to haunt us for months.'],
    memer: ['{oppShort} fans have a new favourite clip and it’s us', 'we got ratioed in real life'],
    rival: ['Free win. Like we said.', 'Nice logo though.'],
    diehard: ['Painful, but we go again. Remember this feeling next time.', 'I’ll take the jokes. We’ll be back.'],
    analyst: ['The pre-match noise clearly got to the team. Too aggressive early, no patience.', 'Getting baited by the hype costs games. Lesson for next time.'],
    wholesome: ['Tough loss. Still proud of the effort, chin up {short}.', 'Win or lose, we stick together. Next one, {short}.'],
  },
  drama_visa_issue: {
    doomer: ['A starter missing the start of {event}. Perfect.', 'Visa problems every single year. How?'],
    diehard: ['Come on embassy, let {player} play!', 'We’ll hold the fort until our player arrives.'],
    analyst: ['Losing scrim time with the full roster before {event} hurts synergy more than people think.', 'Remote practice is fine for mechanics, not for comms.'],
    memer: ['the embassy is the toughest opponent {short} will face this year', 'paperwork diff'],
    wholesome: ['Hoping the visa comes through soon, {player}! The team needs you 💙', 'Sending patience to the logistics team 🙏'],
    intl: ['Visa systems hit every region. Hope they sort it.', 'Every year a team has visa trouble. It shouldn’t be this hard.'],
    toxic: ['How does a pro club not sort visas months in advance?', 'This is basic planning. Someone in logistics needs to answer for this.'],
  },
  drama_noise_complaint: {
    memer: ['the neighbours know the jungle pathing better than the analysts', 'BARON BARON BARON (heard three streets away)', 'neighbours have filed a report: too much hype'],
    casual: ['lol the neighbours vs {short} is the content I didn’t know I needed', 'can’t blame them, I’d be loud too'],
    wholesome: ['Hope they work it out with the neighbours! Maybe invite them to a match 💙', 'Soundproofing and a fruit basket for the neighbours. Problem solved 💙'],
    analyst: ['Loud comms are good comms. Maybe just not at 3am.', 'A curfew might actually help sleep schedules. Rested players make better calls.'],
    diehard: ['That’s what passion sounds like. Soundproof and keep screaming, {short}.', 'The neighbours should be honoured to hear future champions practise.'],
    toxic: ['Pro players shouting at 3am before match days? Discipline issue.', 'Fix it before the city does. Fines are wasted money.'],
  },
  drama_account_hacked: {
    memer: ['the hacker’s lasagne recipe actually slaps', '“support is the only real role” — the hacker, valid', 'best posts that account has ever made'],
    casual: ['wait that wasn’t really {player}? lol', 'thought the retirement post was real for a sec'],
    analyst: ['Clubs should run security audits every split. Two-factor is not optional anymore.', 'A compromised account can leak schedules and DMs. This is a bigger risk than the funny posts suggest.'],
    wholesome: ['Hope {player} gets everything back. Hackers are the worst.', 'Don’t click any links from that account, everyone!'],
    toxic: ['A pro club and nobody turned on two-factor? Come on.', 'Embarrassing. Lock everything down today.'],
    rival: ['Honestly the hacker had better takes than {short}’s social team.', 'Still the most entertaining {short} content this split.'],
    insider: ['Heard IT is now forcing two-factor on every club account.', 'Sources say recovery took hours because nobody had the backup codes.'],
  },
  drama_charity_stream: {
    wholesome: ['This is what esports is about. Proud of {short} 💙', 'Donated! Thank you {team} for doing this.', '12 hours for a good cause. Legends.'],
    diehard: ['{short} giving back. This is why I support this club.', 'Win or lose on the Rift, this is a win off it.'],
    memer: ['the blindfolded game was the best play of the season', 'donation goals unlocking chaos, peak content'],
    casual: ['didn’t know {short} did this, nice', 'tuned in for an hour, ended up staying for six'],
    rival: ['Respect to {short} for this one. Genuinely.', 'Can’t hate on a charity stream. Well done.'],
    analyst: ['Community work builds long-term fanbases. Great move by the club.', 'One lost practice day for this much goodwill is a great trade.'],
    intl: ['Watched from overseas and donated. Love to see it.', 'Caught the last three hours at 5am my time. Worth it.'],
  },
  drama_tampering: {
    insider: ['Hearing {short} deny any improper contact. It’s their word against {oppShort}’s.', 'Sources say the league wants a quick ruling on this.'],
    rival: ['Tampering accusations, classy. Hands off our players, {short}.', 'Every offseason there’s a {short} rumour like this.'],
    analyst: ['Tampering rules are vague in practice. Hard to see a big sanction either way.', 'Even an accusation can poison a transfer target’s relationship with both clubs.'],
    toxic: ['If this is true it’s embarrassing. If it isn’t, why are we in the headlines?', 'Management keeps putting us in these stories.'],
    diehard: ['Accused isn’t guilty. Trust the club until the league says otherwise.', 'Let the league look. We’ve got nothing to hide.'],
    memer: ['the DM screenshots era of esports', '{oppShort} filing complaints faster than they take objectives'],
    doomer: ['Fine incoming, I can feel it.', 'Even if we’re cleared, the target won’t sign with us now.'],
  },
  drama_fan_meet_chaos: {
    toxic: ['Who planned this? Fans could have been seriously hurt.', 'Selling way more tickets than the venue can hold is unacceptable.'],
    diehard: ['I was there. It was scary. The club needs to do better next time.', 'We love {short}, but our safety has to come first.'],
    wholesome: ['Hope everyone who was there is okay 💙', 'Glad nobody was seriously hurt. Take care of each other at events.'],
    analyst: ['Crowd management is basic event planning. Capped tickets and trained stewards should be standard.', 'Ticket caps, staggered entry and clear exits. None of it was there.'],
    casual: ['saw the videos, that looked really scary', 'hope they refund people, that’s rough'],
    intl: ['Planned to travel for the next fan meet. Hoping it’ll be safer.', 'Fans travel a long way for these events. They deserve to feel safe.'],
    doomer: ['First on the Rift, now off it. Can’t do anything right.', 'Next fan meet will be online-only, watch.'],
    insider: ['Hearing the venue let in way over capacity. Club and venue are pointing fingers.', 'Sources say the club is reviewing every upcoming event.'],
  },
};

/** Fictional celebrities for `celebrity_fan` ({celeb}): singers, actors, athletes and streamers. */
export const CELEBS: string[] = [
  'Mira Sol', 'DJ Kaito', 'Juniper Hale', 'Tavi Okonkwo-Reyes', 'Rhea Montclair', 'Bastian Kroll', 'Lila Moreau',
  'Marco Valente', 'Odessa Wren', 'Theo Castellane', 'Ines Calder', 'Saffi Blue', 'MC Voltaire', 'Remy Ashgrove',
  'Priya Kestrel', 'Yaro Lindqvist', 'Captain Crumpet', 'Nadia Sunvale', 'Kenji Arashiro', 'Coco Marbury',
  'Felix Duvanel', 'Lumi Okada',
];
