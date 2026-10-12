// Small language models the AI chat can run in the browser (ONNX weights from Hugging Face, cached by the
// browser after the first download). WebGPU runs the 4-bit fp16 weights; without it, int8 on the CPU (WASM).
export interface AiChatModel {
  id: string;
  label: string;
  repo: string;
  /** download size in MB for WebGPU / CPU */
  mb: { webgpu: number; wasm: number };
  blurb: string;
}

export const AI_CHAT_MODELS: AiChatModel[] = [
  { id: 'qwen3-0.6b', label: 'Qwen3 0.6B', repo: 'onnx-community/Qwen3-0.6B-ONNX', mb: { webgpu: 570, wasm: 618 }, blurb: 'Steadier: short messages that follow the game.' },
  { id: 'qwen2.5-0.5b', label: 'Qwen2.5 0.5B', repo: 'onnx-community/Qwen2.5-0.5B-Instruct', mb: { webgpu: 483, wasm: 512 }, blurb: 'Livelier and a little smaller, but noisier.' },
  { id: 'smollm2-360m', label: 'SmolLM2 360M', repo: 'HuggingFaceTB/SmolLM2-360M-Instruct', mb: { webgpu: 273, wasm: 365 }, blurb: 'Lightest download; often rambles (most lines get filtered out).' },
];
export const DEFAULT_AI_MODEL = 'qwen3-0.6b';
export const aiModel = (id: string) => AI_CHAT_MODELS.find((m) => m.id === id) ?? AI_CHAT_MODELS[0];
