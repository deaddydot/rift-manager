// Locker-room content: player replies to the manager's talks, player approaches (Inbox choices),
// teammate moments, team meetings and team-building scenes. {placeholders} are filled in people.ts;
// a line whose placeholder is missing is skipped, so every pool keeps some context-free lines.

export interface LineSet { pos: string[]; meh: string[]; neg: string[]; egoNeg?: string[]; fragileNeg?: string[]; proPos?: string[]; reveal?: string[]; negBadGame?: string[] }

// ------------------------------------------------------------------ talks (player page)
export const TALK_LINES: Record<string, LineSet> = {
  praise: {
    pos: [
      'Thanks, {coach}. Honestly, that means a lot coming from you.',
      'Appreciate it. I felt good out there — I want to keep it going.',
      'Ha, don’t make me blush. But yeah… I think I’m finding my rhythm.',
      'Thank you. I’ll keep grinding so you can say that again next week.',
      'That {kda} game felt good, not gonna lie.',
      'Means a lot. Some days you wonder if anyone notices the small stuff.',
      'Okay, now I’m hyped. Can we scrim right now?',
      'Thanks coach. I was nervous against {opp}, so that helps.',
      'I’ll screenshot this conversation for the bad days.',
    ],
    proPos: [
      'Thanks. I’ll note what worked and make it a habit.',
      'Appreciated. Let’s make sure it wasn’t a one-off.',
    ],
    meh: [
      'Thanks. We still have a lot to fix though.',
      'Cool. Is that all?',
      'Mm, thanks. I’ll take it.',
      'Yeah… thanks. Kind of hard to enjoy it right now.',
      'Sure, but the scoreboard is what counts.',
      'Thanks, coach. Can we talk about the draft instead?',
    ],
    neg: [
      'You said that yesterday too. It doesn’t really land anymore.',
      'Is this a pep talk or are you buttering me up for something?',
      'Thanks, I guess. Feels a bit hollow right now.',
      'Every time you say “good job” it means a little less, you know?',
    ],
    negBadGame: [
      'Praise? After that game? Come on, I know I was bad.',
      'Please don’t sugarcoat it. I’d rather hear what went wrong.',
      'I went {kda}, coach. You don’t have to pretend.',
      'Thanks, I guess. Feels a bit hollow right now.',
    ],
    egoNeg: [
      'I know I’m good. Tell me something I don’t know.',
      'Yeah, obviously. Maybe tell the others to keep up.',
    ],
  },
  encourage: {
    pos: [
      'Thanks, coach. I needed to hear that today.',
      'Okay… okay. One game at a time. I can do that.',
      'You really think so? Alright. I won’t let you down.',
      'That helps more than you know. My head’s been loud lately.',
      'Got it. Shake it off, play my game.',
      'Thanks. I’m gonna queue up and get my confidence back.',
      'I’ll remember this when it gets tough.',
      'You believing in me makes it easier to believe in myself.',
    ],
    meh: [
      'Yeah, I know. Doesn’t change much, but thanks.',
      'I’m fine, coach. Really.',
      'Sure. I’ll try.',
      'Thanks. Words are nice, results are better.',
      'Okay.',
    ],
    neg: [
      'I’m not a kid, coach. I don’t need a pep talk every day.',
      'Easy to say from the staff room.',
      'With respect, I don’t need cheering up. I need the team to play better.',
      'You keep telling me that. It’s starting to sound like a script.',
    ],
    egoNeg: [
      'Encouragement? I’m the last person on this team who needs it.',
      'Save it for the guys who are actually struggling.',
    ],
  },
  chat: {
    pos: [
      'Honestly? Pretty good. Thanks for asking — not every coach does.',
      'I’m alright. Sleeping better, queue’s going well. It’s nice to just talk.',
      'Good, good. The house has a nice vibe right now.',
      'Doing well! I’ve been trying a new routine — gym in the morning. Feels great.',
      'I’m okay. It’s nice to talk about something that isn’t the game for once.',
      'Thanks for checking in. I’m good — just tired from scrims.',
      'Not bad! My mom says hi, by the way. She watches every match.',
      'Pretty good. Been learning to cook, actually. Don’t ask how it’s going.',
    ],
    meh: [
      'Fine. Same as always.',
      'I’m okay. Nothing to report.',
      'Busy. Scrims, queue, sleep. You know.',
      'Uh, yeah, all good. Why?',
    ],
    neg: [
      'You asked me this already. I’m fine, okay?',
      'Is this a check-up? I’d rather just play.',
      'I don’t really want to talk right now.',
      'I’m fine. Can I go back to queue?',
    ],
    reveal: [
      '…Actually, can I be honest with you? There’s something I haven’t told anyone.',
      'Since you’re asking — no. Not really. There’s something going on.',
      'I wasn’t going to bring it up, but… things aren’t great right now.',
      'Okay. I trust you. There’s something I need to tell you.',
    ],
  },
  discuss: {
    pos: [
      'Thanks for listening. It helps to say it out loud.',
      'I feel a bit lighter. I didn’t realise how much I was carrying.',
      'That’s good advice. I’ll try that.',
      'Thank you for being patient with me. I’ll be okay.',
      'Talking to you helped more than I expected.',
      'You’re right. I can’t fix all of it, but I can fix some of it.',
    ],
    meh: [
      'Thanks. It’s still hard, but thanks.',
      'I know. It just takes time.',
      'Maybe. We’ll see.',
      'I appreciate it. Not sure there’s much anyone can do.',
    ],
    neg: [
      'I don’t want to talk about it again.',
      'No offence, but you don’t really get it.',
      'Can we drop it? Talking about it makes it worse.',
      'I’ll deal with it myself.',
    ],
  },
  expect: {
    pos: [
      'Understood. I’ll raise my level.',
      'Fair. I’ve been coasting a bit. Not anymore.',
      'You’re right. I want more from myself too.',
      'Good. I like knowing exactly what you want from me.',
      'Message received. Watch me this week.',
    ],
    meh: [
      'Okay. I’m already trying, though.',
      'Got it.',
      'I hear you.',
      'Sure. More pressure, great.',
    ],
    neg: [
      'I’m doing everything I can. What more do you want?',
      'Maybe look at the rest of the team before you single me out.',
      'Wow. Okay. Good to know where I stand.',
      'That’s a lot of pressure to put on one player.',
    ],
    egoNeg: [
      'Demand more? I’m carrying this team.',
      'With respect, I’m not the problem here.',
    ],
    fragileNeg: [
      '…Okay. Sorry. I’ll try harder.',
      'I didn’t know you were that disappointed in me.',
    ],
  },
  scold: {
    pos: [
      'Yeah. That was bad. I’ve already watched it back twice.',
      'You’re right. No excuses — I’ll fix it.',
      'Fair. I played scared. It won’t happen again.',
      'Thanks for being straight with me. I needed that.',
      'I deserved that. I {mistake} — that’s on me.',
      'Yeah, the {opp} series was ugly. I’ll own it.',
    ],
    meh: [
      'Yeah, I know. I was there.',
      'Okay. Noted.',
      'I get it. Can we move on?',
      'Not my best. Not my worst either.',
    ],
    neg: [
      'Seriously? I wasn’t even the problem in that series.',
      'Everyone played badly and I’m the one getting yelled at?',
      'You think I don’t know? I don’t need you rubbing it in.',
      'Wow. Thanks for the support.',
      'We’re doing this every time now? Great.',
    ],
    egoNeg: [
      'Maybe draft me something playable next time.',
      'I’m not taking the blame for that. Look at the jungle pathing.',
    ],
    fragileNeg: [
      '…Yeah. I know I’m letting everyone down.',
      'Sorry. I don’t know what’s wrong with me lately.',
    ],
  },
  tough: {
    pos: [
      'Understood. It won’t happen again.',
      'You’re right to call it out. I’ll be better.',
      'No excuses. I’ll own it in front of the team too.',
      'I respect that you didn’t let it slide.',
      'Got it. Line in the sand. I won’t cross it again.',
    ],
    meh: [
      'Okay, okay. I get it.',
      'Fine. It was one time.',
      'Noted.',
      'Yeah… sorry.',
    ],
    neg: [
      'You’re making a big deal out of nothing.',
      'Everyone does it. Why am I the example?',
      'Fine. Whatever you say, coach.',
      'Okay, I’ll just be a robot then.',
    ],
    egoNeg: [
      'Do you know how many people watch me? I’ll do what I want off the Rift.',
      'I’m the reason half these fans show up. Relax.',
    ],
    fragileNeg: [
      'I said I’m sorry… I feel terrible already.',
      'Please don’t tell the others.',
    ],
  },
  rest: {
    pos: [
      'Oh man, thank you. I’m going to sleep for twelve hours.',
      'I really needed this. I’ll come back sharper.',
      'Thanks coach. Gonna see my friends, touch some grass.',
      'A day off? You’re the best.',
      'Thanks. My hands have been aching — this helps.',
    ],
    meh: [
      'Okay. I’ll probably just queue at home anyway.',
      'Sure, I guess.',
      'Alright, a day off.',
    ],
    neg: [
      'A rest day? I’d rather practise. We’re not good enough to take days off.',
      'Am I being benched? Just tell me straight.',
      'I don’t want a day off, I want to fix my game.',
    ],
  },
  fine: {
    pos: [
      'Fair. I messed up. I’ll pay it.',
      'Understood. Rules are rules.',
      'Okay. I deserve it. It won’t happen again.',
    ],
    meh: [
      'Fine. Take it.',
      'Great. Love paying to work here.',
      'Okay.',
    ],
    neg: [
      'A fine? For that? Unbelievable.',
      'You’re seriously taking money from me over this?',
      'Fine. I’ll remember this when my contract’s up.',
      'What did I even do?',
    ],
    egoNeg: [
      'My agent is going to hear about this.',
      'Do you know what I bring to this team?',
    ],
  },
  promise: {
    pos: [
      'Really? Thank you. I’ll be ready.',
      'That’s all I wanted to hear. I’ll make it count.',
      'Okay. I’m going to hold you to that, coach.',
      'Thank you. I’ve been grinding scrims for this.',
    ],
    meh: [
      'Okay. We’ll see.',
      'I’ve heard that before, but alright.',
      'Fine. I’ll wait.',
    ],
    neg: [
      'Last time you promised something it didn’t happen.',
      'Words. Just put me in the lineup.',
      'I’ll believe it when I see my name on the starting sheet.',
    ],
  },
  mentor: {
    pos: [
      'Sure. {mate} reminds me of myself at that age.',
      'Happy to. I’ll show {mate} the stuff nobody told me.',
      'Of course. Good for me too — teaching makes you think.',
      'Yeah, I’ve noticed {mate} struggling. I’ll take them under my wing.',
    ],
    meh: [
      'Okay. If {mate} actually listens.',
      'Sure, I’ll try. I’m not a coach though.',
      'Alright. I’ll answer questions, at least.',
    ],
    neg: [
      'That’s what we pay coaches for, isn’t it?',
      'I have my own game to worry about.',
      'With {mate}? We don’t really get along.',
    ],
  },
  pairup: {
    pos: [
      'Duo with {mate}? Yeah, we’ve been talking about that anyway.',
      'Sounds fun. {mate}’s good company.',
      'Good idea. Our timings could use the reps.',
      'Bet. I’ll queue with {mate} tonight.',
    ],
    meh: [
      'Okay, sure. If {mate} wants to.',
      'Fine. We’ll give it a go.',
    ],
    neg: [
      'Me and {mate}? Really? Our styles don’t fit at all.',
      'I’d rather not. {mate} tilts me.',
      'Rooming with {mate}? Please no.',
    ],
  },
  mediate: {
    pos: [
      'Okay. We talked it out. Me and {mate} are good.',
      'Thanks for sitting us down. We should have done that weeks ago.',
      'I guess we both said some stupid things. We’re fine now.',
      'Handshake, hug, done. Back to work.',
    ],
    meh: [
      'We’ll be professional. Doesn’t mean we’re friends.',
      'It’s better. Not fixed, but better.',
      'Fine. I can work with {mate}.',
    ],
    neg: [
      'That made it worse. {mate} didn’t even apologise.',
      'I’m not sitting in a room with {mate} again.',
      'Waste of time. Some things don’t get fixed by a meeting.',
    ],
  },
};

