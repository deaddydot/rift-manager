import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MASTERY_MAX, masteryTier } from '../../engine/mastery';
import { useGame, useStore, nav } from '../../store/game';
import type { GameState, Player, Team, Role, PlayerAttributes, HiddenAttributes, FacilityKey, Staff, StaffRole } from '../../engine/types';
import { ROLES, ROLE_LABEL, ATTRIBUTE_KEYS, ATTRIBUTE_LABEL, HIDDEN_LABEL, FACILITY_INFO, REGION_LABEL } from '../../engine/types';
import { TRAITS } from '../../engine/traits';
import { gd } from '../../data/gamedata';
import { overall, marketValue, salaryFor } from '../../engine/setup';
import { playerOvr } from '../../engine/management/transfers';
import { HIDDEN_KEYS, HIDDEN_NEGATIVE } from '../../engine/management/scouting';
import { setBoardObjectives } from '../../engine/game';
import { addInbox } from '../../engine/management/news';
import {
  type PlayerDraft, type TeamDraft, type LibraryPlayer, type LibraryTeam, FACILITY_KEYS,
  blankPlayerDraft, draftFromPlayer, createCustomPlayer, applyPlayerDraft, deleteCustomPlayer, autoReputation, suggestedSalary,
  blankTeamDraft, draftFromTeam, createCustomTeam, applyTeamDraft, deleteCustomTeam, teamInCompetitions,
  toLibraryPlayer, toLibraryTeam, importLibraryPlayer, draftFromLibraryTeam,
  type StaffDraft, blankStaffDraft, draftFromStaff, createCustomStaff, applyStaffDraft, deleteCustomStaff, autoStaffReputation, suggestedStaffSalary, staffDraftIssues,
} from '../../engine/management/custom';
import { MAX_STAFF, STAFF_ATTRS, STAFF_ATTR_LABEL, STAFF_ROLE_INFO, staffRating, allStaff, findStaff } from '../../engine/management/staffMarket';
import { getCustomLibrary, setCustomLibrary } from '../../store/persist';
import { Panel, Stat, Tabs, Modal, Rating, Portrait, Avatar, Pill, TeamLogo, ChampIcon, RoleIcon, Empty, money, num, flag, ratingColor } from '../components/kit';
import { playerAge, teamRating } from './worldKit';
import { PersonaEditor } from '../components/PlayerProfile';
import { RATING_MAX, ratingBand, marketDrift } from '../../engine/ratings';

type Kind = 'overview' | 'player' | 'team' | 'staff';
interface Library { players: LibraryPlayer[]; teams: LibraryTeam[] }

const COUNTRIES = [
  'South Korea', 'China', 'Taiwan', 'Hong Kong', 'Vietnam', 'Japan', 'Philippines', 'Thailand', 'Malaysia', 'Singapore', 'Indonesia', 'Australia', 'New Zealand',
  'United States', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Uruguay', 'Venezuela',
  'France', 'Germany', 'Spain', 'Portugal', 'Italy', 'United Kingdom', 'Ireland', 'Netherlands', 'Belgium', 'Denmark', 'Sweden', 'Norway', 'Finland', 'Iceland',
  'Poland', 'Czech Republic', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Serbia', 'Croatia', 'Slovenia', 'Greece', 'Cyprus', 'Turkey', 'Austria', 'Switzerland',
  'Lithuania', 'Latvia', 'Estonia', 'Ukraine', 'Russia', 'Israel', 'Egypt', 'Morocco', 'Tunisia', 'Saudi Arabia', 'United Arab Emirates', 'Lebanon', 'Jordan',
];

// pending drafts handed over from the overview/library to the editors
let pendingTeamDraft: TeamDraft | null = null;

const notify = (m: string) => useStore.getState().notify(m);
const bump = () => useStore.getState().bump();

async function readImage(file: File, size: number, mode: 'cover' | 'contain'): Promise<string> {
  const src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Invalid image')); i.src = src; });
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (mode === 'cover') {
    const s = Math.max(size / w, size / h);
    const dw = w * s, dh = h * s;
    ctx.drawImage(img, (size - dw) / 2, Math.min(0, (size - dh) * 0.15), dw, dh); // bias crop towards the top (faces)
  } else {
    const s = Math.min(size / w, size / h);
    const dw = w * s, dh = h * s;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }
  const webp = c.toDataURL('image/webp', 0.86);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
}

async function loadLibrary(): Promise<Library> {
  const raw = await getCustomLibrary();
  return { players: (raw.players ?? []) as LibraryPlayer[], teams: (raw.teams ?? []) as LibraryTeam[] };
}
async function upsertLibrary(patch: { player?: LibraryPlayer; team?: LibraryTeam }) {
  const lib = await loadLibrary();
  if (patch.player) lib.players = [patch.player, ...lib.players.filter((x) => x.id !== patch.player!.id)];
  if (patch.team) lib.teams = [patch.team, ...lib.teams.filter((x) => x.id !== patch.team!.id)];
  await setCustomLibrary(lib);
  return lib;
}

function switchToTeam(state: GameState, teamId: string) {
  const team = state.teams[teamId];
  if (!team) return;
  state.userTeamId = teamId;
  setBoardObjectives(state);
  addInbox(state, {
    from: 'The Board', kind: 'board', subject: `Welcome to ${team.name}, ${state.manager.name}!`,
    body: `You are now the General Manager of ${team.name}.\n\nObjectives:\n${state.board.objectives.map((o) => '• ' + o.text).join('\n')}`,
  });
  bump();
  notify(`You now manage ${team.name}`);
  nav('home');
}

// ------------------------------------------------------------------ page
export default function Editor({ kind, targetId }: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const k: Kind = kind === 'player' || kind === 'team' || kind === 'staff' ? kind : 'overview';
  const editingPlayer = k === 'player' && targetId ? state.players[targetId] : undefined;
  const editingTeam = k === 'team' && targetId ? state.teams[targetId] : undefined;
  const editingStaff = k === 'staff' && targetId ? findStaff(state, targetId) : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Editor</h1>
          <div className="text-sm text-muted mt-1">
            {k === 'player' ? (editingPlayer ? `Editing player ${editingPlayer.handle}${editingPlayer.isCustom ? ' (custom)' : ''}` : 'Create a new custom player')
              : k === 'team' ? (editingTeam ? `Editing team ${editingTeam.name}${editingTeam.isCustom ? ' (custom)' : ''}` : 'Create a new custom team')
                : k === 'staff' ? (editingStaff ? `Editing staff ${editingStaff.handle}${editingStaff.isCustom ? ' (custom)' : ''}` : 'Create a new custom staff member')
                  : 'Create custom players, teams & staff, edit anything in the world, and share content between careers'}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => nav('editor', 'player')}>+ New player</button>
          <button className="btn" onClick={() => nav('editor', 'team')}>+ New team</button>
          <button className="btn" onClick={() => nav('editor', 'staff')}>+ New staff</button>
        </div>
      </div>
      <div>
        <Tabs<Kind> value={k} onChange={(x) => nav('editor', x === 'overview' ? undefined : x)} tabs={[{ id: 'overview', label: 'Custom content & library' }, { id: 'player', label: 'Player editor' }, { id: 'team', label: 'Team editor' }, { id: 'staff', label: 'Staff editor' }]} />
        {k === 'overview' && <Overview state={state} />}
        {k === 'player' && (targetId && !editingPlayer ? <Empty>Player “{targetId}” not found.</Empty> : <PlayerEditor key={targetId ?? 'new'} state={state} target={editingPlayer} />)}
        {k === 'team' && (targetId && !editingTeam ? <Empty>Team “{targetId}” not found.</Empty> : <TeamEditor key={targetId ?? 'new'} state={state} target={editingTeam} />)}
        {k === 'staff' && (targetId && !editingStaff ? <Empty>Staff member “{targetId}” not found.</Empty> : <StaffEditor key={targetId ?? 'new'} state={state} target={editingStaff} />)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ shared widgets
function Slider({ label, value, onChange, min = 1, max = 99, negative, neutral, hint }: { label: ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; negative?: boolean; neutral?: boolean; hint?: string }) {
  const c = neutral ? '#38bdf8' : ratingColor(negative ? 100 - value : value);
  return (
    <div className="flex items-center gap-2 text-xs" title={hint}>
      <div className="w-40 text-muted truncate">{label}</div>
      <input type="range" min={min} max={max} value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: c }} />
      <input type="number" min={min} max={max} value={Math.round(value)} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} className="input w-14 py-0.5 text-center font-display font-bold" style={{ color: c }} />
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-dim font-bold">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-dim">{hint}</span>}
    </label>
  );
}

function TeamSelect({ state, value, onChange, allowFree = true, exclude }: { state: GameState; value: string | null; onChange: (v: string | null) => void; allowFree?: boolean; exclude?: string }) {
  const leagues = Object.values(state.leagues).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  return (
    <select className="input w-full" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowFree && <option value="">— Free agent —</option>}
      {leagues.map((l) => {
        const teams = Object.values(state.teams).filter((t) => t.leagueId === l.id && t.id !== exclude).sort((a, b) => a.name.localeCompare(b.name));
        if (!teams.length) return null;
        return <optgroup key={l.id} label={`${l.name} (Tier ${l.tier})`}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === state.userTeamId ? ' (your team)' : ''}</option>)}</optgroup>;
      })}
    </select>
  );
}

