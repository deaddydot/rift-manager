// Pulls 2026 esports data from Leaguepedia: tournaments, rosters (incl. coaches),
// player bios, player images, team info, and per-game scoreboards.
// Output: data-raw/esports/*.json (raw), consumed by build-players.mjs
import fs from 'node:fs';
import path from 'node:path';
import { cargo, cargoIn, sqlList } from './lib/leaguepedia.mjs';
import { LEAGUES, INTERNATIONAL_LEAGUES } from './data/leagues.mjs';

const OUT = path.resolve(import.meta.dirname, '../data-raw/esports');
fs.mkdirSync(OUT, { recursive: true });
const save = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 0));
const SEASON_START = '2026-01-01';
const only = process.argv[2]; // optional: restrict to one step

// ---------------------------------------------------------------- tournaments
console.log('Tournaments...');
const allLp = [...LEAGUES.flatMap((l) => l.lp), ...INTERNATIONAL_LEAGUES];
const tournaments = await cargo({
  tables: 'Tournaments',
  fields: 'Name,OverviewPage,League,Region,DateStart,Date,TournamentLevel,IsQualifier,IsPlayoffs,Split,Prizepool,Country,Rulebook',
  where: `DateStart>='${SEASON_START}' AND League IN (${sqlList(allLp)})`,
  order_by: 'DateStart',
});
save('tournaments.json', tournaments);
console.log(`  ${tournaments.length} tournaments`);

// ---------------------------------------------------------------- rosters
const isSideEvent = (t) => t.IsQualifier === '1' || /promotion|relegation|qualifier|lcq|play-in|showmatch|all-star/i.test(t.Name + ' ' + t.OverviewPage);
const today = new Date().toISOString().slice(0, 10);
const rosters = {};
if (!only || only === 'rosters') {
  console.log('Rosters...');
  for (const league of LEAGUES) {
    const ts = tournaments.filter((t) => league.lp.includes(t.League) && !isSideEvent(t) && t.DateStart <= today);
    if (!ts.length) { console.log(`  ${league.id}: no tournaments`); continue; }
    const rows = await cargoIn({ tables: 'TournamentRosters', fields: 'OverviewPage,Team,RosterLinks,Roles,Flags' }, 'OverviewPage', ts.map((t) => t.OverviewPage));
    const byPage = {};
    for (const r of rows) (byPage[r.OverviewPage] ??= []).push(r);
    // Latest regular-season (non-playoff, non-invitational) tournament with a full field
    const sorted = [...ts].sort((a, b) => b.DateStart.localeCompare(a.DateStart));
    const isRegular = (t) => t.IsPlayoffs !== '1' && !/playoff|final|invitational|cup|road to|kickoff|stage 2|knockout/i.test(t.Name + ' ' + t.OverviewPage);
    const pick =
      sorted.find((t) => isRegular(t) && (byPage[t.OverviewPage]?.length ?? 0) >= 6) ??
      sorted.find((t) => isRegular(t) && (byPage[t.OverviewPage]?.length ?? 0) >= 4) ??
      sorted.find((t) => (byPage[t.OverviewPage]?.length ?? 0) >= 4) ??
      sorted.find((t) => byPage[t.OverviewPage]);
    if (!pick) { console.log(`  ${league.id}: no rosters`); continue; }
    // Merge in any later (playoff) tournament rosters for the same teams, to catch late changes
    const later = sorted.filter((t) => t.DateStart > pick.DateStart && byPage[t.OverviewPage]);
    const teams = {};
    for (const r of byPage[pick.OverviewPage]) teams[r.Team] = r;
    for (const t of later.reverse()) for (const r of byPage[t.OverviewPage]) if (teams[r.Team]) teams[r.Team] = r;
    rosters[league.id] = { tournament: pick.OverviewPage, tournamentName: pick.Name, teams: Object.values(teams), history: byPage };
    console.log(`  ${league.id}: ${pick.Name} -> ${Object.keys(teams).length} teams`);
  }
  save('rosters.json', rosters);
} else Object.assign(rosters, JSON.parse(fs.readFileSync(path.join(OUT, 'rosters.json'), 'utf8')));