/** Short-lived emotions after talks/events (shown as the player's mood). */
export const FEEL_INFO: Record<string, { label: string; color: string }> = {
  confident: { label: 'Confident', color: '#22c55e' },
  reassured: { label: 'Reassured', color: '#84cc16' },
  relieved: { label: 'Relieved', color: '#84cc16' },
  focused: { label: 'Focused', color: '#38bdf8' },
  fired: { label: 'Fired up', color: '#f0c674' },
  grateful: { label: 'Grateful', color: '#22c55e' },
  hopeful: { label: 'Hopeful', color: '#84cc16' },
  happy: { label: 'Happy', color: '#22c55e' },
  resentful: { label: 'Resentful', color: '#f97316' },
  angry: { label: 'Angry', color: '#ef4444' },
  hurt: { label: 'Hurt', color: '#f472b6' },
  betrayed: { label: 'Betrayed', color: '#ef4444' },
  ignored: { label: 'Ignored', color: '#f97316' },
  anxious: { label: 'Anxious', color: '#eab308' },
};

// ------------------------------------------------------------------ approaches (Inbox choices)
export interface ApproachTpl { subj: string[]; body: string[]; out: Record<string, string[]> }

export const APPROACH_T: Record<string, ApproachTpl> = {
  slump: {
    subj: ['Hey coach, got a minute?', 'Not feeling it lately', 'Can we talk?', 'Something’s off'],
    body: [
      'Hey coach. I don’t really know how to say this, but I’m not feeling it lately. Queue feels like a chore, scrims feel heavy, and I keep second-guessing every play. I don’t know what’s wrong. Can we figure something out?',
      'Coach, honestly, I’m in a rut. My hands feel slow, my calls are late, and I’m not enjoying the game the way I used to. I don’t want to drag the team down. What should I do?',
      'I’ve been watching my own VODs and I don’t recognise the player. Form’s gone, confidence is gone. I could use some help.',
      'Hey. Not to be dramatic, but I’ve felt kind of empty about the game for a couple of weeks. I still want to win, I just can’t find the fire. Any ideas?',
    ],
    out: {
      rest: ['Thanks, coach. A few days away and I’ll come back hungry.', 'I’m going to switch my phone off and sleep. Thank you.'],
      vod: ['Okay. Let’s go through it together. I want to see what you see.', 'Deal. Bring the coffee, I’ll bring the excuses.'],
      psych: ['I was a bit sceptical, but… yeah. Let’s try it.', 'Thanks for taking it seriously. Not every team would.'],
      tough_good: ['You’re right. Champions grind through slumps. I’ll queue till it clicks.', 'Okay. No more moping. Let’s work.'],
      tough_bad: ['Right. Just grind. Cool. Thanks for the help.', 'I tell you I’m struggling and you tell me to try harder. Got it.'],
    },
  },
  burnout: {
    subj: ['I’m exhausted', 'Running on empty', 'Need a breather'],
    body: [
      'Coach, I’m running on fumes. Scrims, queue, travel, matches — I haven’t had a real day off in weeks. My wrists ache and I’m making silly mistakes. Can I get a break?',
      'I don’t want to complain, but I’m wiped. I’m sleeping five hours a night and my reactions are going. I think I need a proper rest.',
      'Hey. Honest check-in: I’m burning out. I can feel it. I’d rather tell you now than collapse in the middle of playoffs.',
    ],
    out: {
      break: ['Thank you. I’ll come back fresh, I promise.', 'Three days of nothing. Exactly what I needed.'],
      lighten: ['That’s fair. Less queue, more sleep. I’ll take it.', 'Okay. I’ll cut the late-night queue.'],
      push_good: ['Okay. I’ll dig in. We rest after the split.', 'Fine. I’ll push. Just this stretch.'],
      push_bad: ['…Okay. I’ll try.', 'Right. I’ll push through. I hope it’s worth it.'],
    },
  },
  family: {
    subj: ['Family emergency', 'Need to talk — family stuff', 'Something’s happened at home'],
    body: [
      'Coach, sorry to message so late. My {relative} is in hospital back home and my family wants me there. I know we have matches coming up. I don’t know what to do.',
      'Hey coach. Family stuff. My {relative} is really sick and my mom’s been calling every day. My head isn’t here right now. Can I go home for a few days?',
      'I need to ask you something difficult. My {relative} had an accident and it’s serious. I really want to be with my family, even just for a few days.',
    ],
    out: {
      leave: ['Thank you so much. I’ll keep my phone on and be back as soon as I can.', 'I won’t forget this, coach. Thank you.'],
      help: ['You’re paying for the flights? I… thank you. Really.', 'I don’t know what to say. Thank you, from my whole family.'],
      remote: ['Okay. I’ll call them every night. Thanks for being flexible.', 'That works. I’ll try to stay focused.'],
      wait: ['…Okay. I understand. Team first.', 'Right. After the match, then. I’ll try to keep my head straight.'],
    },
  },
  grief: {
    subj: ['Bad news', 'My {relative} passed away', 'I need some time'],
    body: [
      'Coach. My {relative} passed away this morning. I’m sorry to bring this to you in a match week. I don’t really know what to do right now.',
      'Hey. I just got the call — my {relative} is gone. The funeral is in a few days. I want to be there.',
      'Sorry, I don’t have the words. My {relative} died last night. I’d like to go home for the funeral, if that’s okay.',
    ],
    out: {
      leave: ['Thank you. I’ll be back when I can.', 'Thanks, coach. That means a lot to my family.'],
      decide_go: ['I think I need to go. Thank you for trusting me with it.', 'I’m going home for a few days. Thank you for letting me choose.'],
      decide_stay: ['I want to play. It’s what they would have wanted. Thanks for letting me choose.', 'I’ll stay. The team helps me keep my mind busy.'],
      psych: ['Thank you. I’ll take the help. I don’t think I can do this alone.', 'Okay. I’ll talk to someone when I’m back.'],
    },
  },
  breakup: {
    subj: ['Personal stuff', 'Rough week', 'Can I talk to you about something?'],
    body: [
      'Hey coach. Me and my {partner} broke up this week. I know it’s not your problem, but my head’s a mess and I wanted you to hear it from me before you see it in my games.',
      'Coach, sorry, this is embarrassing. My relationship just ended and I’m not sleeping. I’ll still show up, I just might not be myself for a bit.',
      'Things with my {partner} have been falling apart and it finally ended last night. I’m trying to keep it together for the team.',
    ],
    out: {
      listen: ['Thanks for listening. I didn’t expect that from a coach.', 'That helped. Really.'],
      dayoff: ['Thanks. I’m going to go see my family.', 'Two days to clear my head. Thank you.'],
      focus_good: ['You know what? Yeah. The Rift doesn’t break up with you.', 'Revenge arc starts now.'],
      focus_bad: ['…Right. Just play. Got it.', 'Easy for you to say.'],
      psych: ['Maybe that’s a good idea. Thanks.', 'Okay. I’ll book a session.'],
    },
  },
  sick: {
    subj: ['Feeling sick', 'Not well today', 'Fever :('],
    body: [
      'Coach, I woke up with a fever and my whole body aches. I can play if you need me, but I feel terrible.',
      'Hey, I think I caught whatever’s going around. Sore throat, headache, the works. What do you want me to do?',
      'Sorry coach, I’m sick. Stomach bug, I think. I barely slept.',
    ],
    out: {
      rest: ['Thanks. Soup and sleep, I’ll be back soon.', 'Okay. Sorry for the timing.'],
      doctor: ['The doctor gave me some stuff. Feeling a bit better already.', 'Thanks for sorting out the doctor.'],
      play: ['Okay. I’ll load up on medicine and play.', 'I’ll be fine. Probably.'],
    },
  },
  sick_worse: {
    subj: ['Still sick — worse actually', 'Getting worse', 'Not improving'],
    body: [
      'Coach, playing through it was a mistake. The fever’s back and I can barely sit at the desk. What now?',
      'Hey… I’m worse than before. I think I need proper rest this time.',
    ],
    out: {
      rest: ['Thanks. I should have rested the first time.', 'Okay. Bed it is.'],
      play: ['…Okay. I’ll try.', 'Fine. I’ll play. Don’t expect miracles.'],
    },
  },
  wrist: {
    subj: ['My wrist is acting up', 'Wrist pain', 'Small injury thing'],
    body: [
      'Coach, my wrist has been hurting for a few days. Sharp pain when I flick the mouse. I didn’t want to say anything, but it’s getting worse.',
      'Hey, I think I need to get my wrist checked. It tingles after long sessions and it’s affecting my mechanics.',
      'I don’t want to make a big deal of it, but my wrist is pretty swollen after scrims. Should I be worried?',
    ],
    out: {
      physio: ['Ice, stretches and less queue. Got it. Thanks.', 'The physio says it’s early enough to fix. Good call.'],
      rest: ['A week without games is going to drive me crazy, but okay.', 'Thanks. Better now than in playoffs.'],
      play: ['Okay. I’ll tape it up and play.', 'Alright. I’ll manage the pain.'],
    },
  },
  wrist_worse: {
    subj: ['Wrist is worse', 'Need to talk about my wrist', 'It’s getting bad'],
    body: [
      'Coach, the painkillers aren’t doing it anymore. My wrist is worse and the physio is worried. I think I have to stop for a while.',
      'Hey. My hand went numb in scrims today. I’m scared this turns into something long-term.',
    ],
    out: {
      rest: ['Thanks for not pushing me. I’ll do the rehab properly.', 'Okay. Full rest. Thank you.'],
      play: ['…If you say so. I’ll tape it up again.', 'I’ll play. I just hope I don’t regret it.'],
    },
  },
  back: {
    subj: ['Back pain', 'Neck and back stuff', 'Sitting hurts'],
    body: [
      'My lower back has been killing me. Twelve hours in the chair a day isn’t great. Can we do something about it?',
      'Coach, my neck locks up after scrims. The physio says it’s posture. Any chance we can sort out my setup?',
      'Hey, my back is a mess. I can still play, but it’s distracting.',
    ],
    out: {
      chair: ['New chair, new desk, new me. Thanks!', 'Already feels better. Thank you.'],
      physio: ['Thanks. The stretches are actually helping.', 'Okay. Physio twice a week, got it.'],
      ignore: ['Stretch more. Sure.', 'Okay… I’ll try.'],
    },
  },
  homesick: {
    subj: ['Missing home', 'Homesick', 'Kind of a weird one'],
    body: [
      'Coach, I’ve been feeling really homesick lately. I miss {home}, I miss the food, I miss speaking my own language. It’s harder than I thought.',
      'Hey. It’s been a lonely few weeks. Everyone here is great, but sometimes I feel far from everything. My mom says I sound tired on the phone.',
      'Not a big problem, but I miss home a lot. Holidays are the worst — everyone’s with their families and I’m here queueing.',
    ],
    out: {
      family: ['My parents are coming?! Thank you so much.', 'My mom is already planning what to cook for the whole team.'],
      trip: ['A few days at home — that’s exactly what I needed.', 'Thank you. I’ll come back recharged.'],
      chef: ['Real food from home… you have no idea how happy that makes me.', 'Thank you. The team is going to love it too.'],
      tough_good: ['Yeah. I chose this. I’ll find my routine.', 'You’re right. It gets easier.'],
      tough_bad: ['Right. Part of the job. Okay.', 'Thanks for the sympathy.'],
    },
  },
  playtime: {
    subj: ['Can we talk about my role?', 'Playing time', 'I want to play'],
    body: [
      'Coach, I’ve been grinding scrims every day and I still haven’t played a match. I’m not asking for anything crazy, I just want a chance to show what I can do.',
      'Hey. I’ll be honest — sitting on the bench is killing me. I’m better than I’m given credit for. What do I need to do to start?',
      'I want to know where I stand. Am I part of the plans or just here for scrims?',
    ],
    out: {
      promise: ['Thank you. I’ll be ready when you call.', 'That’s all I wanted to hear.'],
      explain_good: ['Okay. At least I know where I stand. I’ll keep pushing.', 'Thanks for being honest. I respect that.'],
      explain_bad: ['So I’m a scrim partner. Got it.', 'Honest, sure. Doesn’t make it easier.'],
      earn_good: ['Fine. I’ll make it impossible to bench me.', 'Challenge accepted.'],
      earn_bad: ['I’ve been earning it for months.', 'Right. Earn it. Okay.'],
      free: ['Thanks for being straight with me. I’ll tell my agent.', 'Okay. I appreciate not being held hostage.'],
    },
  },
  stream: {
    subj: ['Streaming question', 'Can I stream more?', 'Content stuff'],
    body: [
      'Hey coach, my viewers keep asking when I’m going live. Can I stream a few more hours a week? Good for the brand too.',
      'My stream’s been growing a lot. Any chance I could go live after scrims more often? I’ll keep it chill.',
      'Coach — the partnerships team says streaming more could help my numbers. Is that okay with you?',
    ],
    out: {
      allow: ['Let’s go! Chat is going to be so happy.', 'Thanks coach. I’ll plug the team every stream.'],
      limit: ['Weekends only? Fair enough.', 'Okay, off-days it is.'],
      refuse: ['…Okay. Practice first, I get it.', 'Right. No stream. Got it.'],
    },
  },
  champ: {
    subj: ['About my champion pool', 'Let me play my champ', 'Draft stuff'],
    body: [
      'Coach, can we talk drafts? I keep getting put on champions I’m not comfortable with. Give me {champ} and I’ll show you.',
      'Honestly, I’m frustrated. I’ve been practising {champ} all year and we never draft it. I play way better on my comfort picks.',
      'I’m not trying to be difficult, but I’m tired of playing meta picks I don’t believe in. I want {champ} back.',
    ],
    out: {
      main: ['Finally! You won’t regret it.', 'Thank you. {champ} games incoming.'],
      meta_good: ['Fine. If the meta wants it, I’ll learn it.', 'Okay. I’ll grind the new picks.'],
      meta_bad: ['So I play what I’m told. Great.', 'Okay. I’ll play the meta picks badly then.'],
      compromise: ['Deal. Meta first, {champ} when it fits.', 'That’s fair. I can work with that.'],
    },
  },
  conflict: {
    subj: ['Problem with {mate}', 'Team stuff', 'Can we talk about {mate}?'],
    body: [
      'Coach, I don’t want to snitch, but me and {mate} aren’t working. Every review turns into an argument. Something has to change.',
      'I’m done with {mate}’s attitude. Blaming me in comms, sighing on the mic… it’s affecting all of us.',
      'Honestly, {mate} and I need help. We used to be fine, now we can’t even talk without it turning ugly.',
    ],
    out: {
      mediate_good: ['We talked it out. It’s better. Thanks for sitting us down.', 'Okay, that helped. {mate} and I are good.'],
      mediate_bad: ['That went badly. {mate} wouldn’t even look at me.', 'I tried. {mate} didn’t.'],
      side: ['Thank you. Someone had to say it.', 'Glad you see it too.'],
      sortout_good: ['Fine. We grabbed dinner and talked. It’s okay now.', 'We sorted it. Like adults, apparently.'],
      sortout_bad: ['We tried. It turned into another argument.', 'Sort it out ourselves. Sure.'],
      meeting: ['Okay. Better to have it in the open.', 'Awkward meeting, but maybe it helps.'],
    },
  },
  contract: {
    subj: ['Contract question', 'About my future', 'Next year?'],
    body: [
      'Hey coach. My contract is up in {months} months and nobody’s said anything. Am I in the plans for next season? It’s getting in my head a bit.',
      'Coach, my agent keeps asking about an extension. I’d like to stay, but I need to know if the team wants me.',
      'Can I ask where I stand for next year? My contract’s ending soon and I’d rather hear it from you.',
    ],
    out: {
      talks: ['Thank you. That takes a weight off.', 'Great. I’ll tell my agent to expect a call.'],
      honest_good: ['Okay. I appreciate the honesty.', 'Fair. I’ll play my way into the plans.'],
      honest_bad: ['No decision yet? Okay… that’s not great to hear.', 'Right. I’ll keep my options open then.'],
      deflect: ['Sure. Focus on the games.', 'Okay. I’ll stop asking.'],
    },
  },
  raise: {
    subj: ['About my salary', 'A slightly awkward one', 'Money talk'],
    body: [
      'Coach, I don’t love asking, but I’ve been one of our best players and I’m paid like a backup. Can we talk about my salary?',
      'My agent says players at my level earn a lot more. I’m happy here, but I’d like that recognised.',
      'Hey. Is there any chance of a raise? I’ve been performing and I think I’ve earned the conversation.',
    ],
    out: {
      bonus: ['That’s generous. Thank you — it’s about feeling valued.', 'Appreciated, coach. Really.'],
      later: ['Okay. I’ll hold you to it at renewal.', 'Fair. Let’s fix it in the next contract.'],
      refuse: ['Right. Good to know.', 'Okay. I’ll remember that.'],
    },
  },
  visa: {
    subj: ['Visa problems', 'Paperwork stress', 'Immigration stuff'],
    body: [
      'Coach, my visa renewal is a nightmare. The forms are all in a language I barely read and the office keeps sending things back. I’m stressing out.',
      'Hey, small problem — my work permit needs renewing and I’m missing documents from home. I don’t know who to ask.',
      'The immigration office wants me in person next week and I have no idea what they need. Can the club help?',
    ],
    out: {
      lawyer: ['A lawyer? Amazing. I can finally sleep.', 'Thank you. That’s a huge weight off.'],
      personally: ['You’d come with me? Thank you, really.', 'Thanks, coach. It helps not doing it alone.'],
      self: ['Okay. I’ll figure it out.', 'Sure. I’ll handle it.'],
    },
  },
  celebrate: {
    subj: ['Some good news!', 'Guess what', 'Big week for me'],
    body: [
      'Coach! Big news — {event}! It’s a big deal for my family and I’d love to be there. Is there any way?',
      'Hey coach, can I share something? {event}! I’m so happy. Would it be okay to take a couple of days for it?',
      'Okay, I have to tell someone: {event}! My family is going crazy. Any chance I can join them?',
    ],
    out: {
      attend: ['Thank you! I’ll send photos to the team chat.', 'You’re the best. I’ll be back right after.'],
      gift: ['A gift from the club? My family is going to love it!', 'That’s so thoughtful. Thank you.'],
      congrats: ['Thanks, coach. I’ll watch the livestream, I guess.', 'Thank you. Wish I could be there, but I get it.', 'Thanks… my mom will understand. Probably.'],
    },
  },
  feedback: {
    subj: ['Feedback?', 'Can you be honest with me?', 'How am I doing?'],
    body: [
      'Hey coach, I want to get better. Can you tell me honestly what I need to work on? Don’t hold back.',
      'I’ve been watching my VODs, but I feel like I’m missing something. What do you see?',
      'Quick one — how do you think I’m doing? I want to know what you really think.',
    ],
    out: {
      honest_good: ['That’s exactly what I needed. I’ve got a list now.', 'Ouch. But you’re right. Thanks.'],
      honest_bad: ['Wow. Okay. I asked for it, I guess.', 'That was… a lot.'],
      positive: ['Thanks! Good to know I’m on the right track.', 'Nice. That gives me confidence.'],
      vod: ['Perfect. Let’s break it down tomorrow.', 'Thanks for making the time.'],
      later: ['Oh. Okay. Later then.', 'Sure, whenever you have time.'],
    },
  },
  fans: {
    subj: ['The comments are getting to me', 'Online stuff', 'Social media is awful'],
    body: [
      'Coach, I know I shouldn’t read the comments, but people are saying some really nasty stuff about me after the last series. It’s getting in my head.',
      'My DMs are a mess. Threats over a League game. I’m trying to ignore it, but it’s hard.',
      'Hey… fans are blaming me for everything right now. Some of it is personal, about my family. I don’t know how to handle it.',
    ],
    out: {
      break: ['Logging off. Honestly, I feel better already.', 'Thanks. I needed someone to take the phone away from me.'],
      statement: ['Seeing the club back me publicly… that means a lot.', 'Thank you for standing up for me.'],
      ignore_good: ['Yeah. Mute, block, play. I’ve got this.', 'Thick skin. Got it.'],
      ignore_bad: ['Easy to say when it’s not your name in the comments.', 'Right. Just ignore it. Sure.'],
    },
  },
  confession: {
    subj: ['Sorry about the last series', 'That one’s on me', 'My fault'],
    body: [
      'Coach, I just want to say sorry. That series was on me. I {mistake}. I’ve watched it back and it’s embarrassing.',
      'I threw. I know it, you know it. I’m sorry. I won’t make excuses.',
      'Hey. I let the team down against {opp}. I’ve been beating myself up about it all night.',
    ],
    out: {
      reassure: ['Thanks, coach. I needed to hear that.', 'Okay. Win as a team, lose as a team.'],
      review: ['Yeah. Let’s go through it. I want to fix it.', 'Thanks. I’ll be there early.'],
      scold_good: ['You’re right. It won’t happen again.', 'Understood. I’ll fix it.'],
      scold_bad: ['I literally just apologised…', 'I know. That’s why I messaged you.'],
    },
  },
  nerves: {
    subj: ['Nervous about {opp}', 'Big match nerves', 'Can’t sleep'],
    body: [
      'Coach, I can’t sleep. The match against {opp} is all I can think about. What if I freeze on stage?',
      'Hey, sorry, dumb question, but how do you deal with nerves? My hands were shaking in scrims just thinking about {opp}.',
      'I’ve never played a match this big. Everyone back home will be watching. I’m kind of freaking out.',
    ],
    out: {
      calm_good: ['Okay. Deep breaths. I’ve earned this.', 'Thanks, coach. I feel calmer.'],
      calm_bad: ['Thanks… still nervous, though.', 'I’ll try not to think about it.'],
      routine: ['A routine. Music, warm-up, stretch, play. I like that.', 'That actually helps. Thanks.'],
      psych: ['Talking it through helped a lot. Thank you.', 'I feel more in control now.'],
    },
  },
  leader: {
    subj: ['An idea about our comms', 'Shotcalling', 'I want more responsibility'],
    body: [
      'Coach, I think our mid-game calls are too slow. I want to take more of the shotcalling. I see the map and I’m confident.',
      'I’ve been thinking — I’d like a bigger role in draft prep and comms. I know this team inside out.',
      'Can I lead the comms for a few scrim blocks? I think I can fix our mid game.',
    ],
    out: {
      yes: ['Thank you. I won’t let you down.', 'Let’s go. Clean comms from now on.'],
      share: ['Fair. Draft input is a good start.', 'Okay. I’ll bring ideas to prep.'],
      no: ['Okay. Your call.', 'Fine. I’ll keep my opinions to myself.'],
    },
  },
  bond: {
    subj: ['Me and {mate}', 'Room swap?', 'A small request'],
    body: [
      'Hey coach! Me and {mate} have been duo queueing every night and it’s been really good. Can we room together? We talk through every game.',
      'Small request — can {mate} and I get more 2v2 practice in scrims? We’ve got some ideas for our lane.',
      'Coach, {mate} and I are vibing lately. Would it be okay if we did our own extra review sessions?',
    ],
    out: {
      yes: ['Yesss. Thanks, coach!', 'You’ll see the difference on stage.'],
      no: ['Okay, no problem.', 'Alright. Maybe later.'],
    },
  },
  schedule: {
    subj: ['Scrim schedule', 'Training load', 'Too much?'],
    body: [
      'Coach, the schedule is brutal. Twelve-hour days and then solo queue. I think we’re practising worse because we’re tired.',
      'Hey, can we talk about practice? I feel like the quality drops off in the last scrim block every day.',
      'Respectfully, I think we’re overtraining. I’m making mistakes I wouldn’t normally make.',
    ],
    out: {
      ease: ['Thanks. Quality over quantity.', 'I’ll use the extra time to sleep, promise.'],
      explain_good: ['Okay, that makes sense. I’ll manage my energy better.', 'Got it. I see the plan now.'],
      explain_bad: ['I understand the plan. I’m still exhausted.', 'Okay…'],
      refuse: ['Right. The schedule stays.', 'Okay. I’ll survive.'],
    },
  },
  military: {
    subj: ['Military service', 'Thinking about enlistment', 'Future stuff'],
    body: [
      'Coach, my military service is getting closer and I keep thinking about it. I don’t know whether to go now or try to play a few more years.',
      'My parents keep asking when I’ll enlist. I want to keep playing, but I need a plan.',
    ],
    out: {
      support: ['Thank you. Knowing the team has my back helps a lot.', 'That’s a relief. Thanks, coach.'],
      plan: ['Okay. Let’s plan it properly. Thanks.', 'Good. A plan makes it less scary.'],
      focus: ['Okay… I’ll try not to think about it.', 'Sure. Later.'],
    },
  },
  housing: {
    subj: ['Living situation', 'Gaming house', 'Moving out?'],
    body: [
      'Coach, would it be possible to live outside the gaming house? I need some space to switch off after practice.',
      'The house is pretty noisy and I can’t sleep before scrims. Any chance of a quieter room?',
    ],
    out: {
      allow: ['My own place! Thank you. I’ll still be first at scrims.', 'Thanks. I think it’ll help my head.'],
      upgrade: ['Blackout curtains and a real bed. Life-changing. Thanks!', 'Much better. Thank you.'],
      refuse: ['Okay. Earplugs it is.', 'Fine. Team house rules.'],
    },
  },
  gear: {
    subj: ['Setup issue', 'My mouse died', 'Equipment request'],
    body: [
      'Coach, my mouse is double-clicking and my monitor flickers. Can the club get me new gear?',
      'Hey, my chair is falling apart and my headset crackles. Could we sort it out before the next match?',
    ],
    out: {
      buy: ['New gear! Thanks, coach.', 'Feels so much better. Thank you.'],
      sponsor: ['Sponsor gear it is. Not my favourite, but okay.', 'Fine, I’ll get used to it.'],
      refuse: ['Okay. I’ll make do.', 'Sure…'],
    },
  },
  offer: {
    subj: ['Heads up', 'My agent called', 'Something you should know'],
    body: [
      'Coach, I wanted to be transparent — my agent says {club} asked about me. I’m not pushing for anything, I just didn’t want you to hear it elsewhere.',
      'Heads up: {club} have been in touch with my agent. I’m happy here, but I wanted to be honest with you.',
    ],
    out: {
      commit: ['That means a lot. I’m staying focused here.', 'Good to hear. Then there’s nothing to talk about.'],
      open: ['Thanks for being cool about it.', 'Fair. Let’s see what happens.'],
      warn_good: ['Of course. I’m committed.', 'Understood. I just wanted to be honest.'],
      warn_bad: ['I was being honest and I get a warning?', 'Okay. Noted.'],
    },
  },
  language: {
    subj: ['Comms are hard', 'Language thing', 'Can I get help?'],
    body: [
      'Coach, I’m struggling with comms. Everything happens so fast and I’m still translating in my head. I feel like I’m slowing the team down.',
      'Hey, my teammates are patient, but I miss half of what’s said in review. Could I take language classes?',
    ],
    out: {
      tutor: ['Thank you! I start lessons tomorrow.', 'Great. I want to be able to joke with the guys too.'],
      buddy: ['{mate} offered to help — that’s really kind.', 'Thanks. {mate} is a good teacher.'],
      tough_good: ['You’re right. Immersion. I’ll talk more.', 'Okay. No more hiding behind the language.'],
      tough_bad: ['Okay… I’ll keep struggling then.', 'Sure.'],
    },
  },
  health: {
    subj: ['Gym?', 'Health stuff', 'Fitness idea'],
    body: [
      'Coach, I’ve been trying to get fitter — better sleep, gym, eating right. Could the club cover a gym membership or a nutritionist?',
      'Hey, I want to fix my diet and sleep. Do we have anyone who can help with that?',
    ],
    out: {
      pay: ['Thanks! New season, new body.', 'Appreciate it. I’ll stick to it.'],
      team: ['A team programme? The guys are going to complain so much. I love it.', 'Thanks! Healthy team, happy team.'],
      no: ['Okay. YouTube workouts it is.', 'Fair enough.'],
    },
  },
  incident: {
    subj: ['Conduct issue: {me}', 'Disciplinary matter: {me}', 'We need to talk about {me}'],
    body: [
      '{me} {incident}. The rest of the squad noticed. How do you want to handle it?',
      'Flagging this before it becomes a pattern: {me} {incident}. Your call on the response.',
      'Heads up from the staff room — {me} {incident}. The players are waiting to see what you do.',
    ],
    out: {
      fine_good: ['{me}: “Fair. I messed up.”', '{me} accepted the fine without arguing.'],
      fine_bad: ['{me}: “A fine? Seriously?”', '{me} stormed out of the meeting.'],
      talk_good: ['{me}: “You’re right. It won’t happen again.”', '{me} apologised to the team.'],
      talk_bad: ['{me}: “Okay, okay.” (Not convinced.)', '{me} shrugged it off.'],
      bench: ['{me} will sit out the next match.', '{me} took the benching badly.'],
      slide: ['Nothing was said. The squad noticed.', 'You let it go.'],
    },
  },
};

