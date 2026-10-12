// Settings → Broadcast casters: which desk calls the live matches (auto by competition, a fixed desk, or subtitles
// off), the English gloss under Vietnamese lines, and the roster with each caster's style.
import { CASTERS, DESKS } from './castersData';
import { useCasterPrefs } from './prefs';

export default function CasterSettings() {
  const { mode, gloss, hidden, setMode, setGloss, setHidden } = useCasterPrefs();
  const opt = (id: string, label: string, note: string) => {
    const on = mode === id;
    return (
      <button key={id} onClick={() => setMode(id)} className={`panel-flat px-3 py-2 text-left transition ${on ? 'border-gold ring-1 ring-gold' : 'hover:border-line2'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold ${on ? 'text-gold2' : ''}`}>{label}</span>
          <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${on ? 'border-gold bg-gold' : 'border-line2'}`} />
        </div>
        <div className="text-[11px] text-muted leading-snug mt-0.5">{note}</div>
      </button>
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">A desk of casters calls your live matches in subtitles under the map: play-by-play on the fights and objectives, colour analysis in the quiet moments, player stats and storylines from your save.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {opt('auto', 'Auto', 'Picked by the competition: Vietnamese matches get Hoàng Luân, internationals the English desk.')}
        {DESKS.map((d) => opt(d.id, d.label, d.note))}
        {opt('off', 'Subtitles off', 'No caster subtitles under the map.')}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={gloss} onChange={(e) => setGloss(e.target.checked)} /> English translation under Vietnamese lines</label>
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Start collapsed</label>
      </div>
      <div className="border-t hairline pt-2 space-y-1.5">
        {Object.values(CASTERS).map((c) => (
          <div key={c.id} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-display font-bold text-[10px]" style={{ background: `${c.color}26`, color: c.color, boxShadow: `inset 0 0 0 1px ${c.color}99` }}>{c.initials}</span>
            <div className="min-w-0"><span className="font-semibold">{c.name}</span> <span className="text-dim">· {c.role === 'pbp' ? 'play-by-play' : c.role === 'colour' ? 'colour' : 'play-by-play & colour'}{c.lang === 'vi' ? ' · Tiếng Việt' : ''}</span><div className="text-muted leading-snug">{c.style}</div></div>
          </div>
        ))}
        <div className="text-[10.5px] text-dim">Caster names belong to the real broadcast personalities; every line is written for this fan game and stays on the match.</div>
      </div>
    </div>
  );
}
