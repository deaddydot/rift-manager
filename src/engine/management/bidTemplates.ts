// Transfer-bid pack (bidTalks.ts): the player's side of incoming bids — his conversations with you (player
// approaches through the locker-room system), inbox notes, fan posts and news. PG-13, about the move, not people.
// Approach placeholders: {coach} (manager) {me} (player) {team} {club} (bidder short) {clubName} {fee} {ask} {counter}
// {raise} {until} {mate}. Fan / news placeholders: {player} {club} {short} {team}.
import type { Templates } from './fanTemplates';
import type { ApproachTpl } from './peopleTemplates';

export const BID_APPROACH_T: Record<string, ApproachTpl> = {
  bid_push: {
    subj: ['About {club}', 'Coach, can we talk about the bid?', 'The {club} offer', 'I need to say something'],
    body: [
      'Coach, I heard {clubName} made an offer. I’ll be honest with you — I really want this move. I’m asking you to let me go.',
      'I know it’s your call, but {club} is the kind of opportunity I’ve dreamed about. Please think about it seriously.',
      'Coach, I won’t pretend: I want to go to {club}. I’ll give everything until the decision, but I wanted you to hear it from me.',
      'My agent told me about {clubName}. I’ve thought about it all night. I’d like to accept their project, if you allow it.',
    ],
    out: {
      consider: ['Okay. That’s fair. Thanks for listening.', 'I understand. I’ll wait.', 'Fair enough. I just needed you to know.'],
      yes: ['Thank you, coach. Seriously. I won’t forget that.', 'That means a lot. I’ll keep working hard until it’s sorted.', 'Really? Thank you. I was nervous to even ask.'],
      no: ['Not for sale… right. Okay.', 'So that’s it? I see.', 'I hoped you’d at least think about it.', 'Fine. I heard you.'],
    },
  },
  bid_agent: {
    subj: ['About my future', 'My agent wants a word', 'Before you answer {club}', 'Contract talk'],
    body: [
      'Coach, about the {club} offer. Truth is, I’d rather stay. But I want to feel valued here: {ask} a year until {until} and I sign today.',
      'My agent says {clubName} are serious. I don’t have to go — if the club matches what I’m worth. {ask} per year, through {until}.',
      'I like it here. I like this team. But {club} are offering a lot. Give me a new deal — {ask}/yr until {until} — and I tell them no myself.',
      'Before you decide on the {club} bid: I’m open to staying. New contract, {ask} a year until {until}. That’s all I need.',
    ],
    out: {
      agree: ['Done. I’ll call my agent and tell {club} no. Let’s win things.', 'Thank you, coach. That settles it — I’m staying.', 'Deal. Now let’s get back to work.'],
      counter_yes: ['Okay, okay. {counter} it is. I’m staying.', 'Not quite what I asked, but I believe in the project. Deal.'],
      counter_no: ['That’s not really meeting me halfway, coach.', 'I’ll wait and see what you do with the bid, then.', 'Hm. Let me think about it. Probably no.'],
      role: ['A guaranteed spot? That’s what I really wanted. I’m in.', 'If I’m starting, I’m happy. Thanks, coach.'],
      decide: ['Understood. I’ll wait for the club’s answer.', 'Okay. Just know where I stand.', 'Right. Business first, I get it.'],
    },
  },
  bid_wants: {
    subj: ['Coach, I want that move', 'About {club}…', 'We need to talk', 'I can’t stop thinking about it'],
    body: [
      'Coach, you turned down {club}. I need you to know I really wanted that move. I can’t just pretend it didn’t happen.',
      'I respect that it’s the club’s decision, but {clubName} was my chance. I’m asking you to reconsider.',
      'I’m not going to lie: since you rejected {club}, I’ve been struggling to focus. I want to go.',
      'Coach, my head is at {club}. I’ll be professional, but I want a real conversation about my future.',
    ],
    out: {
      letgo_sold: ['Thank you for everything, coach. I mean it.', 'I’ll never forget what this club did for me. Thank you for letting me go.'],
      letgo_later: ['Okay. If a fair offer comes, I’m holding you to that.', 'Thanks. That takes a weight off. I’ll give everything until then.'],
      raise_yes: ['…Okay. That’s a real commitment. I’m staying, and I’m all in.', 'Alright. You showed me I matter here. Let’s go.'],
      raise_no: ['It’s not about money, coach. It’s about where I want to be.', 'Thanks, but no. My head is somewhere else.'],
      role: ['A guaranteed spot. That changes things. I’ll stay and prove it.', 'If I’m starting, I can live with staying. Thank you.'],
      mate_good: ['{mate} talked some sense into me. I’m staying — let’s win something together.', 'Okay, {mate} reminded me what we’re building here. I’m in.'],
      mate_bad: ['Sending {mate} to change my mind? Come on, coach.', '{mate} tried. It didn’t help.'],
      firm_good: ['Fine. I’m under contract, I get it. I’ll do my job.', 'Okay. I’ll focus. But I won’t pretend I’m happy.'],
      firm_bad: ['Then I want it in writing: I’m asking to leave.', 'You can keep my contract. You can’t keep my head here.', 'I’m handing in a transfer request. Sorry, coach.'],
    },
  },
};