/** Player replies when an approach expires without an answer. */
export const IGNORED = [
  'I guess you were busy. Never mind.',
  'No answer, huh. Okay.',
  'Forget I asked.',
  'Okay… I’ll deal with it myself.',
];

export const RELATIVES = ['dad', 'mom', 'grandmother', 'grandfather', 'little brother', 'sister', 'uncle'];
export const LOST_RELATIVES = ['grandmother', 'grandfather', 'uncle', 'aunt', 'childhood best friend'];
export const PARTNERS = ['girlfriend', 'partner', 'girlfriend', 'boyfriend'];
export const CELEBRATIONS = [
  'my sister is getting married next week', 'my older brother is getting married', 'I finally finished my degree and graduation is on Saturday',
  'I’m going to be an uncle', 'my parents are celebrating their 30th anniversary', 'my little brother is graduating high school',
  'my best friend asked me to be his best man', 'my grandma turns 90 this weekend',
];

/** Out-of-game misconduct reported by the staff (`w` = which trait/personality drives it). */
export const INCIDENTS: { kind: string; text: string; w: 'prof' | 'party' | 'temper' | 'stream' | 'ethic' }[] = [
  { kind: 'late', text: 'was forty minutes late to scrims — again', w: 'prof' },
  { kind: 'party', text: 'was spotted at a club until 4am the night before scrims', w: 'party' },
  { kind: 'party2', text: 'turned up to morning practice clearly hungover', w: 'party' },
  { kind: 'soloq', text: 'got a chat restriction for flaming in solo queue', w: 'temper' },
  { kind: 'staff', text: 'snapped at an analyst during review and walked out', w: 'temper' },
  { kind: 'stream', text: 'trash-talked an opponent on stream and the clip is going around', w: 'stream' },
  { kind: 'leak', text: 'accidentally showed our scrim schedule on stream', w: 'stream' },
  { kind: 'vod', text: 'skipped the team VOD review without telling anyone', w: 'ethic' },
  { kind: 'sleep', text: 'has been sleeping through the morning sessions', w: 'ethic' },
  { kind: 'phone', text: 'was on their phone through the whole draft prep', w: 'prof' },
];

