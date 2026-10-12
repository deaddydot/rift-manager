import { useGame, useStore, nav } from '../../store/game';
import { Panel, Portrait, Rating, ChampIcon, Bar, ratingColor } from '../components/kit';
import { ATTRIBUTE_LABEL, ATTRIBUTE_KEYS, ROLE_LABEL, type PlayerAttributes } from '../../engine/types';
import { overall, ageOn } from '../../engine/setup';
import { DEFAULT_PLAN, ageCurve } from '../../engine/management/development';
import { headCoach } from '../../engine/season/prep';
import { gd } from '../../data/gamedata';

const BLOCKS = [
  { k: 'scrims', label: 'Scrims', desc: 'Team play, teamfighting, macro' },
  { k: 'soloq', label: 'Solo queue', desc: 'Mechanics, laning, champion practice' },
  { k: 'vod', label: 'VOD review', desc: 'Macro, vision, pathing, shotcalling' },
  { k: 'rest', label: 'Rest', desc: 'Fatigue recovery, morale' },
] as const;

export default function Training() {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const team = state.teams[state.userTeamId];
  const plan = state.trainingPlan ?? (state.trainingPlan = { ...DEFAULT_PLAN });
  const coach = headCoach(state, team);
  const setBlock = (k: (typeof BLOCKS)[number]['k'], v: number) => {
    const others = BLOCKS.filter((b) => b.k !== k);
    plan[k] = v;
    const rest = Math.max(0, 100 - v);
    const sumOthers = others.reduce((s, b) => s + plan[b.k], 0) || 1;
    let acc = 0;
    others.forEach((b, i) => { const val = i === others.length - 1 ? rest - acc : Math.round((plan[b.k] / sumOthers) * rest); plan[b.k] = Math.max(0, val); acc += plan[b.k]; });
    bump();
  };
  const roster = team.roster.map((id) => state.players[id]).filter(Boolean);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Training</h1>
      <div className="grid grid-cols-3 gap-4">
        <Panel title="Weekly schedule" className="col-span-2">
          <div className="flex gap-2 mb-4">
            {(['light', 'balanced', 'intense'] as const).map((i) => (
              <button key={i} className={`btn ${plan.intensity === i ? 'btn-gold' : ''}`} onClick={() => { plan.intensity = i; bump(); }}>{i[0].toUpperCase() + i.slice(1)}</button>
            ))}
            <span className="text-xs text-muted self-center ml-2">{plan.intensity === 'intense' ? 'Faster growth, more fatigue.' : plan.intensity === 'light' ? 'Slower growth, fresher players.' : 'Steady growth.'}</span>
          </div>
          <div className="space-y-4">
            {BLOCKS.map((b) => (
              <div key={b.k}>
                <div className="flex justify-between text-sm"><span className="font-semibold">{b.label} <span className="text-muted font-normal">· {b.desc}</span></span><span className="font-display font-bold text-gold2">{plan[b.k]}%</span></div>
                <input type="range" min={0} max={80} value={plan[b.k]} onChange={(e) => setBlock(b.k, Number(e.target.value))} className="w-full accent-[#c8aa6e]" />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Training quality">
          <div className="space-y-2 text-sm">
            <Bar label="Head coach (training)" value={coach?.attributes.training ?? 30} />
            <Bar label="Training facility" value={team.facilities.trainingFacility * 20} />
            <Bar label="Wellness center" value={team.facilities.wellness * 20} />
            <Bar label="Academy program" value={team.facilities.academy * 20} />
            <div className="text-xs text-muted pt-2">Young players grow fastest (until ~21), plateau around 22–25, and slowly decline after 26 — experience keeps their macro sharp. Work ethic, potential and mentors on the roster matter.</div>
          </div>
        </Panel>
      </div>
      <Panel title="Individual focus" bodyClass="p-0">
        <table className="tbl">
          <thead><tr><th></th><th>Player</th><th>Age</th><th>OVR</th><th>Growth outlook</th><th>Focus attribute</th><th>Learning champion</th><th>Fatigue</th></tr></thead>
          <tbody>{roster.map((p) => {
            const age = ageOn(p.birthdate, state.date) ?? 22;
            const curve = ageCurve(age);
            const ovr = overall(p.attributes, p.role);
            const room = p.hidden.potential - ovr;
            const outlook = curve < 0 ? 'Declining' : room > 12 ? 'High upside' : room > 5 ? 'Developing' : 'At peak';
            return (
              <tr key={p.id}>
                <td className="w-10"><Portrait player={p} team={team} size={30} /></td>
                <td><button className="font-semibold hover:underline" onClick={() => nav('player', p.id)}>{p.handle}</button><div className="text-[11px] text-dim">{ROLE_LABEL[p.role]}</div></td>
                <td>{Math.floor(age)}</td>
                <td><Rating v={ovr} size="sm" /></td>
                <td style={{ color: curve < 0 ? '#f87171' : room > 12 ? ratingColor(90) : '#cbd5e1' }}>{outlook}</td>
                <td>
                  <select className="input" value={p.trainingFocus ?? ''} onChange={(e) => { p.trainingFocus = (e.target.value || null) as keyof PlayerAttributes | 'champion' | null; bump(); }}>
                    <option value="">General</option>
                    {ATTRIBUTE_KEYS.filter((k) => k !== 'aggression' && k !== 'clutch').map((k) => <option key={k} value={k}>{ATTRIBUTE_LABEL[k]}</option>)}
                    <option value="champion">Champion practice</option>
                  </select>
                </td>
                <td>{p.learningChampion ? <span className="flex items-center gap-2"><ChampIcon id={p.learningChampion} size={22} />{gd().championById[p.learningChampion]?.name} ({Math.round(p.champions[p.learningChampion] ?? 0)})</span> : <button className="btn btn-ghost text-xs" onClick={() => nav('player', p.id)}>Choose…</button>}</td>
                <td className={p.fatigue > 70 ? 'text-orange-400' : ''}>{Math.round(p.fatigue)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </Panel>
    </div>
  );
}
