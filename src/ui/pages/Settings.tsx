import { useEffect, useState, lazy, Suspense, type ReactNode } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { GameSettings } from '../../engine/types';
import { listSaves, loadGame, deleteSave, exportSave, importSave, type SaveMeta } from '../../store/persist';
import { Panel, Modal, Pill, TeamLogo, Empty, fmtDate } from '../components/kit';
// the AI chat isn't part of the online build (the literal env check lets the bundler drop it)
const AiChatSettings = import.meta.env.VITE_HOSTED !== '1' ? lazy(() => import('../match/aiChat/AiChatSettings')) : null;
import CasterSettings from '../match/broadcast/CasterSettings';
import SoundSettings from '../audio/SoundSettings';
import { armSecret } from '../cheats';

type Confirm = { title: string; body: ReactNode; actions: { label: string; cls?: string; fn: () => void | Promise<void> }[] } | null;

const SIM_OPTIONS: { id: GameSettings['simDetail']; label: string; desc: string; speed: string }[] = [
  { id: 'mine', label: 'My matches only', desc: 'Only your own series use the full tick-by-tick engine. Every other match in the world is resolved by the fast statistical sim (team strength, form, draft and variance).', speed: 'Fastest' },
  { id: 'tier1', label: 'Tier 1 competitions', desc: 'Matches in major leagues and international events also run through the full engine, giving realistic box scores, KDA and champion stats for top players. Lower tiers use the fast sim.', speed: 'Balanced' },
  { id: 'all', label: 'Every match', desc: 'All matches in all 34 leagues run on the full engine. The most detailed stats everywhere, but advancing days is noticeably slower.', speed: 'Slowest' },
];
const SPEEDS = [1, 2, 4, 8, 16];

