// Personal profile (management/persona.ts) on the player page, and its editor for the in-game Editor.
// Height and languages are public; the other stats are hidden and narrow with scouting knowledge.
import { useGame } from '../../store/game';
import type { Player, PlayerPersona } from '../../engine/types';
import { Panel, num } from './kit';
import { personaOf, PERSONA_LABEL, PERSONA_HINT, PERSONA_HIDDEN, type PersonaKey } from '../../engine/management/persona';
import { streamAppeal, merchAppeal } from '../../engine/management/traitEffects';
import { weeklyStreamFans } from '../../engine/management/personaTick';

const appealLabel = (a: number) => (a >= 70 ? 'Huge draw' : a >= 60 ? 'Big draw' : a >= 50 ? 'Solid audience' : a >= 40 ? 'Modest audience' : 'Niche');

function RangeRow({ label, hint, lo, hi, color = '#c8aa6eaa' }: { label: string; hint?: string; lo: number; hi: number; color?: string }) {
  return (
    <div className="flex items-center gap-2" title={hint}>
      <div className="w-32 text-muted">{label}</div>
      <div className="flex-1 h-1.5 bg-[#0a1120] rounded-full relative">
        <div className="absolute h-full rounded-full" style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%`, background: color }} />
      </div>
      <div className="w-14 text-right font-display font-bold">{lo === hi ? lo : `${lo}-${hi}`}</div>
    </div>
  );
}

/** What the revealed profile means in practice (only shown once the values are reasonably known). */
function notes(p: Player, s: PlayerPersona): string[] {
  const out: string[] = [];
  if (s.humor + s.charisma >= 125) out.push('Easy to get along with: humor and charisma lift locker-room relationships.');
  else if (s.humor + s.charisma <= 75) out.push('Keeps to themselves: bonds with teammates form slowly.');
  if (s.smarts >= 65) out.push('Studies the game off the Rift: faster macro / vision growth and champion learning.');
  else if (s.smarts <= 35) out.push('Learns slowly away from the keyboard.');
  if (s.stamina >= 65) out.push('High stamina: tires slowly and recovers quickly.');
  else if (s.stamina <= 35) out.push('Low stamina: fatigue builds up faster.');
  if (s.media >= 65) out.push('Comfortable with the press: good interviews lift fans and hype.');
  else if (s.media <= 35) out.push('Prone to press gaffes.');
  if (s.comms >= 65) out.push('Clear voice comms: a small shotcalling boost in game.');
  else if (s.comms <= 35) out.push('Quiet on comms: slightly weaker shotcalling in game.');
  if (s.online >= 68 && s.media < 50) out.push('Very online: more stream growth, more online drama.');
  if (merchAppeal(p) >= 0.5) out.push('A merch draw: boosts jersey and signature sales.');
  return out;
}

export default function PlayerProfile({ playerId, know }: { playerId: string; know: number }) {
  const state = useGame();
  const p = state.players[playerId];
  if (!p) return null;
  const s = personaOf(p);
  const mine = p.teamId === state.userTeamId;
  const k = mine ? 100 : know;
  const w = Math.round((100 - k) * 0.35);
  const range = (v: number): [number, number] => [Math.max(1, Math.round(v) - w), Math.min(99, Math.round(v) + w)];
  const team = p.teamId ? state.teams[p.teamId] : null;
  const appeal = streamAppeal(p);
  const [alo, ahi] = range(appeal);
  return (
    <Panel title="Personal profile" right={<span className="text-[11px] text-muted">Knowledge {Math.round(k)}%</span>}>
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="panel-flat py-1.5"><div className="font-display font-bold">{s.height} cm</div><div className="text-[10px] uppercase tracking-wider text-muted">{PERSONA_LABEL.height}</div></div>
        <div className="panel-flat py-1.5" title={PERSONA_HINT.languages}><div className="font-display font-bold">{s.languages}</div><div className="text-[10px] uppercase tracking-wider text-muted">{PERSONA_LABEL.languages}</div></div>
        <div className="panel-flat py-1.5" title="Stream / social following"><div className="font-display font-bold">{p.streamer ? num(s.followers ?? 0) : '—'}</div><div className="text-[10px] uppercase tracking-wider text-muted">{p.streamer ? 'Followers' : 'Not streaming'}</div></div>
      </div>
      <div className="space-y-1.5 text-xs">
        {PERSONA_HIDDEN.map((key: PersonaKey) => { const [lo, hi] = range(s[key] as number); return <RangeRow key={key} label={PERSONA_LABEL[key]} hint={PERSONA_HINT[key]} lo={lo} hi={hi} />; })}
        <RangeRow label="Stream appeal" hint="Looks, humor, charisma and online presence, plus traits" lo={alo} hi={ahi} color="#38bdf8aa" />
      </div>
      {p.streamer && team && k >= 60 && (
        <div className="text-[11px] text-muted mt-2">
          <b className="text-text">Streaming:</b> {appealLabel(appeal)} — about +{num(weeklyStreamFans(team, p))} fans a week for {team.short}.
        </div>
      )}
      {k >= 70 ? (
        <div className="mt-2 space-y-0.5">{notes(p, s).slice(0, 4).map((t) => <div key={t} className="text-[11px] text-muted">• {t}</div>)}</div>
      ) : <div className="text-[11px] text-dim mt-2">Scout this player to learn more about their personality off the Rift.</div>}
    </Panel>
  );
}

const DEFAULT_PERSONA: PlayerPersona = { height: 176, looks: 50, humor: 50, charisma: 50, smarts: 50, media: 50, stamina: 55, comms: 50, online: 50, style: 50, languages: 1 };

/** Editor panel: height, languages and the hidden profile stats. `player` provides the defaults when nothing was edited yet. */
export function PersonaEditor({ value, player, onChange }: { value?: PlayerPersona; player?: Player; onChange: (v: PlayerPersona) => void }) {
  const base = value ?? (player ? personaOf(player) : DEFAULT_PERSONA);
  const set = (patch: Partial<PlayerPersona>) => onChange({ ...base, ...patch });
  return (
    <Panel title="Personal profile" right={<span className="text-[11px] text-dim">Off the Rift · hidden except height & languages</span>}>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-dim font-bold">Height (cm)</span>
          <input type="number" className="input" min={150} max={210} value={base.height} onChange={(e) => set({ height: Math.max(150, Math.min(210, Number(e.target.value) || 176)) })} /></label>
        <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wider text-dim font-bold">Languages</span>
          <select className="input" value={base.languages} onChange={(e) => set({ languages: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      <div className="flex flex-col gap-1.5">
        {PERSONA_HIDDEN.map((key) => (
          <div key={key} className="flex items-center gap-2 text-xs" title={PERSONA_HINT[key]}>
            <div className="w-32 text-muted truncate">{PERSONA_LABEL[key]}</div>
            <input type="range" min={1} max={99} value={base[key] as number} onChange={(e) => set({ [key]: Number(e.target.value) })} className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: '#38bdf8' }} />
            <div className="w-8 text-right font-display font-bold">{base[key] as number}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
