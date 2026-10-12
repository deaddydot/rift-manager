// AI chat, transcript-continuation style: the model continues a Twitch chat log (event lines inline);
// we choose who speaks next and it writes one message. Usage: npx tsx scripts/debug/aichat-eval2.ts <model> [dtype]
import { pipeline, env } from '@huggingface/transformers';
env.cacheDir = process.env.HF_CACHE ?? env.cacheDir;
const model = process.argv[2] ?? 'onnx-community/Qwen2.5-0.5B-Instruct';
const dtype = (process.argv[3] ?? 'q4') as 'q4';
const gen = await pipeline('text-generation', model, { dtype, device: 'cpu' });
const header = `Twitch chat — LCK Cup Final, T1 vs Gen.G, game 3 (series 1-1). Chat is fast, short and full of emotes (KEKW, Pog, monkaS, Copium, LUL, Sadge, EZ, OMEGALUL).\n`;
let log = [
  'couch_coach: whos winning? just got here',
  'GoldDiffAt15: t1 up 1.5k, mostly from bot lane',
  'kekw_enjoyer: canyon pathing to the shadow realm again KEKW',
  'ProudGENFan: we scale, chill',
  'NA_hopium7: Copium',
  'T1_army: keria map hack confirmed',
  'baron_caller: baron in 40s, ward it pls',
  'xX_pentakill_Xx: Pog',
  'gg_go_next: gen gonna throw again KEKW',
  'ProudGENFan: @gg_go_next its 6-9 relax',
  'T1_army: FAKER FAKER FAKER',
  'GoldDiffAt15: t1 up 2k, baron is open',
  'ProudGENFan: canyon pls wake up Sadge',
  '>>> 23:40 Faker (Ahri) solo kills Chovy (Azir) in mid lane',
];
const speakers = ['xX_pentakill_Xx', 'ProudGENFan', 'couch_coach', 'T1_army', 'baron_caller', 'kekw_enjoyer', 'GoldDiffAt15', 'NA_hopium7'];
const events = ['>>> 24:10 T1 start Baron', '>>> 24:25 Canyon (Viego) dies to the tower trying to contest', '>>> 24:40 T1 take Baron'];
const t0 = Date.now();
let made = 0;
for (let round = 0; round < 3; round++) {
  for (let i = 0; i < 4; i++) {
    const who = speakers[(round * 4 + i) % speakers.length];
    const prompt = header + log.slice(-18).join('\n') + `\n${who}:`;
    const out = await gen(prompt, { max_new_tokens: 18, temperature: 0.8, top_p: 0.9, do_sample: true, repetition_penalty: 1.2, return_full_text: false });
    let text = (out as unknown as { generated_text: string }[])[0].generated_text.split('\n')[0].trim();
    text = text.replace(/^["'“]|["'”]$/g, '').slice(0, 90);
    if (!text) continue;
    log.push(`${who}: ${text}`); made++;
  }
  log.push(events[round]);
}
console.log(`--- ${model} (${dtype}): ${made} messages in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(log.join('\n'));
