import type { ReactNode } from 'react';
import { useGame, useStore } from '../../store/game';
import { Panel } from '../components/kit';
import type { TeamTactics } from '../../engine/types';

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; desc: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={`panel-flat p-3 text-left transition ${value === o.id ? 'border-gold ring-1 ring-gold' : 'hover:border-line2'}`}>
          <div className="font-semibold">{o.label}</div>
          <div className="text-xs text-muted mt-0.5">{o.desc}</div>
        </button>
      ))}
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[260px_1fr] gap-5 py-4 border-b hairline last:border-0">
      <div><div className="font-display text-lg font-bold">{title}</div><div className="text-xs text-muted">{desc}</div></div>
      <div>{children}</div>
    </div>
  );
}

export default function Tactics() {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const t = state.teams[state.userTeamId].tactics;
  const set = <K extends keyof TeamTactics>(k: K, v: TeamTactics[K]) => { t[k] = v; bump(); };
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Tactics</h1>
      <p className="text-muted text-sm max-w-3xl">Your instructions shape how the team plays in the simulator — how willingly they take fights, which objectives they prioritise and how they use the side lanes. Players still make their own decisions based on their attributes, hidden traits and the composition they drafted.</p>
      <Panel>
        <Row title="Aggression" desc="Willingness to take fights, dive and force plays.">
          <input type="range" min={5} max={95} value={t.aggression} onChange={(e) => set('aggression', Number(e.target.value))} className="w-full accent-[#c8aa6e]" />
          <div className="flex justify-between text-xs text-muted"><span>Patient / scaling</span><span className="font-display text-lg text-gold2">{t.aggression}</span><span>All-in aggression</span></div>
        </Row>
        <Row title="Early-game focus" desc="Where the jungler paths and the team invests early pressure.">
          <Choice value={t.earlyFocus} onChange={(v) => set('earlyFocus', v)} options={[
            { id: 'balanced', label: 'Balanced', desc: 'Play to the map state.' }, { id: 'top', label: 'Top side', desc: 'Grubs, Herald and top lane pressure.' },
            { id: 'mid', label: 'Mid', desc: 'Mid priority, roams to both sides.' }, { id: 'bot', label: 'Bot side', desc: 'Dragons and bot lane snowballing.' },
          ]} />
        </Row>
        <Row title="Objective priority" desc="Which neutral objectives the team values most.">
          <Choice value={t.objectivePriority} onChange={(v) => set('objectivePriority', v)} options={[
            { id: 'balanced', label: 'Balanced', desc: 'Take what the map gives.' }, { id: 'dragons', label: 'Dragon stacking', desc: 'Play for soul.' },
            { id: 'grubs', label: 'Grubs & Herald', desc: 'Tower pressure, early plates.' }, { id: 'baron', label: 'Baron', desc: 'Force Baron calls in the mid game.' },
          ]} />
        </Row>
        <Row title="Lane swaps" desc="Send the bot duo top at the start (and the top laner bot) to deny or snowball.">
          <Choice value={t.laneSwap} onChange={(v) => set('laneSwap', v)} options={[
            { id: 'auto', label: 'When favourable', desc: 'Shotcaller decides each game.' }, { id: 'never', label: 'Never', desc: 'Standard lanes.' }, { id: 'always', label: 'Always', desc: 'Swap every game.' },
          ] as never} />
        </Row>
        <Row title="Mid/late-game style" desc="How the team plays once laning ends.">
          <Choice value={t.playstyle} onChange={(v) => set('playstyle', v)} options={[
            { id: 'balanced', label: 'Balanced', desc: 'Group for objectives, farm sides otherwise.' }, { id: 'teamfight', label: '5v5 teamfighting', desc: 'Stay grouped, force fights.' },
            { id: 'splitpush', label: '1-3-1 split push', desc: 'Side laners apply pressure.' }, { id: 'pick', label: 'Pick comp', desc: 'Catch players out with vision.' },
            { id: 'siege', label: 'Siege & poke', desc: 'Chip towers, avoid all-ins.' },
          ]} />
        </Row>
        <Row title="Vision focus" desc="How many resources supports and junglers spend on wards and sweeping.">
          <input type="range" min={10} max={95} value={t.visionFocus} onChange={(e) => set('visionFocus', Number(e.target.value))} className="w-full accent-[#c8aa6e]" />
          <div className="flex justify-between text-xs text-muted"><span>Minimal</span><span className="font-display text-lg text-gold2">{t.visionFocus}</span><span>Vision control</span></div>
        </Row>
      </Panel>
    </div>
  );
}
