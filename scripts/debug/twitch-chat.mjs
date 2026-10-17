// Record a Twitch channel's live chat for study (chat-pattern research for the stream chat, src/ui/match/chatVi.ts).
// Uses Twitch's anonymous read-only chat connection (justinfan login on the public IRC WebSocket): nothing is posted,
// no account is used. Usernames are replaced by short hashes; badges, bits, emote positions, subs / gifts / raids and
// moderation (timeouts, deleted lines) are kept with a timestamp.
//   node scripts/debug/twitch-chat.mjs <channel> [minutes=30] [out=data-raw/chat/<channel>.jsonl]
import fs from 'node:fs';
import path from 'node:path';

const channel = (process.argv[2] || '').toLowerCase().replace(/^#/, '');
if (!channel) { console.error('usage: node scripts/debug/twitch-chat.mjs <channel> [minutes] [out]'); process.exit(1); }
const minutes = Number(process.argv[3] ?? 30);
const out = process.argv[4] ?? path.join('data-raw', 'chat', `${channel}.jsonl`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const file = fs.createWriteStream(out, { flags: 'a' });
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const tagsOf = (raw) => Object.fromEntries((raw ?? '').split(';').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
const start = Date.now();
let n = 0, last = Date.now();

const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
ws.addEventListener('open', () => {
  ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
  ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
  ws.send(`JOIN #${channel}`);
  console.log(`connected · recording #${channel} for ${minutes} min → ${out}`);
});
ws.addEventListener('message', (ev) => {
  for (const line of String(ev.data).split('\r\n')) {
    if (!line) continue;
    if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
    const m = /^(?:@(\S+) )?(?::(\S+) )?(\S+)(?: ([^:]*?))?(?: :(.*))?$/.exec(line);
    if (!m) continue;
    const [, rawTags, prefix, cmd, , trailing] = m;
    const tags = tagsOf(rawTags);
    const user = (prefix ?? '').split('!')[0];
    const t = Date.now() - start;
    let row = null;
    if (cmd === 'PRIVMSG') row = { t, k: 'm', u: hash(tags['display-name'] || user), b: tags.badges || '', bits: tags.bits ? Number(tags.bits) : undefined, em: tags.emotes || undefined, first: tags['first-msg'] === '1' || undefined, reply: tags['reply-parent-msg-id'] ? 1 : undefined, text: trailing ?? '' };
    else if (cmd === 'USERNOTICE') row = { t, k: tags['msg-id'] || 'notice', u: hash(tags.login || ''), months: tags['msg-param-cumulative-months'] ? Number(tags['msg-param-cumulative-months']) : undefined, gifts: tags['msg-param-mass-gift-count'] ? Number(tags['msg-param-mass-gift-count']) : undefined, viewers: tags['msg-param-viewerCount'] ? Number(tags['msg-param-viewerCount']) : undefined, plan: tags['msg-param-sub-plan'] || undefined, text: trailing ?? '' };
    else if (cmd === 'CLEARCHAT') row = { t, k: 'timeout', secs: tags['ban-duration'] ? Number(tags['ban-duration']) : 'ban' };
    else if (cmd === 'CLEARMSG') row = { t, k: 'deleted' };
    else if (cmd === 'ROOMSTATE') row = { t, k: 'room', slow: tags.slow, subs: tags['subs-only'], emoteOnly: tags['emote-only'], followers: tags['followers-only'] };
    if (!row) continue;
    file.write(JSON.stringify(row) + '\n');
    n++;
  }
  if (Date.now() - last > 60_000) { last = Date.now(); console.log(`${Math.round((Date.now() - start) / 60000)} min · ${n} rows`); }
});
ws.addEventListener('close', () => { console.log(`closed · ${n} rows`); file.end(); process.exit(0); });
ws.addEventListener('error', (e) => { console.error('error', e.message ?? e); });
setTimeout(() => { console.log(`done · ${n} rows in ${minutes} min`); ws.close(); }, minutes * 60_000);