/** Inbox notes around a bid (from the player, his agent, the bidding club). */
export const BID_LINES: Record<string, string[]> = {
  loyal_subj: ['I said no to {club}', 'About the {club} interest', 'Not going anywhere'],
  loyal_body: [
    'Coach, {clubName} came in for me with a big offer. I told my agent no before it even reached your desk. I’m staying.',
    'You might hear that {club} wanted me. I turned it down. This is my team.',
    'Quick note: {club} called my agent. I said no. Let’s get back to work.',
  ],
  refused_subj: ['You tried to sell me?', 'About {club}', 'I’m not going'],
  refused_body: [
    'Coach, I found out you accepted {club}’s offer. I said no to their terms. I didn’t want to leave — and I thought you knew that.',
    'I refused to sign with {club}. I wanted to stay here. Hearing you were ready to sell me… that hurt.',
    'I’m not going to {club}. I told them no. But I need some time to get over the fact that you wanted me gone.',
  ],
  farewell_happy: ['Thank you for everything, coach. {club} is a dream move and you made it possible.', 'Coach — thanks for not standing in the way. I’ll always be grateful.', 'Leaving with a smile. Thank you for the chance, and for letting me take the next step.'],
  farewell_neutral: ['Thanks for everything, coach. It’s a good move for me. Good luck with the team.', 'Off to {club}. No hard feelings either way — thank you for the time here.'],
  farewell_bitter: ['I didn’t want this, coach. I’ll go to {club}, but I wanted to stay.', 'I’m going because the club wanted me gone. I hope it was worth it.', 'I’ll be professional at {club}. But this wasn’t my choice.'],
  thanks_kept: ['Thanks for turning {club} down, coach. I didn’t want to go.', 'Heard you said no to {club}. Good. This is where I want to be.', 'Coach, thanks for keeping me. Let’s win something.'],
  broken_subj: ['You said I could go', 'What happened to your word?', 'About {club}…'],
  broken_body: [
    'Coach, you told me I could leave if a fair offer came. {club} made one. You said no. I don’t know what to believe anymore.',
    'You gave me your word. Then you rejected {club}. I trusted you.',
  ],
  agent_subj: ['Regarding my client {me}', '{me}’s future', 'Transfer request: {me}'],
  agent_body: [
    'Good afternoon. As {me}’s representative, I must inform you that my client has formally requested a transfer. We expect the club to consider reasonable offers. {clubName} remain very interested.',
    'Dear manager, my client {me} will not discuss an extension. His preference is a move, and several clubs — {clubName} among them — are ready. We would appreciate a constructive approach.',
    'Hello. Following our client’s transfer request, I’ve been in contact with {clubName}. We hope the club will not stand in the way of his career.',
  ],
  raised_body: [
    'After {me} made it clear he wants the move, {clubName} come back with an improved offer: {fee}, and {salary}/yr for the player.',
    '{clubName} return with a higher bid for {me}: {fee}. They say the player has told them he wants to join.',
  ],
};

export const BID_META: Record<string, { s: number; tag: string; harsh?: boolean }> = {
  bid_loyal: { s: 2, tag: 'Loyalty' }, bid_rumour: { s: -1, tag: 'Rumours' }, bid_transfer_request: { s: -2, tag: 'TransferRequest' },
  bid_new_deal: { s: 2, tag: 'Extended' }, bid_sold_unwilling: { s: -2, tag: 'SoldHim', harsh: true }, bid_kept: { s: 2, tag: 'NotForSale' },
};

