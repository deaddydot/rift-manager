import { cargo } from './lib/leaguepedia.mjs';
const rows = await cargo({
  tables: 'Tournaments',
  fields: 'Name,OverviewPage,League,Region,DateStart,Date,TournamentLevel,IsQualifier,IsPlayoffs,Split',
  where: "DateStart>='2026-01-01' AND (TournamentLevel='Primary' OR League IN ('LCK Challengers League','LPL Development League','North American Challengers League','EMEA Masters','La Ligue Française','Prime League 1st Division','Liga Portuguesa','LVP SuperLiga','Arabian League','Hellenic Legends League','NLC','Esports World Cup','Circuito Desafiante'))",
  order_by: 'DateStart',
});
for (const t of rows) console.log(t.DateStart, t.Date, '|', t.TournamentLevel, '|', t.Name, '|', t.League, '|', t.OverviewPage);
