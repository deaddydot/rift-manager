// Merge per-champion, per-role item builds (scripts/data/opgg-builds.json, collected from op.gg)
// into the champion list. The sim buys these in order; champions/roles without data fall back to
// archetype builds (src/engine/sim/champstats.ts).
import fs from 'node:fs';
import path from 'node:path';

export function mergeBuilds(champions, items, root) {
  const file = path.join(root, 'scripts/data/opgg-builds.json');
  if (!fs.existsSync(file)) return 0;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const known = new Set(items.map((i) => i.id));
  const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  const starterByName = Object.fromEntries(items.filter((i) => i.kind === 'starter').map((i) => [norm(i.name), i.id]));
  let n = 0;
  for (const c of champions) {
    const byRole = data.builds?.[c.id];
    if (!byRole) continue;
    const out = {};
    for (const [role, b] of Object.entries(byRole)) {
      const core = (b.core ?? []).filter((id) => known.has(id));
      const late = (b.late ?? []).filter((id) => known.has(id) && !core.includes(id));
      if (core.length < 2) continue;
      const start = (b.start ?? []).map((n) => starterByName[norm(n)]).find(Boolean) ?? null;
      out[role] = { boots: b.boots && known.has(b.boots) ? b.boots : null, core, late, start };
      n++;
    }
    if (Object.keys(out).length) c.builds = out; else delete c.builds;
  }
  return n;
}

/** Merge scripts/data/matchups.json (op.gg lane matchups: 3 easiest / 3 hardest per role) into the champion list. */
export function mergeMatchups(champions, root) {
  const file = path.join(root, 'scripts/data/matchups.json');
  if (!fs.existsSync(file)) return 0;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = new Set(champions.map((c) => c.id));
  let n = 0;
  for (const c of champions) {
    const byRole = data.matchups?.[c.id];
    if (!byRole) continue;
    const out = {};
    for (const [role, m] of Object.entries(byRole)) {
      const clean = (xs) => (xs ?? []).filter((x) => ids.has(x.id) && x.id !== c.id).slice(0, 3).map((x) => ({ id: x.id, wr: Math.round(x.wr * 1000) / 1000 }));
      const easy = clean(m.easy), hard = clean(m.hard);
      if (easy.length || hard.length) { out[role] = { easy, hard }; n++; }
    }
    if (Object.keys(out).length) c.matchups = out;
  }
  // curated overrides (scripts/data/matchup-overrides.json) win over the data, applied both ways
  const ovFile = path.join(root, 'scripts/data/matchup-overrides.json');
  if (fs.existsSync(ovFile)) {
    const byId = Object.fromEntries(champions.map((c) => [c.id, c]));
    const put = (champ, role, kind, entry) => {
      const c = byId[champ];
      if (!c) return;
      const m = ((c.matchups ??= {})[role] ??= { easy: [], hard: [] });
      const other = kind === 'easy' ? 'hard' : 'easy';
      m[other] = m[other].filter((x) => x.id !== entry.id);
      m[kind] = [entry, ...m[kind].filter((x) => x.id !== entry.id)].slice(0, 3);
    };
    const ov = JSON.parse(fs.readFileSync(ovFile, 'utf8'));
    for (const [key, list] of Object.entries(ov.easy ?? {})) {
      const [champ, role] = key.split('/');
      for (const e of list) { put(champ, role, 'easy', { id: e.id, wr: e.wr }); put(e.id, role, 'hard', { id: champ, wr: Math.round((1 - e.wr) * 1000) / 1000 }); }
    }
  }
  return n;
}
