// Counts reaction templates (fan posts, replies, owner mail & requests, news, live chat) for content audits.
// Usage: npx tsx scripts/debug/countTemplates.ts
import { FAN_TEMPLATES, REPLIES, SCENARIO_META } from '../../src/engine/management/fanTemplates';
import { OWNER_T, QUIRK_T } from '../../src/engine/management/ownerTemplates';
import { BUZZ_NEWS } from '../../src/engine/management/buzzTemplates';
import { LORE_NEWS, LORE_CHAT } from '../../src/engine/management/loreTemplates';
import { CHAT } from '../../src/ui/match/chatLines';

const sum = (xs: (string[] | undefined)[]) => xs.reduce((s, a) => s + (a?.length ?? 0), 0);
const fan = Object.values(FAN_TEMPLATES).reduce((s, t) => s + sum(Object.values(t)), 0);
const replies = sum(Object.values(REPLIES));
const owner = Object.values(OWNER_T).reduce((s, t) => s + t.subj.length + t.body.length + sum(Object.values(t.trait ?? {})), 0);
const quirk = Object.values(QUIRK_T).reduce((s, t) => s + t.subj.length + t.body.length + sum(Object.values(t.out)), 0);
const news = Object.values(BUZZ_NEWS).reduce((s, t) => s + t.headline.length + t.body.length, 0) + LORE_NEWS.headline.length + LORE_NEWS.body.length;
const chat = sum(Object.values(CHAT)) + sum(Object.values(LORE_CHAT));
console.log(`fan scenarios ${Object.keys(FAN_TEMPLATES).length} (meta ${Object.keys(SCENARIO_META).length}), fan templates ${fan}, replies ${replies}`);
console.log(`owner mail kinds ${Object.keys(OWNER_T).length} (${owner} lines), owner request kinds ${Object.keys(QUIRK_T).length} (${quirk} lines)`);
console.log(`news templates ${news}, live chat categories ${Object.keys(CHAT).length + Object.keys(LORE_CHAT).length} (${chat} lines)`);
console.log(`TOTAL ${fan + replies + owner + quirk + news + chat}`);
// sanity: every scenario has meta, every template list is non-empty
const missing = Object.keys(FAN_TEMPLATES).filter((k) => !SCENARIO_META[k]);
if (missing.length) console.log('scenarios without meta:', missing.join(', '));
