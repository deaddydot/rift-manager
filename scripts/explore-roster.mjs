import { cargo } from './lib/leaguepedia.mjs';
const tp = await cargo({ tables: 'TournamentPlayers', fields: 'Team,Link,Role,Flag,N_PlayerInTeam,OverviewPage', where: "OverviewPage='LCK/2026 Season/Rounds 3-4'", limit: 500 });
console.log(tp.length); console.log(tp.slice(0, 14));
const pl = await cargo({ tables: 'Players', fields: 'ID,OverviewPage,Player,Image,Name,NativeName,Country,Nationality,Birthdate,Team,Role,FavChamps,IsRetired,IsSubstitute,Residency', where: "OverviewPage IN ('Faker','Chovy','Canyon','Gumayusi')" });
console.log(pl);
const tm = await cargo({ tables: 'Teams', fields: 'Name,OverviewPage,Short,Location,TeamLocation,Region,Image,IsDisbanded,RenamedTo', where: "Name IN ('T1','Gen.G','Hanwha Life Esports')" });
console.log(tm);
