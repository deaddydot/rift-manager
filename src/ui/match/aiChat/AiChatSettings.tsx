// Settings panel for the AI chat: on/off, which model, and what it's doing (download progress, device).
import { useAiChat } from './client';
import { AI_CHAT_MODELS, aiModel } from './models';

export default function AiChatSettings() {
  const { enabled, model, status, progress, device, error, made, rejected, recent, setEnabled, setModel } = useAiChat();
  const m = aiModel(model);
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const statusText =
    status === 'loading' ? `Downloading & loading the model… ${Math.round(progress * 100)}%` :
    status === 'ready' ? `Running on ${device === 'webgpu' ? 'your graphics card (WebGPU)' : 'the CPU (slower)'} · ${made} lines written this session${rejected ? `, ${rejected} filtered out` : ''}` :
    status === 'error' ? `Couldn't start: ${error}` :
    status === 'unsupported' ? error ?? 'Not supported in this browser.' :
    enabled ? 'Starts with the next live match.' : 'Off — chat uses the built-in lines only.';
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-sm">AI chat <span className="text-[10px] uppercase tracking-wider text-gold2 border border-gold/40 rounded px-1 ml-1">experimental</span></div>
          <div className="text-xs text-muted max-w-xl">
            A small language model runs in your browser and writes part of the live match chat from what's happening in the game. Nothing leaves your computer.
            It downloads once (~{webgpu ? m.mb.webgpu : m.mb.wasm} MB for {m.label}) and is cached afterwards. Runs best with WebGPU (recent Chrome / Edge); otherwise it uses the CPU.
          </div>
        </div>
        <button role="switch" aria-checked={enabled} aria-label="AI chat" onClick={() => setEnabled(!enabled)}
          className={`shrink-0 w-11 h-6 rounded-full relative transition ${enabled ? 'bg-gold' : 'bg-panel2 border hairline'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {AI_CHAT_MODELS.map((x) => (
          <button key={x.id} onClick={() => setModel(x.id)} title={x.blurb}
            className={`text-xs px-2.5 py-1.5 rounded border ${x.id === model ? 'border-gold/70 text-gold2 bg-[#121b30]' : 'border-line text-muted hover:text-text'}`}>
            {x.label} <span className="text-dim">· {webgpu ? x.mb.webgpu : x.mb.wasm} MB</span>
          </button>
        ))}
      </div>
      <div className="text-xs text-muted">{m.blurb}</div>
      <div className="text-xs">
        <span className={status === 'error' ? 'text-red-400' : status === 'ready' ? 'text-green-400' : 'text-muted'}>{statusText}</span>
        {status === 'loading' && <div className="mt-1.5 h-1.5 w-64 bg-panel2 rounded-full overflow-hidden"><div className="h-full bg-gold transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      </div>
      {recent.length > 0 && (
        <div className="text-xs font-mono text-dim space-y-0.5 border-l-2 border-gold/30 pl-2">
          <div className="text-[10px] uppercase tracking-wider text-muted font-sans">Latest from the model</div>
          {recent.map((l, i) => <div key={i} className="truncate">{l}</div>)}
        </div>
      )}
    </div>
  );
}
