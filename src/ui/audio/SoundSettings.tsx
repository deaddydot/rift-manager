// Settings → Sound: on / off, master volume and the three categories (champ select, voices, match).
import { useSoundPrefs, draftSound, champVoice, ping, sting } from './sound';

function Slider({ label, desc, value, onChange, onTest }: { label: string; desc: string; value: number; onChange: (v: number) => void; onTest?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0"><div className="text-sm font-semibold">{label}</div><div className="text-[11px] text-muted leading-snug">{desc}</div></div>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="flex-1 accent-[#c8aa6e]" />
      <span className="w-8 text-right font-display text-sm">{Math.round(value * 100)}</span>
      {onTest && <button className="btn btn-ghost py-0.5! px-2! text-xs!" onClick={onTest}>▶ Test</button>}
    </div>
  );
}

export default function SoundSettings() {
  const p = useSoundPrefs();
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={p.on} onChange={(e) => p.set({ on: e.target.checked })} className="accent-[#c8aa6e]" /> Sound on</label>
      <div className={`space-y-3 ${p.on ? '' : 'opacity-50 pointer-events-none'}`}>
        <Slider label="Master" desc="Everything" value={p.master} onChange={(v) => p.set({ master: v })} />
        <Slider label="Champ select" desc="Draft sounds: picks, bans, your turn" value={p.ui} onChange={(v) => p.set({ ui: v })} onTest={() => draftSound('pickLeft')} />
        <Slider label="Champion voices" desc="Pick and ban lines" value={p.voice} onChange={(v) => p.set({ voice: v })} onTest={() => champVoice('Ahri', 'pick', 0)} />
        <Slider label="Match" desc="Pings, kills, objectives, ultimates" value={p.match} onChange={(v) => p.set({ match: v })} onTest={() => { ping('danger'); setTimeout(() => sting('killUs'), 450); setTimeout(() => sting('baron'), 900); }} />
      </div>
      <div className="text-[11px] text-dim leading-relaxed">Champ select sounds, champion voice lines and signature sounds are the League client's (via CommunityDragon; voices stream when needed). Match pings and stingers are made for this game. An ultimate plays the casting champion's signature sound.</div>
    </div>
  );
}
