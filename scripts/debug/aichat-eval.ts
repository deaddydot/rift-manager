// Quality check for the AI chat: run candidate small models on the same match situation and print the
// chat they write, with timing. Usage: npx tsx scripts/debug/aichat-eval.ts <model id> [dtype]
import { pipeline, env } from '@huggingface/transformers';
env.cacheDir = process.env.HF_CACHE ?? env.cacheDir;
const model = process.argv[2] ?? 'onnx-community/LFM2-350M-ONNX';
const dtype = (process.argv[3] ?? 'q4') as 'q4';
const SYSTEM = `You write Twitch chat messages for a live League of Legends esports broadcast. Viewers are fans of both teams.
Rules: each message is short (2-12 words), casual, lowercase allowed, Twitch emotes as words (KEKW, Pog, PogChamp, monkaS, Copium, LUL, Sadge, EZ, OMEGALUL, 5Head). Mix hype, memes, jokes, backseat calls, and fans arguing. Mention players and champions from the situation. Sometimes reply to another chatter with @name. Be playful, never hateful or vulgar.
Output exactly 8 lines, each "username: message".`;
const situations = [
  `T1 vs Gen.G, LCK Cup final, game 3 (series 1-1). 23:40, gold T1 +2.1k, kills 9-6.
Just happened: Faker (Ahri) killed Chovy (Azir) solo mid. T1 took Baron. Gen.G's Canyon (Viego) died to tower.
Recent chat: "gg_go_next: gen gonna throw again" | "T1_army: FAKER FAKER FAKER"`,
  `KT Rolster vs Dplus KIA, regular season. 8:15, gold even, kills 1-2.
Just happened: nothing for 2 minutes, both teams farming. Dragon spawns in 1 minute.
Recent chat: "couch_coach: this is so boring" | "drakepitdweller: ResidentSleeper"`,
];
const gen = await pipeline('text-generation', model, { dtype, device: 'cpu' });
for (const s of situations) {
  const t0 = Date.now();
  const out = await gen([{ role: 'system', content: SYSTEM }, { role: 'user', content: `Situation:\n${s}\n\nChat:` }], { max_new_tokens: 160, temperature: 0.9, top_p: 0.95, do_sample: true, repetition_penalty: 1.15 });
  const msg = (out as unknown as { generated_text: { role: string; content: string }[] }[])[0].generated_text.at(-1)!.content;
  console.log(`--- ${model} (${dtype}) ${((Date.now() - t0) / 1000).toFixed(1)}s\n${msg}\n`);
}
