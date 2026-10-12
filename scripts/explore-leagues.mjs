import { cargo } from './lib/leaguepedia.mjs';
const rows = await cargo({
  tables: 'ScoreboardGames=SG,Tournaments=T',
  join_on: 'SG.OverviewPage=T.OverviewPage',
  fields: 'T.League=League,T.Region=Region,T.TournamentLevel=Level,COUNT(*)=Games',
  where: "SG.DateTime_UTC>='2026-01-01'",
  group_by: 'T.League,T.Region,T.TournamentLevel',
  order_by: 'Games DESC',
});
for (const t of rows) console.log(t.Games.padStart(5), '|', t.Level, '|', t.Region, '|', t.League);