// ------------------------------------------------------------------ follow-ups (non-actionable notes from players)
export const FOLLOW_T: Record<string, { subj: string[]; body: string[] }> = {
  back: {
    subj: ['Back with the team', 'I’m back', 'Back in the house'],
    body: [
      'Hey coach, I’m back. Thank you for giving me that time — I needed it more than I realised. Ready to work.',
      'Just landed. Thanks again for understanding. Let’s get back to it.',
      'I’m back and my head is clearer. Thank you for not making it harder than it was.',
    ],
  },
  family_better: {
    subj: ['Update from home', 'Good news from home'],
    body: [
      'Quick update — my {relative} is recovering well. Thank you for asking about it. It means a lot.',
      'Good news: my {relative} is out of hospital. I can finally focus again.',
    ],
  },
  breakup_better: {
    subj: ['Feeling better', 'Thanks for earlier'],
    body: [
      'Hey, just wanted to say I’m doing a lot better. Thanks for being decent about it.',
      'Feeling like myself again. Thanks for giving me space.',
    ],
  },
  celebrate_photo: {
    subj: ['Photos!', 'Thank you!'],
    body: [
      'Sent some photos to the team chat. My whole family says thank you for letting me be there!',
      'It was amazing. Thanks for letting me go — my family wants to invite the whole team next time.',
    ],
  },
  family_visit: {
    subj: ['My family loved it', 'Thank you for this week'],
    body: [
      'My parents just left. They loved the gaming house and my mom cooked for everyone. Best week in months.',
      'Thank you for flying my family over. I didn’t realise how much I needed that.',
    ],
  },
  promise_kept: {
    subj: ['Thanks for keeping your word', 'You kept your promise'],
    body: [
      'Hey coach, just wanted to say thanks for keeping your word. That means a lot to me.',
      'You said you would and you did. Respect.',
    ],
  },
  promise_broken: {
    subj: ['You promised', 'About what you said', 'Disappointed'],
    body: [
      'Coach, you promised me {promise}. It didn’t happen. I don’t know what to believe anymore.',
      'I was told {promise}. I’m not going to make a scene, but I won’t forget it either.',
      'Remember when you promised {promise}? Because I do.',
    ],
  },
  recovered: {
    subj: ['Feeling better', 'Back to 100%', 'All good now'],
    body: [
      'Quick update: I’m feeling much better. Thanks for looking after me.',
      'Fully recovered! Ready to go.',
    ],
  },
  psych_hint: {
    subj: ['A word about {me}', 'Keep an eye on {me}'],
    body: [
      'From our psychologist: {me} seems to be carrying something they haven’t talked about. A private chat might help — they may open up if they trust you.',
      'Staff note: {me} has been quiet and withdrawn lately. Might be worth asking how they’re really doing.',
    ],
  },
};