function ImageUpload({ label, onImage, onClear, size, mode, has }: { label: string; onImage: (d: string) => void; onClear: () => void; size: number; mode: 'cover' | 'contain'; has: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <label className="btn cursor-pointer text-xs px-2 py-1">{label}
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { setErr(null); onImage(await readImage(f, size, mode)); } catch (x) { setErr(String((x as Error).message ?? x)); }
          }} />
        </label>
        {has && <button className="btn btn-ghost text-xs px-2 py-1" onClick={onClear}>Remove</button>}
      </div>
      <span className="text-[10px] text-dim">Resized to {size}px (WebP)</span>
      {err && <span className="text-[11px] text-red-400">{err}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ player editor
const TEMPLATES: { label: string; level: number }[] = [{ label: 'Amateur', level: 42 }, { label: 'Prospect', level: 55 }, { label: 'Pro', level: 68 }, { label: 'Star', level: 80 }, { label: 'World class', level: 90 }, { label: 'Elite', level: 110 }, { label: 'Legend', level: 140 }];
const ROLE_FOCUS: Record<Role, (keyof PlayerAttributes)[]> = {
  top: ['mechanics', 'laning', 'teamfight'], jungle: ['pathing', 'objectives', 'macro'], mid: ['mechanics', 'laning', 'teamfight'],
  adc: ['mechanics', 'teamfight', 'farming'], support: ['vision', 'teamfight', 'macro'],
};

function PlayerEditor({ state, target }: { state: GameState; target?: Player }) {
  const [d, setD] = useState<PlayerDraft>(() => (target ? draftFromPlayer(state, target) : blankPlayerDraft(state)));
  const [cq, setCq] = useState('');
  const [tq, setTq] = useState(''); // trait search
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (patch: Partial<PlayerDraft>) => setD((x) => ({ ...x, ...patch }));
  const setAttr = (k: keyof PlayerAttributes, v: number) => setD((x) => ({ ...x, attributes: { ...x.attributes, [k]: v } }));
  const setHidden = (k: keyof HiddenAttributes, v: number) => setD((x) => ({ ...x, hidden: { ...x.hidden, [k]: v } }));

  const ovr = overall(d.attributes, d.role);
  const autoRep = autoReputation(state, d.attributes, d.role, d.teamId, d.traits);
  const rep = d.reputation ?? autoRep;
  const value = marketValue({ attributes: d.attributes, role: d.role, hidden: d.hidden, birthdate: d.birthdate || undefined, reputation: rep }, state.date, marketDrift(state));
  const sugSalary = suggestedSalary(state, d.attributes, d.role, d.teamId, d.traits);
  const team = d.teamId ? state.teams[d.teamId] : null;
  const age = d.birthdate ? playerAge({ birthdate: d.birthdate } as Player, state.date) : null;
  const champs = gd().champions;
  const champMatches = cq.trim() ? champs.filter((c) => c.name.toLowerCase().includes(cq.trim().toLowerCase()) && d.champions[c.id] === undefined).slice(0, 10) : [];
  const pool = Object.entries(d.champions).sort((a, b) => b[1] - a[1]);
  const valid = d.handle.trim().length > 0;

  const applyTemplate = (level: number) => {
    const a = { ...d.attributes };
    for (const k of ATTRIBUTE_KEYS) if (k !== 'aggression') a[k] = Math.max(1, Math.min(RATING_MAX, level + (ROLE_FOCUS[d.role].includes(k) ? 4 : k === 'shotcalling' ? -6 : 0)));
    setD({ ...d, attributes: a, hidden: { ...d.hidden, potential: Math.max(d.hidden.potential, Math.min(RATING_MAX, level + 6)) } });
  };
  const jitter = () => {
    const a = { ...d.attributes };
    for (const k of ATTRIBUTE_KEYS) a[k] = Math.max(1, Math.min(k === 'aggression' ? 99 : RATING_MAX, a[k] + Math.round((Math.random() - 0.5) * 12)));
    set({ attributes: a });
  };
  const suggestPool = () => {
    const list = gd().championsByRole[d.role].slice().sort((a, b) => (b.meta?.presence ?? 0) - (a.meta?.presence ?? 0)).slice(0, 10);
    const pool2: Record<string, number> = { ...d.champions };
    list.forEach((c, i) => { pool2[c.id] = Math.max(pool2[c.id] ?? 0, Math.min(MASTERY_MAX, Math.round(70 + (ovr - 45) * 2 - i * 6))); });
    set({ champions: pool2 });
  };
  const save = () => {
    if (!valid) return;
    if (target) {
      applyPlayerDraft(state, target, d);
      bump();
      notify(`${target.handle} updated`);
    } else {
      const p = createCustomPlayer(state, d);
      bump();
      notify(`Created ${p.handle}${p.teamId ? ` at ${state.teams[p.teamId]?.name}` : ' (free agent)'}`);
      nav('editor', 'player', p.id);
    }
  };
  const saveLib = async () => {
    if (!target) return;
    applyPlayerDraft(state, target, d);
    bump();
    await upsertLibrary({ player: toLibraryPlayer(target) });
    notify(`${target.handle} saved to the library`);
  };

  const traitGroups: { title: string; kind: 'positive' | 'neutral' | 'negative'; color: string }[] = [
    { title: 'Positive', kind: 'positive', color: '#22c55e' }, { title: 'Neutral', kind: 'neutral', color: '#8a97b3' }, { title: 'Negative', kind: 'negative', color: '#ef4444' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr_1fr] gap-4">
        {/* identity */}
        <div className="flex flex-col gap-4">
          <Panel title="Identity">
            <div className="flex gap-3 items-start mb-3">
              <Portrait player={{ handle: d.handle || '?', image: d.image, imageUrl: undefined, teamId: d.teamId, role: d.role }} team={team} size={96} />
              <div className="flex flex-col gap-2">
                <ImageUpload label="Upload portrait" size={160} mode="cover" has={!!d.image} onImage={(img) => set({ image: img })} onClear={() => set({ image: undefined })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Handle *"><input className="input" value={d.handle} maxLength={20} onChange={(e) => set({ handle: e.target.value })} placeholder="e.g. Faker" /></Field>
              <Field label="Real name"><input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Full name" /></Field>
              <Field label="Native name"><input className="input" value={d.nativeName} onChange={(e) => set({ nativeName: e.target.value })} placeholder="optional" /></Field>
              <Field label="Country">
                <select className="input" value={d.country} onChange={(e) => set({ country: e.target.value })}>
                  {!COUNTRIES.includes(d.country) && d.country && <option value={d.country}>{d.country}</option>}
                  {COUNTRIES.map((c) => <option key={c} value={c}>{flag(c)} {c}</option>)}
                </select>
              </Field>
              <Field label="Birthdate" hint={age !== null ? `${age} years old` : undefined}><input type="date" className="input" value={d.birthdate} onChange={(e) => set({ birthdate: e.target.value })} /></Field>
              <Field label="Main role">
                <select className="input" value={d.role} onChange={(e) => set({ role: e.target.value as Role, secondaryRoles: d.secondaryRoles.filter((r) => r !== e.target.value) })}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wider text-dim font-bold mb-1">Secondary roles</div>
              <div className="flex gap-1 flex-wrap">
                {ROLES.filter((r) => r !== d.role).map((r) => {
                  const on = d.secondaryRoles.includes(r);
                  return <button key={r} className={`chip cursor-pointer ${on ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => set({ secondaryRoles: on ? d.secondaryRoles.filter((x) => x !== r) : [...d.secondaryRoles, r] })}><RoleIcon role={r} size={11} />{ROLE_LABEL[r]}</button>;
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs mt-3 cursor-pointer"><input type="checkbox" className="accent-[#c8aa6e]" checked={d.streamer} onChange={(e) => set({ streamer: e.target.checked })} />Streamer (extra content revenue)</label>
          </Panel>

          <Panel title="Team & contract">
            <div className="flex flex-col gap-2">
              <Field label="Team"><TeamSelect state={state} value={d.teamId} onChange={(v) => set({ teamId: v, salary: v ? suggestedSalary(state, d.attributes, d.role, v, d.traits) : 0, contractDirty: true })} /></Field>
              {team && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Salary / year" hint={<button className="text-gold hover:underline" onClick={() => set({ salary: sugSalary, contractDirty: true })}>Suggested {money(sugSalary)}</button>}>
                    <input type="number" className="input" step={1000} value={d.salary} onChange={(e) => set({ salary: Number(e.target.value) || 0, contractDirty: true })} />
                  </Field>
                  <Field label="Contract years">
                    <select className="input" value={d.years} onChange={(e) => set({ years: Number(e.target.value), contractDirty: true })}>{[1, 2, 3].map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}</select>
                  </Field>
                </div>
              )}
              {target && target.teamId !== d.teamId && <div className="text-[11px] text-amber-400">Saving moves {target.handle} {d.teamId ? `to ${team?.name}` : 'to free agency'} (no transfer fee).</div>}
              {target && target.teamId === d.teamId && team && !d.contractDirty && <div className="text-[11px] text-dim">Current contract is kept unless you change salary or length.</div>}
            </div>
          </Panel>

          <Panel title="Summary">
            <div className="grid grid-cols-2 gap-2">
              <Stat label={`Overall (${ROLE_LABEL[d.role]})`} value={<span style={{ color: ratingColor(ovr) }}>{ovr}</span>} sub={`Potential ${Math.round(d.hidden.potential)} · ${ratingBand(ovr).label}`} />
              <Stat label="Market value" value={money(value)} sub={age !== null ? `${age} y/o` : 'age unknown'} />
            </div>
            <div className="mt-3">
              <Slider label={<>Reputation {d.reputation === null && <span className="text-dim">(auto)</span>}</>} value={rep} onChange={(v) => set({ reputation: v })} />
              {d.reputation !== null && <button className="text-[11px] text-gold hover:underline mt-1" onClick={() => set({ reputation: null })}>Reset to automatic ({autoRep})</button>}
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1 text-center">
              {ROLES.map((r) => <div key={r} className={`panel-flat py-1 ${r === d.role ? 'border-gold' : ''}`}><RoleIcon role={r} size={12} /><div className="font-display font-bold text-sm" style={{ color: ratingColor(overall(d.attributes, r)) }}>{overall(d.attributes, r)}</div></div>)}
            </div>
            <div className="text-[10px] text-dim mt-1">Overall per role (off-role penalties apply in matches)</div>
          </Panel>
        </div>

        {/* attributes */}
        <div className="flex flex-col gap-4">
          <Panel title="Visible attributes" right={<div className="flex gap-1">{TEMPLATES.map((t) => <button key={t.label} className="btn btn-ghost px-1.5 py-0.5 text-[11px]" title={`Set all attributes around ${t.level}`} onClick={() => applyTemplate(t.level)}>{t.label}</button>)}<button className="btn btn-ghost px-1.5 py-0.5 text-[11px]" onClick={jitter} title="Randomize ±6">±</button></div>}>
            <div className="flex flex-col gap-1.5">
              {ATTRIBUTE_KEYS.map((k) => <Slider key={k} label={ATTRIBUTE_LABEL[k]} value={d.attributes[k]} onChange={(v) => setAttr(k, v)} max={k === 'aggression' ? 99 : RATING_MAX} neutral={k === 'aggression'} hint={k === 'aggression' ? 'Play style: 0 = passive, 100 = very aggressive (not a quality stat)' : 'Rating 1–200: the best players of 2026 sit around 90, 100+ is beyond anyone today'} />)}
            </div>
          </Panel>
          <Panel title="Hidden attributes" right={<span className="text-[11px] text-dim">Revealed to other clubs only via scouting</span>}>
            <div className="flex flex-col gap-1.5">
              {HIDDEN_KEYS.map((k) => <Slider key={k} label={HIDDEN_LABEL[k]} value={d.hidden[k]} onChange={(v) => setHidden(k, v)} max={k === 'potential' ? RATING_MAX : 99} negative={!!HIDDEN_NEGATIVE[k]} hint={HIDDEN_NEGATIVE[k] ? 'Higher is worse' : k === 'potential' ? 'Ceiling of the overall rating (1–200)' : undefined} />)}
            </div>
            {d.hidden.potential < ovr && <div className="text-[11px] text-amber-400 mt-2">Potential is below the current overall ({ovr}) — the player has no room to grow.</div>}
          </Panel>
          <PersonaEditor value={d.persona} player={target} onChange={(persona) => set({ persona })} />
        </div>

        {/* traits + champions */}
        <div className="flex flex-col gap-4">
          <Panel title={`Traits · ${d.traits.length}`} right={d.traits.length > 0 && <button className="btn btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => set({ traits: [] })}>Clear</button>}>
            <input className="input w-full mb-2" placeholder={`Search ${Object.keys(TRAITS).length} traits (name, area, effect)…`} value={tq} onChange={(e) => setTq(e.target.value)} />
            <div className="max-h-[420px] overflow-auto pr-1">
            {traitGroups.map((g) => (
              <div key={g.kind} className="mb-2">
                <div className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: g.color }}>{g.title}</div>
                <div className="flex flex-wrap gap-1">
                  {Object.values(TRAITS).filter((t) => t.kind === g.kind && (!tq.trim() || `${t.name} ${t.group ?? ''} ${t.desc}`.toLowerCase().includes(tq.trim().toLowerCase()))).map((t) => {
                    const on = d.traits.includes(t.id);
                    return (
                      <button key={t.id} title={`${t.desc}${t.hidden ? ' (hidden trait — only revealed by scouting)' : ''}`} onClick={() => set({ traits: on ? d.traits.filter((x) => x !== t.id) : [...d.traits, t.id] })}
                        className="chip cursor-pointer transition" style={on ? { color: g.color, borderColor: g.color, background: g.color + '22' } : { color: '#8a97b3' }}>
                        {t.name}{t.hidden ? ' ◆' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            </div>
            {d.traits.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 border-t hairline pt-2">
                {d.traits.map((id) => <div key={id} className="text-[11px] leading-snug"><span className="font-semibold text-text">{TRAITS[id]?.name ?? id}</span> <span className="text-dim">— {TRAITS[id]?.desc}</span></div>)}
              </div>
            )}
            <div className="text-[10px] text-dim mt-2">◆ hidden trait</div>
          </Panel>
          <Panel title={`Champion pool · ${pool.length}`} right={<div className="flex gap-1"><button className="btn btn-ghost px-1.5 py-0.5 text-[11px]" onClick={suggestPool}>Suggest for {ROLE_LABEL[d.role]}</button>{pool.length > 0 && <button className="btn btn-ghost px-1.5 py-0.5 text-[11px]" onClick={() => set({ champions: {} })}>Clear</button>}</div>}>
            <div className="relative">
              <input className="input w-full" placeholder="Search a champion to add…" value={cq} onChange={(e) => setCq(e.target.value)} />
              {champMatches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full panel p-1 max-h-64 overflow-auto shadow-2xl">
                  {champMatches.map((c) => (
                    <button key={c.id} className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-[#121b30] text-left text-sm" onClick={() => { set({ champions: { ...d.champions, [c.id]: 110 } }); setCq(''); }}>
                      <ChampIcon id={c.id} size={22} /><span className="flex-1">{c.name}</span><span className="flex gap-0.5">{c.positions.map((r) => <RoleIcon key={r} role={r} size={11} />)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 mt-2 max-h-[420px] overflow-auto pr-1">
              {pool.length === 0 && <div className="text-xs text-dim py-3 text-center">No champions yet — search above or use “Suggest”.</div>}
              {pool.map(([cid, m]) => (
                <div key={cid} className="flex items-center gap-2 text-xs">
                  <ChampIcon id={cid} size={22} />
                  <span className="w-24 truncate">{gd().championById[cid]?.name ?? cid}</span>
                  <input type="range" min={1} max={MASTERY_MAX} value={m} className="flex-1 h-1.5" style={{ accentColor: masteryTier(m).color }} onChange={(e) => set({ champions: { ...d.champions, [cid]: Number(e.target.value) } })} />
                  <span className="w-20 text-right" title="Comfort 0–200: ~100 solid soloQ, 130 pro-ready, 165+ signature"><span className="font-display font-bold" style={{ color: masteryTier(m).color }}>{m}</span> <span className="text-[9px] text-dim uppercase">{masteryTier(m).label}</span></span>
                  <button className="text-dim hover:text-red-400 px-1" title="Remove" onClick={() => { const c = { ...d.champions }; delete c[cid]; set({ champions: c }); }}>✕</button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="panel p-3 flex items-center gap-2 flex-wrap sticky bottom-0 z-10">
        {!valid && <span className="text-xs text-amber-400">A handle is required.</span>}
        {target && <button className="btn btn-ghost" onClick={() => nav('player', target.id)}>View profile →</button>}
        <div className="flex-1" />
        {target?.isCustom && <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Delete player</button>}
        <button className="btn" disabled={!target || !valid} title={!target ? 'Create the player first' : 'Save this player to the shared library (usable in other careers)'} onClick={saveLib}>Save to library</button>
        <button className="btn btn-ghost" onClick={() => nav('editor')}>Cancel</button>
        <button className="btn btn-gold" disabled={!valid} onClick={save}>{target ? 'Save changes' : 'Create player'}</button>
      </div>

      {confirmDel && target && (
        <Modal open onClose={() => setConfirmDel(false)} title={`Delete ${target.handle}?`} width={440}>
          <div className="text-sm text-muted">The player is removed from their team and from this career. Players who already have match records are retired instead. Library copies are not affected.</div>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn btn-ghost" onClick={() => setConfirmDel(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { const r = deleteCustomPlayer(state, target.id); bump(); notify(r.message); nav('editor'); }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ team editor
function TeamEditor({ state, target }: { state: GameState; target?: Team }) {
  const [d, setD] = useState<TeamDraft>(() => {
    if (target) return draftFromTeam(state, target);
    if (pendingTeamDraft) return pendingTeamDraft;
    return blankTeamDraft(state);
  });
  useEffect(() => { pendingTeamDraft = null; }, []);
  const [manage, setManage] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'create' | null>(null);
  const [lib, setLib] = useState<Library | null>(null);
  const set = (patch: Partial<TeamDraft>) => setD((x) => ({ ...x, ...patch }));
  useEffect(() => { loadLibrary().then(setLib); }, []);

  const league = state.leagues[d.leagueId];
  const tier = league?.tier ?? 3;
  const leagueTeams = Object.values(state.teams).filter((t) => t.leagueId === d.leagueId && t.id !== target?.id).sort((a, b) => a.name.localeCompare(b.name));
  const replaced = d.mode === 'replace' && d.replaceId ? state.teams[d.replaceId] : undefined;
  const rosterPlayers = d.roster.map((r) => ({ r, p: state.players[r.playerId] })).filter((x) => x.p);
  const payroll = d.roster.reduce((s, r) => s + r.salary, 0);
  const valid = d.name.trim().length > 1 && !!league && (d.mode === 'add' || !!d.replaceId || !!target);
  const fakeTeam = { ...(target ?? ({} as Team)), id: target?.id ?? 'preview', name: d.name || 'New Team', short: (d.short || d.name.slice(0, 3) || '?').toUpperCase().slice(0, 5), colors: d.colors, logo: d.logo } as Team;

  // projected lineup: best player per role among the draft roster
  const lineup = useMemo(() => {
    const used = new Set<string>();
    const out = {} as Record<Role, Player | null>;
    for (const r of ROLES) {
      const best = rosterPlayers.filter((x) => x.p.role === r && !used.has(x.p.id)).sort((a, b) => playerOvr(b.p) - playerOvr(a.p))[0]?.p ?? null;
      out[r] = best;
      if (best) used.add(best.id);
    }
    return out;
  }, [rosterPlayers]);
  const projRating = Math.round(ROLES.reduce((s, r) => s + (lineup[r] ? overall(lineup[r]!.attributes, r) : 30), 0) / 5);

  const addPlayer = (p: Player) => {
    if (d.roster.some((r) => r.playerId === p.id)) return;
    set({ roster: [...d.roster, { playerId: p.id, salary: salaryFor(playerOvr(p), tier, d.leagueId, p.traits, marketDrift(state)), years: 2, dirty: true }] });
  };
  const updRoster = (id: string, patch: Partial<TeamDraft['roster'][number]>) => set({ roster: d.roster.map((r) => (r.playerId === id ? { ...r, ...patch, dirty: true } : r)) });

  const doCreate = () => {
    const { team, replaced: rep } = createCustomTeam(state, d);
    bump();
    notify(`${team.name} created${rep ? ` — replaced ${rep}` : ''}`);
    setConfirm(null);
    if (manage) switchToTeam(state, team.id);
    else nav('editor', 'team', team.id);
  };
  const save = () => {
    if (!valid) return;
    if (target) {
      applyTeamDraft(state, target, d);
      bump();
      notify(`${target.name} updated`);
      setD(draftFromTeam(state, target));
      if (manage && target.id !== state.userTeamId) switchToTeam(state, target.id);
    } else setConfirm('create');
  };
  const saveLib = async () => {
    if (!target) return;
    applyTeamDraft(state, target, d);
    bump();
    setLib(await upsertLibrary({ team: toLibraryTeam(state, target) }));
    notify(`${target.name} saved to the library (with ${target.roster.filter((id) => state.players[id]?.isCustom).length} custom players)`);
  };
  const inComps = target ? teamInCompetitions(state, target.id) : false;
  const activeComps = Object.values(state.competitions).filter((c) => c.status === 'active' && c.leagueId === d.leagueId);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
        <div className="flex flex-col gap-4">
          <Panel title="Identity">
            <div className="flex gap-4 items-center mb-3">
              <TeamLogo team={fakeTeam} size={88} />
              <div className="min-w-0">
                <div className="font-display text-2xl font-bold truncate">{d.name || 'New Team'}</div>
                <div className="text-xs text-muted">{fakeTeam.short} · {league?.name ?? '—'}</div>
                <div className="mt-2"><ImageUpload label="Upload logo" size={128} mode="contain" has={!!d.logo} onImage={(img) => set({ logo: img })} onClear={() => set({ logo: undefined })} /></div>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Field label="Team name *"><input className="input" value={d.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Rift Wolves" /></Field>
              <Field label="Short (≤5)"><input className="input uppercase" value={d.short} maxLength={5} onChange={(e) => set({ short: e.target.value.toUpperCase().slice(0, 5) })} placeholder="RWF" /></Field>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Field label="Primary"><input type="color" className="w-full h-9 rounded-lg bg-transparent border border-line2 cursor-pointer" value={d.colors[0]} onChange={(e) => set({ colors: [e.target.value, d.colors[1]] })} /></Field>
              <Field label="Secondary"><input type="color" className="w-full h-9 rounded-lg bg-transparent border border-line2 cursor-pointer" value={d.colors[1]} onChange={(e) => set({ colors: [d.colors[0], e.target.value] })} /></Field>
              <Field label="Country"><input className="input" value={d.country} onChange={(e) => set({ country: e.target.value })} /></Field>
            </div>
          </Panel>

          <Panel title="League">
            <Field label="League">
              <select className="input w-full" value={d.leagueId} onChange={(e) => set({ leagueId: e.target.value, replaceId: '', country: target ? d.country : state.leagues[e.target.value]?.country ?? d.country })}>
                {[1, 2, 3].map((t) => (
                  <optgroup key={t} label={`Tier ${t}`}>
                    {Object.values(state.leagues).filter((l) => l.tier === t).sort((a, b) => a.name.localeCompare(b.name)).map((l) => <option key={l.id} value={l.id}>{l.name} — {REGION_LABEL[l.region]} ({Object.values(state.teams).filter((x) => x.leagueId === l.id).length} teams)</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            {!target ? (
              <div className="mt-3 flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer"><input type="radio" className="mt-1 accent-[#c8aa6e]" checked={d.mode === 'add'} onChange={() => set({ mode: 'add' })} /><span>Add as an additional team<div className="text-[11px] text-dim">Joins {league?.name}'s upcoming competitions automatically (when they start).</div></span></label>
                <label className="flex items-start gap-2 text-sm cursor-pointer"><input type="radio" className="mt-1 accent-[#c8aa6e]" checked={d.mode === 'replace'} onChange={() => set({ mode: 'replace' })} /><span>Replace an existing team<div className="text-[11px] text-dim">Takes over its league slot, fixtures and standings. Its players become free agents.</div></span></label>
                {d.mode === 'replace' && (
                  <div className="flex flex-col gap-2 pl-6">
                    <select className="input" value={d.replaceId} onChange={(e) => set({ replaceId: e.target.value })}>
                      <option value="">Choose a team to replace…</option>
                      {leagueTeams.map((t) => <option key={t.id} value={t.id}>{t.name} (rating {teamRating(state, t)}){t.id === state.userTeamId ? ' — your team' : ''}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" className="accent-[#c8aa6e]" checked={d.inheritStaff} onChange={(e) => set({ inheritStaff: e.target.checked })} />Inherit the replaced team's staff</label>
                    {replaced && <div className="text-[11px] text-amber-400 leading-snug">{replaced.name} will be removed. {replaced.roster.length} players become free agents{replaced.id === state.userTeamId ? '; you will manage the new team instead' : ''}.</div>}
                  </div>
                )}
                {d.mode === 'add' && activeComps.length > 0 && <div className="text-[11px] text-dim leading-snug">{activeComps.map((c) => c.name).join(', ')} {activeComps.length > 1 ? 'are' : 'is'} already running — the new team will join from the next split.</div>}
              </div>
            ) : (
              d.leagueId !== target.leagueId && <div className="text-[11px] text-amber-400 mt-2">Changing league takes effect for competitions that haven't started yet; current fixtures are still played.</div>
            )}
          </Panel>

          <Panel title="Club & finances">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Balance ($)"><input type="number" className="input" step={50000} value={d.balance} onChange={(e) => set({ balance: Number(e.target.value) || 0 })} /></Field>
              <Field label="Fans"><input type="number" className="input" step={1000} value={d.fans} onChange={(e) => set({ fans: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            </div>
            <div className="flex flex-col gap-1.5 mt-3">
              <Slider label="Prestige" value={d.prestige} onChange={(v) => set({ prestige: v })} />
              <Slider label="Hype" value={d.hype} min={0} max={100} onChange={(v) => set({ hype: v })} />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-dim font-bold mt-3 mb-1">Facilities (level 0–5)</div>
            <div className="flex flex-col gap-1.5">
              {FACILITY_KEYS.map((k: FacilityKey) => (
                <div key={k} className="flex items-center gap-2 text-xs" title={FACILITY_INFO[k].desc}>
                  <span className="w-36 text-muted truncate">{FACILITY_INFO[k].name}</span>
                  <div className="flex gap-1 flex-1">
                    {[0, 1, 2, 3, 4, 5].map((lv) => <button key={lv} className={`flex-1 h-6 rounded text-[11px] font-display font-bold border ${d.facilities[k] === lv ? 'bg-gold text-black border-gold' : lv <= d.facilities[k] ? 'bg-[#2a3a5c] border-line2 text-text' : 'bg-[#0a1120] border-line text-dim'}`} onClick={() => set({ facilities: { ...d.facilities, [k]: lv } })}>{lv}</button>)}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title={`Roster · ${d.roster.length} players`} right={<span className="text-xs text-muted">Payroll {money(payroll)}/yr · projected rating <span className="font-display font-bold" style={{ color: ratingColor(projRating) }}>{projRating}</span></span>}>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {ROLES.map((r) => {
                const p = lineup[r];
                return (
                  <div key={r} className="panel-flat p-2 flex flex-col items-center gap-1 text-center">
                    <div className="flex items-center gap-1 text-[10px] uppercase text-dim font-bold"><RoleIcon role={r} size={11} />{ROLE_LABEL[r]}</div>
                    {p ? <><Portrait player={p} team={fakeTeam} size={44} /><div className="text-xs font-semibold truncate w-full">{p.handle}</div><Rating v={overall(p.attributes, r)} size="sm" /></>
                      : <><div className="w-11 h-11 rounded-lg bg-[#0a1120] border border-dashed border-line2" /><div className="text-[11px] text-red-400">Empty</div></>}
                  </div>
                );
              })}
            </div>
            {rosterPlayers.length === 0 ? <Empty>No players yet — add some from the player pool below.</Empty> : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Player</th><th>Pos</th><th className="text-center">Ovr</th><th>Currently</th><th className="text-right">Salary / yr</th><th>Years</th><th></th></tr></thead>
                  <tbody>
                    {rosterPlayers.map(({ r, p }) => {
                      const cur = p.teamId ? state.teams[p.teamId] : null;
                      const moving = p.teamId !== (target?.id ?? '__new__');
                      return (
                        <tr key={p.id}>
                          <td><div className="flex items-center gap-2"><Portrait player={p} team={cur} size={26} /><div className="leading-tight"><div className="font-semibold">{p.handle}{p.isCustom && <span className="text-[9px] text-accent font-bold ml-1">CUSTOM</span>}</div><div className="text-[10px] text-dim">{flag(p.country)} {playerAge(p, state.date) ?? '?'} y/o</div></div></div></td>
                          <td><RoleIcon role={p.role} size={14} /></td>
                          <td className="text-center"><div className="flex justify-center"><Rating v={playerOvr(p)} size="sm" /></div></td>
                          <td className="text-xs">{cur ? <span className={`flex items-center gap-1 ${moving ? 'text-amber-400' : 'text-muted'}`}><TeamLogo team={cur} size={16} />{cur.short}{moving && ' → moves'}</span> : <span className="text-accent">Free agent</span>}</td>
                          <td className="text-right"><input type="number" className="input w-28 py-0.5 text-right font-display" step={1000} value={r.salary} onChange={(e) => updRoster(p.id, { salary: Number(e.target.value) || 0 })} /></td>
                          <td><select className="input py-0.5" value={r.years} onChange={(e) => updRoster(p.id, { years: Number(e.target.value) })}>{[1, 2, 3].map((y) => <option key={y} value={y}>{y}</option>)}</select></td>
                          <td className="text-right"><button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => set({ roster: d.roster.filter((x) => x.playerId !== p.id) })}>Remove</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {target && target.roster.some((id) => !d.roster.some((r) => r.playerId === id)) && <div className="text-[11px] text-amber-400 mt-2">Removed players become free agents when you save.</div>}
          </Panel>
          <PlayerPicker state={state} exclude={new Set(d.roster.map((r) => r.playerId))} onAdd={addPlayer} targetTeamId={target?.id} />
        </div>
      </div>

      <div className="panel p-3 flex items-center gap-3 flex-wrap sticky bottom-0 z-10">
        {!valid && <span className="text-xs text-amber-400">{d.name.trim().length < 2 ? 'Enter a team name.' : d.mode === 'replace' && !d.replaceId ? 'Choose the team to replace.' : 'Choose a league.'}</span>}
        {(!target || target.id !== state.userTeamId) && <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="accent-[#c8aa6e]" checked={manage} onChange={(e) => setManage(e.target.checked)} />Manage this team after saving</label>}
        {target && <button className="btn btn-ghost" onClick={() => nav('team', target.id)}>View team →</button>}
        {!target && lib && lib.teams.length > 0 && (
          <select className="input" value="" onChange={(e) => { const lt = lib.teams.find((x) => x.id === e.target.value); if (lt) { setD(draftFromLibraryTeam(state, lt)); bump(); notify(`Loaded ${lt.name} from the library`); } }}>
            <option value="">Load from library…</option>
            {lib.teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.short})</option>)}
          </select>
        )}
        <div className="flex-1" />
        {target?.isCustom && <button className="btn btn-danger" disabled={target.id === state.userTeamId} title={inComps ? 'Already in competitions — cannot be deleted' : undefined} onClick={() => setConfirm('delete')}>Delete team</button>}
        <button className="btn" disabled={!target} title={!target ? 'Create the team first' : 'Save team + custom players to the shared library'} onClick={saveLib}>Save to library</button>
        <button className="btn btn-ghost" onClick={() => nav('editor')}>Cancel</button>
        <button className="btn btn-gold" disabled={!valid} onClick={save}>{target ? 'Save changes' : 'Create team'}</button>
      </div>

      {confirm === 'create' && (
        <Modal open onClose={() => setConfirm(null)} title={`Create ${d.name}?`} width={520}>
          <div className="flex items-center gap-3">
            <TeamLogo team={fakeTeam} size={56} />
            <div className="text-sm text-muted leading-relaxed">
              {d.name} joins the <span className="text-text">{league?.fullName}</span> with {d.roster.length} players, {money(d.balance)} balance and {num(d.fans)} fans.
            </div>
          </div>
          <ul className="text-sm text-muted list-disc pl-5 mt-3 flex flex-col gap-1">
            {replaced ? <li><span className="text-amber-400">{replaced.name}</span> is removed; its {replaced.roster.length} players become free agents{d.inheritStaff ? ' and its staff join the new team' : ''}. The new team takes over its fixtures and standings.</li>
              : <li>Added as an extra team — included automatically when the next {league?.name} competition starts.</li>}
            {rosterPlayers.filter((x) => x.p.teamId).length > 0 && <li>{rosterPlayers.filter((x) => x.p.teamId).length} players are moved from their current teams (no transfer fee).</li>}
            {rosterPlayers.length < 5 && <li className="text-amber-400">Fewer than 5 players: amateur stand-ins will fill empty roles in matches.</li>}
            {manage && <li className="text-gold2">You will take over as manager of {d.name}.</li>}
          </ul>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn btn-gold" onClick={doCreate}>Create team</button>
          </div>
        </Modal>
      )}
      {confirm === 'delete' && target && (
        <Modal open onClose={() => setConfirm(null)} title={`Delete ${target.name}?`} width={460}>
          <div className="text-sm text-muted">{inComps ? `${target.name} is already part of this season's competitions and can't be deleted (fixtures reference it). You can remove its players instead.` : `All ${target.roster.length} players become free agents and staff are released. This can't be undone.`}</div>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={inComps} onClick={() => { const r = deleteCustomTeam(state, target.id); bump(); notify(r.message); setConfirm(null); if (r.ok) nav('editor'); }}>Delete team</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PlayerPicker({ state, exclude, onAdd, targetTeamId }: { state: GameState; exclude: Set<string>; onAdd: (p: Player) => void; targetTeamId?: string }) {
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<'free' | 'custom' | 'all'>('free');
  const [role, setRole] = useState<Role | ''>('');
  const [limit, setLimit] = useState(30);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.values(state.players).filter((p) => {
      if (p.retired || p.id.startsWith('standin_') || exclude.has(p.id)) return false;
      if (src === 'free' && p.teamId) return false;
      if (src === 'custom' && !p.isCustom) return false;
      if (role && p.role !== role) return false;
      if (s && !(p.handle.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || (p.teamId && state.teams[p.teamId]?.name.toLowerCase().includes(s)))) return false;
      return true;
    }).sort((a, b) => playerOvr(b) - playerOvr(a));
  }, [state, q, src, role, exclude]);
  return (
    <Panel title="Player pool" right={<span className="text-xs text-muted">{list.length.toLocaleString()} players</span>}>
      <div className="flex flex-wrap gap-2 items-center mb-2">
        <input className="input w-56" placeholder="Search handle, name or team…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(30); }} />
        <div className="flex gap-1">
          {([['free', 'Free agents'], ['custom', 'Custom'], ['all', 'All players']] as const).map(([k, l]) => <button key={k} className={`chip cursor-pointer ${src === k ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => { setSrc(k); setLimit(30); }}>{l}</button>)}
        </div>
        <div className="flex gap-1">
          <button className={`chip cursor-pointer ${!role ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => setRole('')}>All</button>
          {ROLES.map((r) => <button key={r} className={`chip cursor-pointer ${role === r ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => setRole(role === r ? '' : r)}><RoleIcon role={r} size={11} /></button>)}
        </div>
      </div>
      {list.length === 0 ? <Empty>No players found.</Empty> : (
        <div className="max-h-[420px] overflow-auto">
          <table className="tbl">
            <thead><tr><th>Player</th><th>Pos</th><th className="text-right">Age</th><th className="text-center">Ovr</th><th>Team</th><th className="text-right">Value</th><th></th></tr></thead>
            <tbody>
              {list.slice(0, limit).map((p) => {
                const t = p.teamId ? state.teams[p.teamId] : null;
                return (
                  <tr key={p.id}>
                    <td><div className="flex items-center gap-2"><Portrait player={p} team={t} size={24} /><span className="font-semibold">{p.handle}</span>{p.isCustom && <span className="text-[9px] text-accent font-bold">CUSTOM</span>}{p.generated && <span className="text-[9px] text-sky-400 font-bold" title="Fictional player generated for this transfer window">{p.teamId ? 'GENERATED' : 'UNSIGNED · GEN'}</span>}</div></td>
                    <td><RoleIcon role={p.role} size={14} /></td>
                    <td className="text-right font-display">{playerAge(p, state.date) ?? '—'}</td>
                    <td className="text-center"><div className="flex justify-center"><Rating v={playerOvr(p)} size="sm" /></div></td>
                    <td className="text-xs">{t ? <span className="flex items-center gap-1"><TeamLogo team={t} size={16} />{t.short}{t.id === targetTeamId && ' (this team)'}</span> : <span className="text-accent">Free agent</span>}</td>
                    <td className="text-right font-display text-muted">{money(p.value)}</td>
                    <td className="text-right"><button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => onAdd(p)}>+ Add</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length > limit && <div className="text-center py-2"><button className="btn btn-ghost text-xs" onClick={() => setLimit(limit + 50)}>Show more ({list.length - limit} more)</button></div>}
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ staff editor
const STAFF_ROLES = Object.keys(STAFF_ROLE_INFO) as StaffRole[];
const STAFF_SHORT: Record<StaffRole, string> = { headCoach: 'Head', coach: 'Coach', analyst: 'Analyst', psychologist: 'Psych', scout: 'Scout' };
const STAFF_TEMPLATES: { label: string; level: number }[] = [{ label: 'Amateur', level: 40 }, { label: 'Prospect', level: 52 }, { label: 'Pro', level: 64 }, { label: 'Elite', level: 76 }, { label: 'World class', level: 88 }];
const NO_COLORS: [string, string] = ['#334155', '#0f172a'];

function StaffEditor({ state, target }: { state: GameState; target?: Staff }) {
  const [d, setD] = useState<StaffDraft>(() => (target ? draftFromStaff(state, target) : blankStaffDraft()));
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (patch: Partial<StaffDraft>) => setD((x) => ({ ...x, ...patch }));
  const setAttr = (k: keyof Staff['attributes'], v: number) => setD((x) => ({ ...x, attributes: { ...x.attributes, [k]: v } }));

  const info = STAFF_ROLE_INFO[d.role];
  const rating = staffRating({ role: d.role, attributes: d.attributes } as Staff);
  const autoRep = autoStaffReputation(d);
  const rep = d.reputation ?? autoRep;
  const team = d.teamId ? state.teams[d.teamId] : null;
  const curTeam = target?.teamId ? state.teams[target.teamId] : null;
  const sugSalary = suggestedStaffSalary(state, d);
  const { errors, headCoach } = staffDraftIssues(state, d, target);
  const valid = errors.length === 0;

  const applyTemplate = (level: number) => {
    const a = { ...d.attributes };
    for (const k of STAFF_ATTRS) a[k] = Math.max(1, Math.min(99, level + (info.keys[0] === k ? 6 : info.keys.includes(k) ? 3 : -6)));
    set({ attributes: a });
  };
  const jitter = () => {
    const a = { ...d.attributes };
    for (const k of STAFF_ATTRS) a[k] = Math.max(1, Math.min(99, a[k] + Math.round((Math.random() - 0.5) * 12)));
    set({ attributes: a });
  };
  const save = () => {
    if (!valid) return;
    if (target) {
      applyStaffDraft(state, target, d);
      bump();
      notify(`${target.handle} updated`);
      setD(draftFromStaff(state, target));
    } else {
      const s = createCustomStaff(state, d);
      bump();
      notify(`Created ${s.handle}${s.teamId ? ` at ${state.teams[s.teamId]?.name}` : ' (free agent)'}`);
      nav('editor', 'staff', s.id);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr_1fr] gap-4">
        <div className="flex flex-col gap-4">
          <Panel title="Identity">
            <div className="flex gap-3 items-center mb-3">
              <Avatar name={d.handle || '?'} size={72} colors={team?.colors ?? NO_COLORS} />
              <div className="min-w-0">
                <div className="font-display text-2xl font-bold truncate">{d.handle || 'New staff'}</div>
                <div className="text-xs text-muted truncate">{flag(d.country)} {d.name || '—'}</div>
                <div className="mt-1"><Pill color={info.color}>{info.label}</Pill></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Handle *"><input className="input" value={d.handle} maxLength={20} onChange={(e) => set({ handle: e.target.value })} placeholder="e.g. kkOma" /></Field>
              <Field label="Real name"><input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Full name" /></Field>
              <Field label="Country">
                <select className="input" value={d.country} onChange={(e) => set({ country: e.target.value })}>
                  {!COUNTRIES.includes(d.country) && d.country && <option value={d.country}>{d.country}</option>}
                  {COUNTRIES.map((c) => <option key={c} value={c}>{flag(c)} {c}</option>)}
                </select>
              </Field>
              <Field label="Role">
                <select className="input" value={d.role} onChange={(e) => set({ role: e.target.value as StaffRole, replaceHeadCoach: false, salary: d.teamId ? suggestedStaffSalary(state, { ...d, role: e.target.value as StaffRole }) : 0, contractDirty: !!d.teamId })}>
                  {STAFF_ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_INFO[r].label}</option>)}
                </select>
              </Field>
            </div>
            <div className="text-[11px] text-dim leading-snug mt-2">{info.effect}</div>
          </Panel>

          <Panel title="Team & contract">
            <div className="flex flex-col gap-2">
              <Field label="Team"><TeamSelect state={state} value={d.teamId} onChange={(v) => set({ teamId: v, salary: v ? suggestedStaffSalary(state, { ...d, teamId: v }) : 0, contractDirty: true, replaceHeadCoach: false })} /></Field>
              {team && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Salary / year" hint={<button className="text-gold hover:underline" onClick={() => set({ salary: sugSalary, contractDirty: true })}>Suggested {money(sugSalary)}</button>}>
                    <input type="number" className="input" step={1000} value={d.salary} onChange={(e) => set({ salary: Number(e.target.value) || 0, contractDirty: true })} />
                  </Field>
                  <Field label="Contract years">
                    <select className="input" value={d.years} onChange={(e) => set({ years: Number(e.target.value), contractDirty: true })}>{[1, 2, 3].map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}</select>
                  </Field>
                </div>
              )}
              {headCoach && (
                <label className="flex items-start gap-2 text-xs cursor-pointer text-amber-300">
                  <input type="checkbox" className="mt-0.5 accent-[#c8aa6e]" checked={!!d.replaceHeadCoach} onChange={(e) => set({ replaceHeadCoach: e.target.checked })} />
                  <span>Release {team?.name}&apos;s current head coach {headCoach.handle} (becomes a free agent)</span>
                </label>
              )}
              {target && target.teamId !== d.teamId && <div className="text-[11px] text-amber-400">Saving moves {target.handle} {team ? `to ${team.name}` : 'to free agency'} (no fees).</div>}
              {target && target.teamId === d.teamId && team && !d.contractDirty && <div className="text-[11px] text-dim">Current contract is kept unless you change salary or length.</div>}
              {team && <div className="text-[11px] text-dim">{team.staff.filter((id) => id !== target?.id && state.staff[id]).length + 1} / {MAX_STAFF} staff at {team.short} after saving.</div>}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Attributes" right={<div className="flex gap-1">{STAFF_TEMPLATES.map((t) => <button key={t.label} className="btn btn-ghost px-1.5 py-0.5 text-[11px]" title={`Set attributes around ${t.level} (key attributes for the role higher)`} onClick={() => applyTemplate(t.level)}>{t.label}</button>)}<button className="btn btn-ghost px-1.5 py-0.5 text-[11px]" onClick={jitter} title="Randomize ±6">±</button></div>}>
            <div className="flex flex-col gap-1.5">
              {STAFF_ATTRS.map((k) => <Slider key={k} label={<span className={info.keys.includes(k) ? 'text-gold2 font-semibold' : ''}>{STAFF_ATTR_LABEL[k]}</span>} value={d.attributes[k]} onChange={(v) => setAttr(k, v)} />)}
            </div>
            <div className="text-[10px] text-dim mt-2">Gold: key attributes of a {info.label.toLowerCase()} ({info.keys.map((k) => STAFF_ATTR_LABEL[k]).join(', ')})</div>
          </Panel>
          <Panel title="Summary">
            <div className="grid grid-cols-2 gap-2">
              <Stat label={`Rating (${info.label})`} value={<span style={{ color: ratingColor(rating) }}>{rating}</span>} sub="role-weighted" />
              <Stat label="Salary demand" value={team ? money(sugSalary) : '—'} sub={team ? `per year at ${team.short}` : 'choose a team'} />
            </div>
            <div className="mt-3">
              <Slider label={<>Reputation {d.reputation === null && <span className="text-dim">(auto)</span>}</>} value={rep} onChange={(v) => set({ reputation: v })} />
              {d.reputation !== null && <button className="text-[11px] text-gold hover:underline mt-1" onClick={() => set({ reputation: null })}>Reset to automatic ({autoRep})</button>}
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1 text-center">
              {STAFF_ROLES.map((r) => {
                const v = staffRating({ role: r, attributes: d.attributes } as Staff);
                return <button key={r} title={`Rating as ${STAFF_ROLE_INFO[r].label}`} className={`panel-flat py-1 ${r === d.role ? 'border-gold' : ''}`} onClick={() => set({ role: r, replaceHeadCoach: false })}><div className="text-[9px] uppercase text-dim font-bold">{STAFF_SHORT[r]}</div><div className="font-display font-bold text-sm" style={{ color: ratingColor(v) }}>{v}</div></button>;
              })}
            </div>
            <div className="text-[10px] text-dim mt-1">Rating per role (click to switch role)</div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <StaffPicker state={state} currentId={target?.id} />
        </div>
      </div>

      <div className="panel p-3 flex items-center gap-2 flex-wrap sticky bottom-0 z-10">
        {!valid && <span className="text-xs text-amber-400">{errors[0]}</span>}
        {curTeam && <button className="btn btn-ghost" onClick={() => (curTeam.id === state.userTeamId ? nav('staff') : nav('team', curTeam.id))}>{curTeam.id === state.userTeamId ? 'Staff page →' : `View ${curTeam.short} →`}</button>}
        <div className="flex-1" />
        {target?.isCustom && <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Delete staff</button>}
        <button className="btn btn-ghost" onClick={() => nav('editor')}>Cancel</button>
        <button className="btn btn-gold" disabled={!valid} onClick={save}>{target ? 'Save changes' : 'Create staff'}</button>
      </div>

      {confirmDel && target && (
        <Modal open onClose={() => setConfirmDel(false)} title={`Delete ${target.handle}?`} width={440}>
          <div className="text-sm text-muted">The staff member is removed from their team and from this career.</div>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn btn-ghost" onClick={() => setConfirmDel(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { const r = deleteCustomStaff(state, target.id); bump(); notify(r.message); nav('editor'); }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StaffPicker({ state, currentId }: { state: GameState; currentId?: string }) {
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<'all' | 'free' | 'custom'>('all');
  const [role, setRole] = useState<StaffRole | ''>('');
  const [limit, setLimit] = useState(30);
  const s = q.trim().toLowerCase();
  const list = allStaff(state).filter((x) => {
    if (src === 'free' && x.teamId) return false;
    if (src === 'custom' && !x.isCustom) return false;
    if (role && x.role !== role) return false;
    if (s && !(x.handle.toLowerCase().includes(s) || x.name.toLowerCase().includes(s) || (x.teamId && state.teams[x.teamId]?.name.toLowerCase().includes(s)))) return false;
    return true;
  }).sort((a, b) => staffRating(b) - staffRating(a));
  return (
    <Panel title="Find staff to edit" right={<span className="text-xs text-muted">{list.length.toLocaleString()} staff</span>}>
      <div className="flex flex-wrap gap-2 items-center mb-2">
        <input className="input w-48" placeholder="Search handle, name or team…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(30); }} />
        <div className="flex gap-1">
          {([['all', 'All'], ['free', 'Free agents'], ['custom', 'Custom']] as const).map(([k, l]) => <button key={k} className={`chip cursor-pointer ${src === k ? 'text-gold2 border-gold' : 'text-muted'}`} onClick={() => { setSrc(k); setLimit(30); }}>{l}</button>)}
        </div>
        <select className="input py-0.5 text-xs" value={role} onChange={(e) => setRole(e.target.value as StaffRole | '')}>
          <option value="">All roles</option>
          {STAFF_ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_INFO[r].label}</option>)}
        </select>
      </div>
      {list.length === 0 ? <Empty>No staff found.</Empty> : (
        <div className="max-h-[560px] overflow-auto">
          <table className="tbl">
            <thead><tr><th>Staff</th><th>Role</th><th className="text-center">Rtg</th><th>Team</th><th></th></tr></thead>
            <tbody>
              {list.slice(0, limit).map((x) => {
                const t = x.teamId ? state.teams[x.teamId] : null;
                return (
                  <tr key={x.id} className={x.id === currentId ? 'bg-[#121b30]' : ''}>
                    <td><div className="flex items-center gap-2"><Avatar name={x.handle} size={24} colors={t?.colors ?? NO_COLORS} /><div className="leading-tight min-w-0"><div className="font-semibold truncate">{x.handle}{x.isCustom && <span className="text-[9px] text-accent font-bold ml-1">CUSTOM</span>}</div><div className="text-[10px] text-dim truncate">{flag(x.country)} {x.name}</div></div></div></td>
                    <td className="text-xs whitespace-nowrap" style={{ color: STAFF_ROLE_INFO[x.role]?.color }}>{STAFF_ROLE_INFO[x.role]?.label ?? x.role}</td>
                    <td className="text-center"><div className="flex justify-center"><Rating v={staffRating(x)} size="sm" /></div></td>
                    <td className="text-xs">{t ? <span className="flex items-center gap-1"><TeamLogo team={t} size={16} />{t.short}</span> : <span className="text-accent">{state.staff[x.id] ? 'Free agent' : 'Market'}</span>}</td>
                    <td className="text-right">{x.id === currentId ? <span className="text-[11px] text-gold2">Editing</span> : <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => nav('editor', 'staff', x.id)}>Edit</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length > limit && <div className="text-center py-2"><button className="btn btn-ghost text-xs" onClick={() => setLimit(limit + 50)}>Show more ({list.length - limit} more)</button></div>}
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ overview & library
function Overview({ state }: { state: GameState }) {
  const [lib, setLib] = useState<Library | null>(null);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'player' | 'team' | 'staff'; id: string } | null>(null);
  useEffect(() => { loadLibrary().then(setLib); }, []);
  const customPlayers = Object.values(state.players).filter((p) => p.isCustom).sort((a, b) => playerOvr(b) - playerOvr(a));
  const customTeams = Object.values(state.teams).filter((t) => t.isCustom);
  const customStaff = Object.values(state.staff).filter((x) => x?.isCustom).sort((a, b) => staffRating(b) - staffRating(a));
  const saveLib = async (l: Library) => { await setCustomLibrary(l); setLib({ ...l }); };

  const saveAll = async () => {
    let l = await loadLibrary();
    for (const p of customPlayers) l = { ...l, players: [toLibraryPlayer(p), ...l.players.filter((x) => x.id !== p.id)] };
    for (const t of customTeams) l = { ...l, teams: [toLibraryTeam(state, t), ...l.teams.filter((x) => x.id !== t.id)] };
    await saveLib(l);
    notify(`Saved ${customPlayers.length} players and ${customTeams.length} teams to the library`);
  };
  const exportLib = () => {
    if (!lib) return;
    const blob = new Blob([JSON.stringify(lib)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rift-manager-custom-library.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const importLib = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as Partial<Library>;
      const cur = await loadLibrary();
      const players = [...(data.players ?? []), ...cur.players.filter((x) => !(data.players ?? []).some((y) => y.id === x.id))];
      const teams = [...(data.teams ?? []), ...cur.teams.filter((x) => !(data.teams ?? []).some((y) => y.id === x.id))];
      await saveLib({ players, teams });
      notify(`Imported ${(data.players ?? []).length} players and ${(data.teams ?? []).length} teams into the library`);
    } catch { notify('Could not read that library file'); }
  };

  const s = q.trim().toLowerCase();
  const editPlayers = s ? Object.values(state.players).filter((p) => !p.id.startsWith('standin_') && (p.handle.toLowerCase().includes(s) || p.name.toLowerCase().includes(s))).sort((a, b) => playerOvr(b) - playerOvr(a)).slice(0, 8) : [];
  const editTeams = s ? Object.values(state.teams).filter((t) => t.name.toLowerCase().includes(s) || t.short.toLowerCase().includes(s)).slice(0, 6) : [];
  const editStaff = s ? allStaff(state).filter((x) => x.handle.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)).sort((a, b) => staffRating(b) - staffRating(a)).slice(0, 6) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Custom players" value={customPlayers.length} sub="in this career" />
        <Stat label="Custom teams" value={customTeams.length} sub={`in this career · ${customStaff.length} custom staff`} />
        <Stat label="Library players" value={lib ? lib.players.length : '…'} sub="shared across careers" />
        <Stat label="Library teams" value={lib ? lib.teams.length : '…'} sub="shared across careers" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Edit anything" className="xl:col-span-1">
          <input className="input w-full" placeholder="Search any player, team or staff to edit…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-col gap-1 mt-2">
            {!s && <div className="text-xs text-dim">Real players, teams and staff can be edited too — changes apply to this career only.</div>}
            {editTeams.map((t) => (
              <button key={t.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#121b30] text-left text-sm" onClick={() => nav('editor', 'team', t.id)}>
                <TeamLogo team={t} size={22} /><span className="flex-1 truncate">{t.name}</span><span className="text-[11px] text-dim">{state.leagues[t.leagueId]?.name}</span>
              </button>
            ))}
            {editPlayers.map((p) => (
              <button key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#121b30] text-left text-sm" onClick={() => nav('editor', 'player', p.id)}>
                <Portrait player={p} size={22} team={p.teamId ? state.teams[p.teamId] : null} /><span className="flex-1 truncate">{p.handle} <span className="text-dim text-xs">{p.name}</span></span><RoleIcon role={p.role} size={12} /><span className="text-[11px] text-dim w-14 text-right truncate">{p.teamId ? state.teams[p.teamId]?.short : 'FA'}</span>
              </button>
            ))}
            {editStaff.map((x) => (
              <button key={x.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#121b30] text-left text-sm" onClick={() => nav('editor', 'staff', x.id)}>
                <Avatar name={x.handle} size={22} colors={x.teamId ? state.teams[x.teamId]?.colors ?? NO_COLORS : NO_COLORS} /><span className="flex-1 truncate">{x.handle} <span className="text-dim text-xs">{x.name}</span></span><span className="text-[10px]" style={{ color: STAFF_ROLE_INFO[x.role]?.color }}>{STAFF_SHORT[x.role]}</span><span className="text-[11px] text-dim w-14 text-right truncate">{x.teamId ? state.teams[x.teamId]?.short : 'FA'}</span>
              </button>
            ))}
            {s && !editTeams.length && !editPlayers.length && !editStaff.length && <div className="text-xs text-dim">No matches.</div>}
          </div>
        </Panel>

        <Panel title={`Custom players · ${customPlayers.length}`} bodyClass="p-0" className="xl:col-span-2" right={<button className="btn btn-gold px-2 py-1 text-xs" onClick={() => nav('editor', 'player')}>+ New player</button>}>
          {customPlayers.length === 0 ? <Empty>No custom players yet.</Empty> : (
            <div className="max-h-[360px] overflow-auto">
              <table className="tbl">
                <thead><tr><th>Player</th><th>Pos</th><th className="text-right">Age</th><th className="text-center">Ovr</th><th className="text-center">Pot</th><th>Team</th><th className="text-right">Value</th><th></th></tr></thead>
                <tbody>
                  {customPlayers.map((p) => {
                    const t = p.teamId ? state.teams[p.teamId] : null;
                    return (
                      <tr key={p.id} className="row" onClick={() => nav('player', p.id)}>
                        <td><div className="flex items-center gap-2"><Portrait player={p} team={t} size={26} /><div className="leading-tight"><div className="font-semibold">{p.handle}{p.retired && <span className="text-[9px] text-dim ml-1">RETIRED</span>}</div><div className="text-[10px] text-dim">{flag(p.country)} {p.name}</div></div></div></td>
                        <td><RoleIcon role={p.role} size={14} /></td>
                        <td className="text-right font-display">{playerAge(p, state.date) ?? '—'}</td>
                        <td className="text-center"><div className="flex justify-center"><Rating v={playerOvr(p)} size="sm" /></div></td>
                        <td className="text-center font-display" style={{ color: ratingColor(p.hidden.potential) }}>{Math.round(p.hidden.potential)}</td>
                        <td className="text-xs">{t ? <span className="flex items-center gap-1"><TeamLogo team={t} size={16} />{t.short}</span> : <span className="text-accent">Free agent</span>}</td>
                        <td className="text-right font-display">{money(p.value)}</td>
                        <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end">
                            <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => nav('editor', 'player', p.id)}>Edit</button>
                            <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={async () => { setLib(await upsertLibrary({ player: toLibraryPlayer(p) })); notify(`${p.handle} saved to the library`); }}>To library</button>
                            <button className="btn btn-danger px-2 py-0.5 text-xs" onClick={() => setConfirm({ kind: 'player', id: p.id })}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title={`Custom teams · ${customTeams.length}`} bodyClass="p-0" right={<button className="btn btn-gold px-2 py-1 text-xs" onClick={() => nav('editor', 'team')}>+ New team</button>}>
        {customTeams.length === 0 ? <Empty>No custom teams yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Team</th><th>League</th><th className="text-center">Rating</th><th className="text-right">Squad</th><th className="text-right">Fans</th><th className="text-right">Balance</th><th></th></tr></thead>
              <tbody>
                {customTeams.map((t) => (
                  <tr key={t.id} className="row" onClick={() => nav('team', t.id)}>
                    <td><div className="flex items-center gap-2"><TeamLogo team={t} size={26} /><span className="font-semibold">{t.name}</span><span className="text-dim text-xs">{t.short}</span>{t.id === state.userTeamId && <span className="text-[9px] text-gold font-bold">YOU</span>}</div></td>
                    <td className="text-xs text-muted">{state.leagues[t.leagueId]?.name}</td>
                    <td className="text-center"><div className="flex justify-center"><Rating v={teamRating(state, t)} size="sm" /></div></td>
                    <td className="text-right font-display">{t.roster.length}</td>
                    <td className="text-right font-display">{num(t.fans)}</td>
                    <td className="text-right font-display">{money(t.balance)}</td>
                    <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => nav('editor', 'team', t.id)}>Edit</button>
                        {t.id !== state.userTeamId && <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => switchToTeam(state, t.id)}>Manage</button>}
                        <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={async () => { setLib(await upsertLibrary({ team: toLibraryTeam(state, t) })); notify(`${t.name} saved to the library`); }}>To library</button>
                        <button className="btn btn-danger px-2 py-0.5 text-xs" disabled={t.id === state.userTeamId} onClick={() => setConfirm({ kind: 'team', id: t.id })}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={`Custom staff · ${customStaff.length}`} bodyClass="p-0" right={<button className="btn btn-gold px-2 py-1 text-xs" onClick={() => nav('editor', 'staff')}>+ New staff</button>}>
        {customStaff.length === 0 ? <Empty>No custom staff yet. Real coaches and analysts can be edited from the search above.</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Staff</th><th>Role</th><th className="text-center">Rating</th><th>Team</th><th className="text-right">Salary</th><th></th></tr></thead>
              <tbody>
                {customStaff.map((x) => {
                  const t = x.teamId ? state.teams[x.teamId] : null;
                  return (
                    <tr key={x.id} className="row" onClick={() => nav('editor', 'staff', x.id)}>
                      <td><div className="flex items-center gap-2"><Avatar name={x.handle} size={26} colors={t?.colors ?? NO_COLORS} /><div className="leading-tight"><div className="font-semibold">{x.handle}</div><div className="text-[10px] text-dim">{flag(x.country)} {x.name}</div></div></div></td>
                      <td className="text-xs" style={{ color: STAFF_ROLE_INFO[x.role]?.color }}>{STAFF_ROLE_INFO[x.role]?.label ?? x.role}</td>
                      <td className="text-center"><div className="flex justify-center"><Rating v={staffRating(x)} size="sm" /></div></td>
                      <td className="text-xs">{t ? <span className="flex items-center gap-1"><TeamLogo team={t} size={16} />{t.short}</span> : <span className="text-accent">Free agent</span>}</td>
                      <td className="text-right font-display">{x.contract ? money(x.contract.salary) : '—'}</td>
                      <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => nav('editor', 'staff', x.id)}>Edit</button>
                          <button className="btn btn-danger px-2 py-0.5 text-xs" onClick={() => setConfirm({ kind: 'staff', id: x.id })}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Custom content library" right={
        <div className="flex gap-1">
          <button className="btn px-2 py-1 text-xs" disabled={!customPlayers.length && !customTeams.length} onClick={saveAll}>Save all to library</button>
          <button className="btn px-2 py-1 text-xs" disabled={!lib || (!lib.players.length && !lib.teams.length)} onClick={exportLib}>Export file</button>
          <label className="btn px-2 py-1 text-xs cursor-pointer">Import file<input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { importLib(e.target.files?.[0]); e.target.value = ''; }} /></label>
        </div>
      }>
        <div className="text-xs text-dim mb-3">The library is stored in this browser and shared by all careers. Importing a player adds a copy as a free agent; loading a team opens it in the team editor (its custom players are imported as free agents first).</div>
        {!lib ? <div className="text-sm text-muted">Loading…</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim font-bold mb-1">Players · {lib.players.length}</div>
              {lib.players.length === 0 ? <div className="text-sm text-dim py-4">No players in the library.</div> : (
                <div className="flex flex-col gap-1 max-h-[340px] overflow-auto pr-1">
                  {lib.players.map((lp) => (
                    <div key={lp.id} className="panel-flat px-2 py-1.5 flex items-center gap-2">
                      <Portrait player={lp} size={28} />
                      <div className="flex-1 min-w-0 leading-tight"><div className="font-semibold text-sm truncate">{lp.handle}</div><div className="text-[10px] text-dim">{ROLE_LABEL[lp.role]} · ovr {overall(lp.attributes, lp.role)} · {flag(lp.country)} {lp.country}</div></div>
                      <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => { const p = importLibraryPlayer(state, lp); bump(); notify(`${p.handle} imported as a free agent`); }}>Import</button>
                      <button className="btn btn-ghost px-2 py-0.5 text-xs text-red-400" title="Remove from library" onClick={() => saveLib({ ...lib, players: lib.players.filter((x) => x.id !== lp.id) })}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim font-bold mb-1">Teams · {lib.teams.length}</div>
              {lib.teams.length === 0 ? <div className="text-sm text-dim py-4">No teams in the library.</div> : (
                <div className="flex flex-col gap-1 max-h-[340px] overflow-auto pr-1">
                  {lib.teams.map((lt) => (
                    <div key={lt.id} className="panel-flat px-2 py-1.5 flex items-center gap-2">
                      <TeamLogo team={{ short: lt.short, colors: lt.colors, logo: lt.logo } as Team} size={28} />
                      <div className="flex-1 min-w-0 leading-tight"><div className="font-semibold text-sm truncate">{lt.name} <span className="text-dim text-xs">{lt.short}</span></div><div className="text-[10px] text-dim">{state.leagues[lt.leagueId]?.name ?? lt.leagueId} · {(lt.customPlayers?.length ?? 0)} custom + {(lt.realPlayerIds?.length ?? 0)} real players</div></div>
                      <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => { pendingTeamDraft = draftFromLibraryTeam(state, lt); bump(); nav('editor', 'team'); }}>Load</button>
                      <button className="btn btn-ghost px-2 py-0.5 text-xs text-red-400" title="Remove from library" onClick={() => saveLib({ ...lib, teams: lib.teams.filter((x) => x.id !== lt.id) })}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      {confirm && (() => {
        const isP = confirm.kind === 'player', isS = confirm.kind === 'staff';
        const name = isP ? state.players[confirm.id]?.handle : isS ? state.staff[confirm.id]?.handle : state.teams[confirm.id]?.name;
        const blocked = confirm.kind === 'team' && teamInCompetitions(state, confirm.id);
        return (
          <Modal open onClose={() => setConfirm(null)} title={`Delete ${name}?`} width={440}>
            <div className="text-sm text-muted">
              {isP ? 'The player is removed from their team and this career (players with match records are retired instead).'
                : isS ? 'The staff member is removed from their team and this career.' : blocked ? 'This team is already part of this season\'s competitions and cannot be deleted.' : 'All players become free agents and the staff are released.'}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={blocked} onClick={() => { const r = isP ? deleteCustomPlayer(state, confirm.id) : isS ? deleteCustomStaff(state, confirm.id) : deleteCustomTeam(state, confirm.id); bump(); notify(r.message); setConfirm(null); }}>Delete</button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}