// ---------------------------------------------------------------- people
const links = new Set();
const teamNames = new Set();
for (const l of Object.values(rosters)) for (const t of l.teams) {
  teamNames.add(t.Team);
  for (const link of t.RosterLinks.split(';;')) if (link) links.add(link);
}
if (!only || only === 'people') {
  console.log(`Players (${links.size})...`);
  const players = await cargoIn({
    tables: 'Players',
    fields: 'OverviewPage,ID,Player,Image,Name,NativeName,NameFull,Country,Nationality,NationalityPrimary,Birthdate,Residency,Team,Team2,Role,FavChamps,IsRetired,IsSubstitute,IsTrainee,SoloqueueIds,Stream',
  }, 'OverviewPage', [...links]);
  save('players_info.json', players);
  console.log(`  ${players.length} player records`);

  console.log('Player images...');
  const images = await cargoIn({ tables: 'PlayerImages', fields: 'Link,FileName,Team,Tournament,ImageType,IsProfileImage,SortDate' }, 'Link', [...links], 80);
  save('player_images.json', images);
  console.log(`  ${images.length} image records`);

  console.log(`Teams (${teamNames.size})...`);
  const redirects = await cargoIn({ tables: 'TeamRedirects', fields: 'AllName,_pageName=Page' }, 'AllName', [...teamNames]);
  const pages = [...new Set([...redirects.map((r) => r.Page), ...teamNames])];
  const teams = await cargoIn({ tables: 'Teams', fields: 'Name,OverviewPage,Short,Location,TeamLocation,Region,Image,IsDisbanded,RenamedTo,OrganizationPage,Twitter,Website' }, 'OverviewPage', pages);
  save('teams_info.json', { redirects, teams });
  console.log(`  ${teams.length} teams`);
}

// ---------------------------------------------------------------- scoreboards
if (!only || only === 'games') {
  const groups = [...LEAGUES.map((l) => ({ id: l.id, lp: l.lp })), { id: 'INTL', lp: INTERNATIONAL_LEAGUES }];
  for (const g of groups) {
    const file = `games_${g.id}.json`;
    if (fs.existsSync(path.join(OUT, file)) && process.env.REFRESH !== '1') { console.log(`  ${g.id}: cached`); continue; }
    const where = `T.League IN (${sqlList(g.lp)}) AND SG.DateTime_UTC>='${SEASON_START}'`;
    const games = await cargo({
      tables: 'ScoreboardGames=SG,Tournaments=T',
      join_on: 'SG.OverviewPage=T.OverviewPage',
      fields: 'SG.GameId,SG.MatchId,SG.OverviewPage,SG.Tournament,SG.Team1,SG.Team2,SG.WinTeam,SG.DateTime_UTC=Date,SG.Gamelength_Number=Length,SG.Team1Bans,SG.Team2Bans,SG.Team1Picks,SG.Team2Picks,SG.Team1Dragons,SG.Team2Dragons,SG.Team1Barons,SG.Team2Barons,SG.Team1Towers,SG.Team2Towers,SG.Team1RiftHeralds,SG.Team2RiftHeralds,SG.Team1VoidGrubs,SG.Team2VoidGrubs,SG.Team1Kills,SG.Team2Kills,SG.Team1Gold,SG.Team2Gold,SG.Patch,SG.N_GameInMatch,T.League=League',
      where,
    });
    const players = await cargo({
      tables: 'ScoreboardPlayers=SP,Tournaments=T',
      join_on: 'SP.OverviewPage=T.OverviewPage',
      fields: 'SP.GameId,SP.Link,SP.Name,SP.Champion,SP.Kills,SP.Deaths,SP.Assists,SP.CS,SP.Gold,SP.DamageToChampions,SP.VisionScore,SP.PlayerWin,SP.Role,SP.Team,SP.Side,SP.TeamKills,SP.TeamGold,SP.Items,SP.SummonerSpells,SP.KeystoneRune',
      where: `T.League IN (${sqlList(g.lp)}) AND SP.DateTime_UTC>='${SEASON_START}'`,
    });
    save(file, { games, players });
    console.log(`  ${g.id}: ${games.length} games, ${players.length} player rows`);
  }
}
console.log('Done.');
