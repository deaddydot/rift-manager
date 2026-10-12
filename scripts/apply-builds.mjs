// Apply scripts/data/opgg-builds.json to public/data/champions.json without rebuilding champions.
import fs from 'node:fs';
import path from 'node:path';
import { mergeBuilds, mergeMatchups } from './lib/builds.mjs';
const ROOT = path.resolve(import.meta.dirname, '..');
const champFile = path.join(ROOT, 'public/data/champions.json');
const data = JSON.parse(fs.readFileSync(champFile, 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/items.json'), 'utf8')).items;
const n = mergeBuilds(data.champions, items, ROOT);
const m = mergeMatchups(data.champions, ROOT);
fs.writeFileSync(champFile, JSON.stringify(data));
console.log(`applied ${n} champion-role builds, ${m} champion-role matchup tables`);
