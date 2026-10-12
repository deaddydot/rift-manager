import { useEffect, useMemo, useState } from 'react';
import { useStore, nav } from '../../store/game';
import { listSaves, loadGame, deleteSave, importSave, type SaveMeta } from '../../store/persist';
import { TeamLogo, money, Rating, fmtDate } from '../components/kit';
import type { Team } from '../../engine/types';
import { REGION_LABEL } from '../../engine/types';

export default function MainMenu() {
  const [mode, setMode] = useState<'menu' | 'new'>('menu');
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const setState = useStore((s) => s.setState);
  useEffect(() => { listSaves().then(setSaves); }, []);

  const load = async (id: string) => { const s = await loadGame(id); if (s) { setState(s); nav('home'); } };
  const onImport = async (f: File | undefined) => { if (!f) return; const s = await importSave(f); setState(s); nav('home'); };

  if (mode === 'new') return <NewGame onBack={() => setMode('menu')} />;
  return (
    <div className="h-full overflow-auto">
      <div className="relative min-h-full flex flex-col items-center justify-center px-6 py-16" style={{ background: 'radial-gradient(1200px 600px at 50% 20%, #13213d 0%, #070b14 60%)' }}>
        <img src={`${import.meta.env.BASE_URL}img/rift.webp`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.07] pointer-events-none" />
        <div className="relative text-center mb-10">
          <div className="font-display text-7xl font-bold gold-text tracking-[0.2em]">RIFT MANAGER</div>
          <div className="text-muted mt-2">League of Legends esports management · 2026 season · {useStore.getState().db?.players.length} real players · 34 leagues</div>
        </div>
        <div className="relative flex flex-col gap-3 w-80">
          <button className="btn btn-gold justify-center py-3 text-lg" onClick={() => setMode('new')}>New Career</button>
          <label className="btn justify-center py-2.5 cursor-pointer">Import save file<input type="file" accept=".lolsave,.json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} /></label>
        </div>
        {saves.length > 0 && (
          <div className="relative mt-10 w-full max-w-2xl panel">
            <div className="px-4 py-2.5 border-b hairline font-display font-bold text-gold2 uppercase text-sm tracking-wider">Load career</div>
            {saves.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#141e33] last:border-0">
                <div className="flex-1">
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-muted">{s.team} · in-game {fmtDate(s.date)} · saved {new Date(s.savedAt).toLocaleString()} · {(s.size / 1e6).toFixed(1)} MB</div>
                </div>
                <button className="btn btn-gold" onClick={() => load(s.id)}>Load</button>
                <button className="btn btn-danger" onClick={async () => { if (confirm(`Delete save "${s.name}"?`)) { await deleteSave(s.id); setSaves(await listSaves()); } }}>Delete</button>
              </div>
            ))}
          </div>
        )}
        <div className="relative mt-12 text-xs text-dim max-w-2xl text-center leading-relaxed">
          Fan-made, non-commercial. Rosters, stats and match history from Leaguepedia (CC BY-SA). Champion data from Riot Data Dragon and Meraki Analytics.
          League of Legends is a trademark of Riot Games, Inc. This project is not endorsed by Riot Games.
        </div>
      </div>
    </div>
  );
}

function NewGame({ onBack }: { onBack: () => void }) {
  const db = useStore((s) => s.db)!;
  const newGame = useStore((s) => s.newGame);
  const [tier, setTier] = useState<1 | 2 | 3>(1);
  const [league, setLeague] = useState('LCK');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [manager, setManager] = useState('Manager');
  const leagues = db.leagues.filter((l) => l.tier === tier);
  const teams = useMemo(() => db.teams.filter((t) => t.leagueId === league).sort((a, b) => b.elo - a.elo), [db, league]);
  const selected = db.teams.find((t) => t.id === teamId);
  const fakeTeam = (t: (typeof db.teams)[number]): Team => ({ id: t.id, name: t.name, short: t.short, logo: t.logoUrl, colors: ['#334155', '#e2e8f0'] } as unknown as Team);
  const roster = selected ? db.players.filter((p) => p.teamId === selected.id) : [];

  return (
    <div className="h-full overflow-auto p-8 max-w-6xl mx-auto">
      <button className="btn btn-ghost mb-4" onClick={onBack}>← Back</button>
      <h1 className="font-display text-4xl font-bold gold-text mb-1">New Career</h1>
      <p className="text-muted mb-6">Pick any of the {db.teams.length} real teams. Big orgs come with expectations; tier 2 and 3 teams are a climb.</p>
      <div className="flex gap-2 mb-4">
        {([1, 2, 3] as const).map((t) => (
          <button key={t} className={`btn ${tier === t ? 'btn-gold' : ''}`} onClick={() => { setTier(t); setLeague(db.leagues.find((l) => l.tier === t)!.id); setTeamId(null); }}>
            {t === 1 ? 'Major regions' : t === 2 ? 'Tier 2 / ERLs' : 'Tier 3 / Academy'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {leagues.map((l) => (
          <button key={l.id} className={`chip px-3 py-1.5 text-sm ${league === l.id ? 'border-gold text-gold2' : 'text-muted'}`} onClick={() => { setLeague(l.id); setTeamId(null); }}>
            {l.name} <span className="text-dim">· {REGION_LABEL[l.region]}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_380px] gap-5">
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 content-start">
          {teams.map((t) => (
            <button key={t.id} onClick={() => setTeamId(t.id)} className={`panel p-3 flex items-center gap-3 text-left transition ${teamId === t.id ? 'border-gold ring-1 ring-gold' : 'hover:border-line2'}`}>
              <TeamLogo team={fakeTeam(t)} size={44} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{t.name}</div>
                <div className="text-xs text-muted">2026: {t.realRecord.wins}-{t.realRecord.losses} · Elo {t.elo}</div>
              </div>
              <Rating v={t.rating} size="sm" />
            </button>
          ))}
        </div>
        <div className="panel p-4 sticky top-4 self-start">
          {selected ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <TeamLogo team={fakeTeam(selected)} size={56} />
                <div>
                  <div className="font-display text-2xl font-bold">{selected.name}</div>
                  <div className="text-xs text-muted">{db.leagues.find((l) => l.id === selected.leagueId)?.fullName}</div>
                </div>
              </div>
              <div className="text-xs uppercase text-muted font-semibold mb-1">Roster</div>
              <div className="space-y-1 mb-4 max-h-64 overflow-auto">
                {roster.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span><span className="text-dim w-14 inline-block uppercase text-xs">{p.role}</span>{p.handle}{p.isSub ? <span className="text-dim text-xs"> (sub)</span> : ''}</span>
                    <span className="text-muted">{Math.round((p.attributes.mechanics + p.attributes.laning + p.attributes.teamfight + p.attributes.macro) / 4)}</span>
                  </div>
                ))}
              </div>
              <label className="text-xs uppercase text-muted font-semibold">Manager name</label>
              <input className="input w-full mt-1 mb-4" value={manager} onChange={(e) => setManager(e.target.value)} />
              <button className="btn btn-gold w-full justify-center py-2.5" onClick={() => { newGame(selected.id, manager || 'Manager'); nav('home'); }}>Start career with {selected.short}</button>
              <div className="text-[11px] text-dim mt-3">Budget, fanbase and facilities are scaled to the club’s real stature.</div>
            </>
          ) : <div className="text-muted text-sm">Select a team to see its roster.</div>}
        </div>
      </div>
    </div>
  );
}
