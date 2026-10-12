import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const state = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'rift-manager-save.json'), 'utf8'));
const id = process.argv[2];
const c = state.competitions[id];
console.log(c.name, c.status, c.teams.map((t: string) => state.teams[t]?.short), 'direct', c.direct);
for (const s of c.stages) {
  console.log(' stage', s.id, s.format, s.status, 'teams', s.teams.map((t: string) => state.teams[t]?.short), 'results', s.results?.map((t: string) => state.teams[t]?.short));
  for (const fid of s.fixtures) { const f = state.fixtures[fid]; console.log('   ', f.date, f.label ?? '', f.round, state.teams[f.teamA]?.short ?? '-', 'vs', state.teams[f.teamB]?.short ?? '-', f.result ? `${f.result.scoreA}-${f.result.scoreB}` : 'pending', JSON.stringify(f.feeds ?? {})); }
}
// size breakdown
const sz = (o: unknown) => JSON.stringify(o).length / 1e6;
console.log('sizes MB: fixtures', sz(state.fixtures).toFixed(2), 'players', sz(state.players).toFixed(2), 'teams', sz(state.teams).toFixed(2), 'comps', sz(state.competitions).toFixed(2), 'news', sz(state.news).toFixed(2), 'inbox', sz(state.inbox).toFixed(2));
const p = Object.values(state.players) as any[];
console.log('player history MB', sz(p.map((x) => x.history)).toFixed(2), 'champions MB', sz(p.map((x) => x.champions)).toFixed(2), 'realStats', sz(p.map((x) => x.realStats)).toFixed(2));