// ------------------------------------------------------------------ teammate moments
export const MOMENTS: Record<string, string[]> = {
  duo_queue: [
    '{a} and {b} have been duo queueing every night — the {lane} looks sharper.',
    'Staff report: {a} and {b} stayed up reviewing 2v2 trades again. Their {lane} sync is improving.',
    '{a} and {b} climbed to the top of the ladder together in duo queue this week. The timings are clicking.',
  ],
  dinner: [
    '{a} and {b} went out for dinner after scrims — a real friendship seems to be forming.',
    '{a} took {b} to their favourite noodle place. They came back laughing.',
  ],
  gaming_night: [
    '{a} and {b} spent their day off playing other games together until 3am.',
    '{a} and {b} have a running bet on their solo-queue LP. Healthy competition.',
  ],
  inside_joke: [
    '{a} and {b} have an inside joke nobody else understands. The comms are lighter for it.',
    '{b} has started finishing {a}’s sentences in review. It’s a bit creepy, honestly.',
  ],
  gym: [
    '{a} and {b} have been hitting the gym together every morning.',
    '{a} dragged {b} out for a run. Both survived.',
  ],
  mentor_session: [
    '{a} spent the evening walking {b} through wave management. {b} took notes.',
    '{b} says the extra sessions with {a} are the best thing about the team.',
  ],
  healthy_rivalry: [
    '{a} and {b} are pushing each other hard in scrims for the starting spot — both are levelling up.',
    '{a} vs {b} in 1v1s after practice went 7-5. They’re already planning a rematch.',
  ],
  win_bond: [
    '{a} and {b} celebrated the win together on stream — chat loved it.',
    'After the win, {a} and {b} were inseparable in the post-game interviews.',
    '{a} gave {b} all the credit in the post-match interview. The {lane} is in a good place.',
  ],
  comms_argument: [
    '{a} and {b} got into a heated argument in comms during scrims. The analyst had to pause the block.',
    'Tension: {a} and {b} talked over each other all through review and it got personal.',
  ],
  blame: [
    'Drama: {a} blamed {b} for the loss in the post-game review, and {b} didn’t take it well.',
    '{a} and {b} argued after the loss — the staff had to separate them in the hallway.',
    'The loss hit hard: {a} called out {b}’s play in front of everyone. {b} walked out.',
  ],
  stream_comment: [
    '{a} made a sarcastic comment about {b} on stream. Clips are going around and {b} is not amused.',
    '{a} said on stream that “some people” don’t follow calls. {b} thinks it was about them.',
  ],
  resource_fight: [
    '{a} and {b} are fighting over resources — both want the jungler’s attention and neither will back down.',
    '{a} and {b} argued over who should be the carry. The staff are not impressed.',
  ],
  roommate: [
    '{a} and {b} are sick of sharing a room. Something about {b}’s 4am snacks.',
    'Small thing, but {a} and {b} aren’t speaking after an argument over house chores.',
  ],
  ego_clash: [
    'Two big personalities: {a} and {b} clashed over the draft again.',
    '{a} and {b} each think the other is the problem. Neither is entirely wrong.',
  ],
  rival_jab: [
    '{a} and {b}’s competition for the starting spot is turning sour — jabs in scrims, cold shoulders after.',
    '{b} isn’t hiding their frustration about {a} getting the start.',
  ],
  made_up: [
    '{a} and {b} cleared the air — {a} apologised and they queued together that night.',
    'Good news: {a} and {b} have made up. The house is quieter.',
  ],
};

