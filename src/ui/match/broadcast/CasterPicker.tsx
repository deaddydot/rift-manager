// Match center, before the series: pick who calls it. The same preference as Settings → Broadcast casters
// (stored per browser, prefs.ts); "Auto" shows which desk it would pick for this match. The Hoàng Luân desks also
// switch the stream chat to Vietnamese YouTube chat (chatVi.ts).
import { useState, type ReactNode } from 'react';
import type { GameState, MatchFixture } from '../../../engine/types';
import { CASTERS, DESKS, type CasterId, type DeskDef } from './castersData';
import { useCasterPrefs } from './prefs';
import { autoDeskFor } from './commentary';

function CasterFace({ id, size = 34, ring }: { id: CasterId; size?: number; ring?: string }) {
  const c = CASTERS[id];
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, boxShadow: `0 0 0 2px ${ring ?? '#0b1220'}` };
  if (c.image && !failed) return <img src={c.image} alt={c.name} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} className="rounded-full object-cover object-top shrink-0 bg-[#0b1220]" style={style} />;
  return <span className="rounded-full shrink-0 flex items-center justify-center font-display font-bold" style={{ ...style, fontSize: size * 0.34, background: `${c.color}33`, color: c.color }}>{c.initials}</span>;
}
function DeskFaces({ d, size = 34 }: { d: DeskDef; size?: number }) {
  return (
    <span className="flex items-center shrink-0">
      <CasterFace id={d.pbp} size={size} />
      {d.colour !== d.pbp && <span className="-ml-2.5"><CasterFace id={d.colour} size={size} /></span>}
    </span>
  );
}

export default function CasterPicker({ state, fixture }: { state: GameState; fixture: MatchFixture }) {
  const mode = useCasterPrefs((x) => x.mode);
  const setMode = useCasterPrefs((x) => x.setMode);
  const auto = autoDeskFor(state, fixture);
  const card = (id: string, on: boolean, body: ReactNode, title?: string) => (
    <button key={id} title={title} onClick={() => setMode(id)} className={`panel-flat px-2.5 py-2 flex items-center gap-2.5 text-left transition min-w-0 ${on ? 'border-gold ring-1 ring-gold bg-gold/10' : 'hover:border-line2'}`}>{body}</button>
  );
  return (
    <div className="mt-5 pt-4 border-t hairline">
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <div className="text-[11px] uppercase tracking-widest text-muted font-bold">🎙 Who calls the series</div>
        <div className="text-[11px] text-dim">Your pick is remembered for every match · Vietnamese desks also switch the stream chat to Vietnamese</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        {card('auto', mode === 'auto', <>
          <DeskFaces d={auto} size={30} />
          <div className="min-w-0"><div className={`text-sm font-semibold ${mode === 'auto' ? 'text-gold2' : ''}`}>Auto</div><div className="text-[10.5px] text-muted truncate">→ {auto.label}</div></div>
        </>, 'Picked by the competition')}
        {DESKS.map((d) => card(d.id, mode === d.id, <>
          <DeskFaces d={d} size={30} />
          <div className="min-w-0"><div className={`text-sm font-semibold truncate ${mode === d.id ? 'text-gold2' : ''}`}>{d.label}</div><div className="text-[10.5px] text-muted truncate">{d.note}</div></div>
        </>, `${CASTERS[d.pbp].style}${d.colour !== d.pbp ? `\n${CASTERS[d.colour].style}` : ''}`))}
        {card('off', mode === 'off', <>
          <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center bg-[#0b1220] text-dim shrink-0">🔇</span>
          <div className="min-w-0"><div className={`text-sm font-semibold ${mode === 'off' ? 'text-gold2' : ''}`}>No casters</div><div className="text-[10.5px] text-muted truncate">Just the game</div></div>
        </>)}
      </div>
    </div>
  );
}