export default function Settings(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const team = state.teams[state.userTeamId];
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);

  const refresh = () => listSaves().then(setSaves).catch(() => setSaves([]));
  useEffect(() => { refresh(); }, []);
  const current = saves?.find((s) => s.id === state.id);
  const unsaved = !current || current.date !== state.date;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { notify(`Error: ${String(e)}`); } finally { setBusy(null); }
  };

  const save = () => run('save', async () => { await useStore.getState().save(); await refresh(); });
  const saveAs = () => run('saveas', async () => {
    const name = newName.trim() || `${state.saveName} (copy)`;
    state.id = `save_${Date.now().toString(36)}`;
    state.saveName = name;
    bump();
    await useStore.getState().save();
    setNewName('');
    await refresh();
  });
  const doExport = () => run('export', async () => { await exportSave(state); notify('Save exported'); });

  const toMenu = () => { useStore.getState().setState(null); nav('home'); };
  const askMenu = () => setConfirm({
    title: 'Return to main menu',
    body: unsaved ? <>You have progress since your last save ({current ? `saved at ${fmtDate(current.date)}` : 'never saved'}). Save before leaving?</> : 'Your career is saved. Return to the main menu?',
    actions: unsaved
      ? [
          { label: 'Save & exit', cls: 'btn-gold', fn: async () => { await useStore.getState().save(); toMenu(); } },
          { label: 'Exit without saving', cls: 'btn-danger', fn: toMenu },
        ]
      : [{ label: 'Main menu', cls: 'btn-gold', fn: toMenu }],
  });

  const askLoad = (s: SaveMeta) => setConfirm({
    title: `Load "${s.name}"`,
    body: <>{s.team} · in-game {fmtDate(s.date)}.{unsaved && <><br /><span className="text-amber-300">Unsaved progress in the current career will be lost.</span></>}</>,
    actions: [
      ...(unsaved ? [{ label: 'Save current & load', cls: 'btn-gold', fn: async () => { await useStore.getState().save(); await loadInto(s.id); } }] : []),
      { label: unsaved ? 'Load without saving' : 'Load', cls: unsaved ? 'btn-danger' : 'btn-gold', fn: () => loadInto(s.id) },
    ],
  });
  const loadInto = async (id: string) => {
    const g = await loadGame(id);
    if (!g) { notify('Save could not be read'); return; }
    useStore.getState().setState(g);
    nav('home');
  };

  const askDelete = (s: SaveMeta) => setConfirm({
    title: `Delete "${s.name}"`,
    body: <>This permanently removes the stored save ({s.team}, {fmtDate(s.date)}).{s.id === state.id && <><br /><span className="text-amber-300">This is the career you are playing. It stays open, but you will need to save again to keep it.</span></>}</>,
    actions: [{ label: 'Delete save', cls: 'btn-danger', fn: async () => { await deleteSave(s.id); await refresh(); notify('Save deleted'); } }],
  });

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const g = await importSave(f);
      if (!g?.teams || !g.userTeamId) throw new Error('not a Rift Manager save');
      setConfirm({
        title: 'Import save',
        body: <>Open <b>{g.saveName}</b> ({g.teams[g.userTeamId]?.name}, {fmtDate(g.date)})?{unsaved && <><br /><span className="text-amber-300">Unsaved progress in the current career will be lost.</span></>}</>,
        actions: [{ label: 'Open imported save', cls: 'btn-gold', fn: () => { useStore.getState().setState(g); nav('home'); } }],
      });
    } catch (e) { notify(`Import failed: ${String(e)}`); }
  };

  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => { state.settings[k] = v; bump(); };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-text leading-none">Save & Settings</h1>
          <div className="text-sm text-muted mt-1">Manage your saves, simulation detail and preferences</div>
        </div>
        <button className="btn btn-danger" onClick={askMenu}>Main menu</button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Current career" right={!current ? <Pill color="#fbbf24">Never saved</Pill> : unsaved ? <Pill color="#fbbf24">Last save {fmtDate(current.date, { month: 'short', day: 'numeric' })} · progress since</Pill> : <Pill color="#4ade80">Saved {new Date(current.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Pill>}>
          <div className="flex items-center gap-4 mb-4">
            <TeamLogo team={team} size={56} />
            <div className="flex-1 min-w-0">
              <input className="input w-full font-display text-lg font-bold" value={state.saveName} onChange={(e) => { state.saveName = e.target.value; bump(); }} aria-label="Save name" />
              <div className="text-xs text-muted mt-1">{team.name} · {state.manager.name} · Season {state.season} · in-game {fmtDate(state.date)}</div>
              <div className="text-[11px] text-dim">ID {state.id} · started {new Date(state.createdAt).toLocaleDateString()}{current ? ` · last saved ${new Date(current.savedAt).toLocaleString()} · ${(current.size / 1e6).toFixed(1)} MB` : ' · not saved yet'}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-gold" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save game'}</button>
            <button className="btn" disabled={!!busy} onClick={doExport}>{busy === 'export' ? 'Exporting…' : 'Export save file'}</button>
            <label className="btn cursor-pointer">Import save file<input type="file" accept=".lolsave,.json" className="hidden" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} /></label>
          </div>
          <div className="border-t hairline mt-4 pt-4">
            <div className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">Save as new slot</div>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder={`${state.saveName} (copy)`} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveAs(); }} />
              <button className="btn" disabled={!!busy} onClick={saveAs}>{busy === 'saveas' ? 'Saving…' : 'Save as new'}</button>
            </div>
            <div className="text-[11px] text-dim mt-1.5">Creates a separate save with a new ID; you continue playing in the new slot and the old one stays untouched.</div>
          </div>
        </Panel>

        <Panel title={`Saved careers${saves ? ` (${saves.length})` : ''}`} bodyClass="p-0">
          {saves === null ? <Empty>Loading saves…</Empty> : saves.length === 0 ? <Empty>No saves in this browser yet.</Empty> : (
            <div className="max-h-[340px] overflow-auto">
              {saves.map((s) => {
                const isCur = s.id === state.id;
                return (
                  <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 border-b border-[#141e33] last:border-0 ${isCur ? 'bg-[#111a2e]' : ''}`}>
                    <TeamLogo team={state.teams[s.teamId]} size={30} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">{s.name}{isCur && <Pill color="#f0c674">Current</Pill>}</div>
                      <div className="text-[11px] text-muted truncate">{s.team} · in-game {fmtDate(s.date)} · saved {new Date(s.savedAt).toLocaleString()} · {(s.size / 1e6).toFixed(1)} MB</div>
                    </div>
                    {!isCur && <button className="btn py-1 text-xs" onClick={() => askLoad(s)}>Load</button>}
                    <button className="btn btn-danger py-1 text-xs" onClick={() => askDelete(s)}>Delete</button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="px-4 py-2 text-[11px] text-dim border-t hairline">Saves are stored compressed in this browser (IndexedDB). Export a file to back up or move a career to another device.</div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
        <Panel title="Simulation detail">
          <p className="text-xs text-muted mb-3">Decides which background matches (not involving your team) run through the full tick-by-tick match engine versus the fast statistical simulation. Your own matches always use the full engine.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SIM_OPTIONS.map((o) => {
              const active = state.settings.simDetail === o.id;
              return (
                <button key={o.id} onClick={() => set('simDetail', o.id)} className={`panel-flat p-3 text-left transition ${active ? 'border-gold ring-1 ring-gold' : 'hover:border-line2'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-semibold ${active ? 'text-gold2' : ''}`}>{o.label}</span>
                    <span className={`w-3.5 h-3.5 rounded-full border-2 ${active ? 'border-gold bg-gold' : 'border-line2'}`} />
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-dim font-semibold mb-1.5">{o.speed}</div>
                  <div className="text-xs text-muted leading-relaxed">{o.desc}</div>
                </button>
              );
            })}
          </div>
        </Panel>

        {AiChatSettings && (
          <Panel title="Live match chat">
            <Suspense fallback={<div className="text-xs text-muted">Loading…</div>}><AiChatSettings /></Suspense>
          </Panel>
        )}

        <Panel title="Broadcast casters">
          <CasterSettings />
        </Panel>

        <Panel title="Sound">
          <SoundSettings />
        </Panel>

        <Panel title="Preferences">
          <div className="space-y-4">
            <Toggle label="Auto-save" desc="Save automatically after every Continue (when the simulation stops)." value={state.settings.autoSave} onChange={(v) => set('autoSave', v)} />
            <Toggle label="Lore rules" desc="Some results are written in the stars: T1 never lose a game to an LPL team." value={state.settings.loreRules !== false} onChange={(v) => set('loreRules', v)} />
            <Toggle label="Fog of war in match viewer" desc="Hide enemy positions outside your team's vision while watching matches." value={state.settings.showFog} onChange={(v) => set('showFog', v)} />
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">Default match speed</div>
                  <div className="text-xs text-muted">Playback speed when a live match starts. You can still change it in the Match Center.</div>
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                {SPEEDS.map((s) => (
                  <button key={s} className={`btn flex-1 justify-center py-1.5 ${state.settings.matchSpeed === s ? 'btn-gold' : ''}`} onClick={() => set('matchSpeed', s)}>{s}×</button>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Credits & data sources">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-xs text-muted leading-relaxed">
          <Credit name="Leaguepedia" license="CC BY-SA 3.0" href="https://lol.fandom.com">Rosters, player and staff details, team logos, 2026 match history and results. Derived data is shared under the same license.</Credit>
          <Credit name="Liquipedia" license="CC BY-SA 3.0" href="https://liquipedia.net/leagueoflegends">A few player portraits Leaguepedia had no photo of (only where the real name matched).</Credit>
          <Credit name="Riot Data Dragon" license="Riot Games static data" href="https://developer.riotgames.com/docs/lol#data-dragon">Champion, ability and item metadata, icons and splash assets.</Credit>
          <Credit name="Meraki Analytics" license="Community dataset" href="https://github.com/meraki-analytics/lolstaticdata">Detailed champion ability values: damage scalings, cooldowns, crowd control.</Credit>
          <Credit name="CommunityDragon" license="Community CDN" href="https://www.communitydragon.org">Additional game assets and map data used by the match viewer; the League client's champ select sounds, champion voice lines and signature sounds.</Credit>
        </div>
        <div className="text-[11px] text-dim mt-4 border-t hairline pt-3">
          {/* easter egg (ui/cheats.ts): click the name, then type the word */}
          <span onClick={() => armSecret((word, now) => notify(word === 'faker'
            ? (now ? '🐐 The Unkillable Demon King is watching. Your next live match has a new button.' : 'The Demon King goes back to sleep.')
            : (now ? '🛠 Dev tools unlocked: the Editor is in the sidebar for this session.' : 'Dev tools locked again.')))}>Rift Manager</span> is a fan-made, non-commercial project. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc. This project is not endorsed by or affiliated with Riot Games. Sponsors, staff free agents and generated prospects are fictional.
        </div>
      </Panel>

      {confirm && (
        <Modal open onClose={() => setConfirm(null)} title={confirm.title} width={480}>
          <div className="text-sm text-muted mb-5">{confirm.body}</div>
          <div className="flex justify-end gap-2 flex-wrap">
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
            {confirm.actions.map((a) => (
              <button key={a.label} className={`btn ${a.cls ?? ''}`} disabled={!!busy} onClick={() => run('confirm', async () => { await a.fn(); setConfirm(null); })}>{a.label}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      <button role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)} className={`relative w-11 h-6 rounded-full shrink-0 transition border ${value ? 'bg-gold/80 border-gold' : 'bg-[#0a1120] border-line2'}`}>
        <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full transition-all ${value ? 'left-[22px] bg-[#0b0f19]' : 'left-0.5 bg-muted'}`} style={{ width: 18, height: 18 }} />
      </button>
    </div>
  );
}

function Credit({ name, license, href, children }: { name: string; license: string; href: string; children: ReactNode }) {
  return (
    <div className="panel-flat p-3">
      <a href={href} target="_blank" rel="noreferrer noopener" className="font-semibold text-text hover:text-gold2">{name}</a>
      <div className="text-[11px] text-gold mb-1">{license}</div>
      <div>{children}</div>
    </div>
  );
}