export const BID_TEMPLATES: Record<string, Templates> = {
  bid_loyal: {
    diehard: ['{club} came in with a big offer and {player} said NO himself. That’s loyalty. That’s our player.', '{player} turned down {club}. Put his name on the stadium.', 'Money talks, {player} walks… straight back into our gaming house. Legend.'],
    analyst: ['{player} rejecting {club} matters: stability in the {short} roster is worth more than the fee would have been.', 'Rare in modern esports: a player turning down a bigger offer to stay. {player} clearly believes in this project.'],
    memer: ['{club}: *shows money* {player}: “no thanks I have friends here”', '{player} left {club} on read 💀', '{club} offer: rejected. emotional damage: inflicted'],
    wholesome: ['{player} choosing to stay with us 🥹 What a guy.', 'Loyalty isn’t dead. Thank you {player}! 💙'],
    casual: ['{player} said no to {club}? respect'],
    rival: ['Nobody wants to leave a sinking ship? Weird choice, {player}.'],
    insider: ['Hearing {club}’s offer for {player} was huge. He didn’t even ask his agent for the number.'],
  },
  bid_rumour: {
    insider: ['Sources: {club} have made a formal bid for {player}. And the player is interested.', 'Hearing {player} is keen on {club}’s offer. This could get messy.', '{club} want {player}. {player} wants {club}. The club holds the cards… for now.'],
    doomer: ['{player} to {club}. I can feel it. It’s over.', 'Every good player leaves eventually. Here we go again.'],
    diehard: ['{player} isn’t going anywhere. Don’t you dare, management.', 'Keep {player}. Whatever {club} offer, say no.'],
    analyst: ['If {player} leaves for {club}, the fee only makes sense with a replacement already lined up.', 'A {player} sale would weaken {short} now — unless the rebuild is the point.'],
    memer: ['{player} refreshing his inbox for {club} news like 👀', '{club} sliding into {player}’s DMs again'],
    toxic: ['If {player} wants out, let him go. We don’t need anyone who doesn’t want to be here.'],
    wholesome: ['Whatever {player} decides, he’s given us a lot. Hope it works out for everyone 💙'],
  },
  bid_transfer_request: {
    insider: ['Confirmed: {player} has handed in a transfer request. {club} are circling.', 'It’s official: {player} wants out. The agent is talking to {club}.'],
    diehard: ['{player} handed in a transfer request?! After everything?', 'Heartbroken about {player}. I thought he loved this club.'],
    toxic: ['Transfer request? Fine. Sell him and buy someone who wants the jersey.', 'Disrespectful from {player}. Bench him until he’s sold.'],
    analyst: ['A transfer request from {player} changes the negotiation: his value drops, the leverage flips to {club}.', 'Locker-room risk: an unhappy {player} in the starting five is a problem for {short}.'],
    memer: ['{player} typing the transfer request in all caps probably', 'the {player} saga season 2 just dropped'],
    doomer: ['This is how dynasties end. A transfer request.', 'Knew it. Everyone leaves.'],
    wholesome: ['I hope {player} and the club can talk it through. No villains here 🙏'],
    rival: ['Even {player} wants out of {short} 😂'],
  },
  bid_new_deal: {
    diehard: ['{player} SIGNS A NEW DEAL! {club} can keep dreaming!', 'New contract for {player}. The core stays together!'],
    analyst: ['Smart business: {short} extend {player} instead of losing him to {club}. A bigger wage bill, but continuity.', '{player} commits his future to {short}. That ends the {club} saga.'],
    memer: ['{club} watching {player} sign the extension 🫠', '{player} used {club} as leverage and honestly? valid'],
    wholesome: ['{player} staying makes me so happy 💙'],
    casual: ['{player} extended? nice'],
    toxic: ['Hope he’s worth the new wages. Perform now.'],
  },
  bid_sold_unwilling: {
    diehard: ['We SOLD {player} and he didn’t even want to leave? What is the club doing?', '{player} wanted to stay. The club pushed him out. I’m furious.'],
    toxic: ['Selling a player who wanted to stay. Cash grab. Shameful.', 'Management sold our heart for a fee. Unforgivable.'],
    analyst: ['Selling {player} against his wishes saves money but costs trust in the locker room — the other players notice.', 'The fee for {player} is decent. The message it sends to the squad is not.'],
    doomer: ['First {player}, who’s next? Nobody is safe.'],
    memer: ['the club to {player}: “it’s not you, it’s the spreadsheet”'],
    wholesome: ['Good luck at {club}, {player}. You deserved a better goodbye 💙'],
    rival: ['Lol {short} sold {player} against his will. What a club.'],
  },
  bid_kept: {
    diehard: ['{club} wanted {player}. Answer: NOT FOR SALE. 🔒', 'Management rejected {club} for {player}. Good. He stays.'],
    analyst: ['Rejecting {club} for {player} is the right call: he’s happy here, and the fee wouldn’t replace his impact.'],
    memer: ['{club}: “how much for {player}?” {short}: “he’s not on the menu”', 'bid rejected, {player} stays, everybody clap'],
    wholesome: ['{player} stays! 💙 And he wanted to. Perfect.'],
  },
};

export const BID_NEWS: Record<string, { headline: string[]; body: string[] }> = {
  loyal: {
    headline: ['{player} turns down {club}', '{player} rejects {club}, commits to {short}', 'Loyalty: {player} says no to {club}'],
    body: ['{club} made a substantial offer for {player}, but the {team} player turned it down himself.', '{player} has rejected a move to {club}, telling his agent he wants to stay with {team}.'],
  },
  transfer_request: {
    headline: ['{player} hands in transfer request', '{player} wants out of {team}', 'Unrest at {short}: {player} asks to leave'],
    body: ['After {team} turned down a bid from {club}, {player} has formally asked to leave the club.', '{player} has submitted a transfer request. {club} are understood to remain interested.'],
  },
  new_deal: {
    headline: ['{player} signs new deal with {team}', '{player} commits future to {short} amid {club} interest', '{short} tie down {player}'],
    body: ['{player} has signed a new contract with {team}, ending speculation about a move to {club}.', 'Despite interest from {club}, {player} has extended his stay at {team}.'],
  },
  forced_exit: {
    headline: ['{player} gets his move to {club}', '{player} joins {club} after asking to leave', '{short} let {player} go'],
    body: ['After making it clear he wanted the move, {player} has joined {club}.', '{team} have agreed to sell {player} to {club}, weeks after rejecting their first bid.'],
  },
};