/** Feed lines when a pair's relationship changes category. */
export const KIND_NOTE: Record<string, string[]> = {
  duo: ['{a} and {b} are clicking — the {lane} has real synergy now.', 'The {a}–{b} {lane} is turning into a proper duo.'],
  friends: ['{a} and {b} have become close friends.', '{a} and {b} are inseparable these days.'],
  mentor: ['{a} has taken {b} under their wing.'],
  rivals: ['The rivalry between {a} and {b} for the {role} spot is getting bitter.'],
  clash: ['{a} and {b} are clashing — two personalities that don’t mix.'],
  tension: ['There’s growing tension between {a} and {b}.'],
};

export const NEWS_T: Record<string, { head: string[]; body: string[] }> = {
  spat: {
    head: ['Drama at {team}? {a} and {b} spat goes public', '{a} and {b} trade jabs on social media', 'Report: tension between {a} and {b} at {team}'],
    body: [
      'Sources close to {team} say {a} and {b} had a heated exchange after recent results. Neither player has commented.',
      'A since-deleted post from {a} appeared to take a shot at teammate {b}. The {team} staff are said to be handling it internally.',
    ],
  },
  bond: {
    head: ['Inside {team}’s {lane}: the {a}–{b} connection', '{a} on {b}: “Best partner I’ve ever had”'],
    body: [
      '{a} and {b} have become inseparable off the Rift, and it shows on it: their coordination has been one of {team}’s quiet strengths.',
      'Teammates describe {a} and {b} as “the same brain in two bodies”. The pair have been duo queueing nightly.',
    ],
  },
};

