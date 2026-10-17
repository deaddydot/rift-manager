// A small speaker button (mute / unmute) with a volume popover, for the match viewer and the draft.
import { useState } from 'react';
import { useSoundPrefs } from './sound';

export default function SoundToggle({ className = '' }: { className?: string }) {
  const { on, master, set } = useSoundPrefs();
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative inline-flex ${className}`}>
      <button className={`btn py-1! px-2! text-xs! ${on ? '' : 'opacity-70'}`} title={on ? 'Sound on (click to mute) · right-click for volume' : 'Sound off (click to unmute)'}
        onClick={() => set({ on: !on })} onContextMenu={(e) => { e.preventDefault(); setOpen((o) => !o); }}>
        {on ? (master > 0.5 ? '🔊' : '🔉') : '🔇'}
      </button>
      <button className="btn py-1! px-1! text-[10px]! -ml-px" title="Volume" onClick={() => setOpen((o) => !o)}>▾</button>
      {open && (
        <span className="absolute right-0 top-full mt-1 z-30 panel px-3 py-2 flex items-center gap-2 shadow-lg shadow-black/50" onMouseLeave={() => setOpen(false)}>
          <span className="text-[11px] text-muted">Volume</span>
          <input type="range" min={0} max={100} value={Math.round(master * 100)} onChange={(e) => set({ master: Number(e.target.value) / 100, on: true })} className="w-28 accent-[#c8aa6e]" />
          <span className="text-[11px] w-7 text-right font-display">{Math.round(master * 100)}</span>
        </span>
      )}
    </span>
  );
}
