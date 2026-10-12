// Web worker: runs the chat language model off the main thread so the match viewer never stutters.
// Messages in:  { type: 'load', repo, dtype, device } | { type: 'gen', id, prompt, speakers, maxNewTokens }
// Messages out: { type: 'progress', loaded, total } | { type: 'ready', device } | { type: 'error', error }
//               { type: 'result', id, lines: { user, text }[] }
import { pipeline, env, type TextGenerationPipeline } from '@huggingface/transformers';

env.allowLocalModels = false; // weights come from the Hugging Face hub and are cached by the browser

let gen: TextGenerationPipeline | null = null;
const files = new Map<string, { loaded: number; total: number }>();

type In =
  | { type: 'load'; repo: string; dtype: 'q4f16' | 'q4' | 'int8'; device: 'webgpu' | 'wasm' }
  | { type: 'gen'; id: number; prompt: string; speakers: string[]; maxNewTokens: number };

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === 'load') {
    try {
      files.clear();
      gen = await pipeline('text-generation', m.repo, {
        dtype: m.dtype,
        device: m.device,
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status !== 'progress' || !p.file) return;
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
          let loaded = 0, total = 0;
          for (const f of files.values()) { loaded += f.loaded; total += f.total; }
          postMessage({ type: 'progress', loaded, total });
        },
      }) as TextGenerationPipeline;
      postMessage({ type: 'ready', device: m.device });
    } catch (err) {
      postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (m.type === 'gen') {
    const lines: { user: string; text: string }[] = [];
    if (!gen) { postMessage({ type: 'result', id: m.id, lines }); return; }
    // continue the chat log one viewer at a time: each new line becomes context for the next
    let prompt = m.prompt;
    try {
      for (const who of m.speakers) {
        const out = await gen(`${prompt}\n${who}:`, { max_new_tokens: m.maxNewTokens, temperature: 0.8, top_p: 0.9, do_sample: true, repetition_penalty: 1.2, return_full_text: false });
        const text = String((out as unknown as { generated_text: string }[])[0]?.generated_text ?? '').split('\n')[0].trim();
        lines.push({ user: who, text });
        prompt += `\n${who}: ${text}`;
      }
    } catch (err) {
      postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
    }
    postMessage({ type: 'result', id: m.id, lines });
  }
};