// ------------------------------------------------------------------ team meetings & team building
export const MEETING_LINES: Record<string, { pos: string[]; meh: string[]; neg: string[] }> = {
  rally: {
    pos: ['{me}: “Let’s go. We’re better than our results.”', '{me}: “I’m in. One game at a time.”', '{me} nods: “We fix this together.”', '{me}: “Needed that. Back to work.”'],
    meh: ['{me}: “Sure.”', '{me} stays quiet, arms crossed.', '{me} checks their phone.'],
    neg: ['{me}: “Speeches don’t win games.”', '{me} rolls their eyes.', '{me}: “We’ve heard this one before.”'],
  },
  celebrate: {
    pos: ['{me}: “Ayyy, dinner’s on the coach!”', '{me}: “Enjoy it tonight, back to work tomorrow.”', '{me} starts a very off-key victory song.'],
    meh: ['{me}: “Nice. Can I go queue?”', '{me} smiles politely.'],
    neg: ['{me}: “Celebrating what, exactly?”', '{me}: “Bit early for a party, no?”'],
  },
  callout: {
    pos: ['{me}: “Fair. We’ve been sloppy.”', '{me}: “Needed to be said.”', '{me}: “Agreed. Standards up.”'],
    meh: ['{me}: “Okay.”', '{me} stares at the floor.'],
    neg: ['{me}: “So it’s our fault now?”', '{me} storms out after the meeting.', '{me}: “Great, more pressure.”'],
  },
  clear: {
    pos: ['{me}: “Good to get it out in the open.”', '{me}: “Honestly, I feel better.”'],
    meh: ['{me}: “Okay. Moving on.”', '{me} shrugs.'],
    neg: ['{me}: “That just made it awkward.”', '{me}: “Some of that should have stayed private.”'],
  },
};

export const ACTIVITY_SCENES: Record<string, string[]> = {
  dinner: [
    'Everyone squeezed into a booth at the team’s favourite barbecue place. {a} told an embarrassing story about {b}; the table cried laughing.',
    'Team dinner: {a} ordered for everyone, {b} pretended to hate it and ate the most.',
  ],
  night: [
    'Escape room: {a} solved the final puzzle with four seconds left. Karaoke: {b} will never live down that ballad.',
    'Bowling and karaoke. {a} bowled a 40; {b} sang three songs nobody asked for. Morale: high.',
  ],
  outdoor: [
    'Go-karting turned surprisingly competitive — {a} and {b} are still arguing about who cut the corner.',
    'Paintball day: {a} and {b} teamed up and wiped the staff. They have not stopped talking about it.',
  ],
  retreat: [
    'Two days away from the screens: hikes, barbecue and long talks around the fire. The squad came back closer.',
    'Weekend retreat by the sea. {a} and {b} talked until sunrise; the whole team looks lighter.',
  ],
};
