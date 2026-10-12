// Leagues included in the game, mapped to their Leaguepedia "League" names.
// tier: 1 = major region, 2 = national / challenger league, 3 = amateur / academy
export const LEAGUES = [
  { id: 'LCK', name: 'LCK', fullName: 'LoL Champions Korea', lp: ['LoL Champions Korea'], tier: 1, region: 'KR', country: 'South Korea', franchised: true },
  { id: 'LPL', name: 'LPL', fullName: 'Tencent LoL Pro League', lp: ['Tencent LoL Pro League'], tier: 1, region: 'CN', country: 'China', franchised: true },
  { id: 'LEC', name: 'LEC', fullName: 'LoL EMEA Championship', lp: ['LoL EMEA Championship'], tier: 1, region: 'EMEA', country: 'Europe', franchised: true },
  { id: 'LCS', name: 'LCS', fullName: 'League of Legends Championship Series', lp: ['League of Legends Championship Series'], tier: 1, region: 'NA', country: 'North America', franchised: false },
  { id: 'LCP', name: 'LCP', fullName: 'League of Legends Championship Pacific', lp: ['League of Legends Championship Pacific'], tier: 1, region: 'APAC', country: 'Asia Pacific', franchised: false },
  { id: 'CBLOL', name: 'CBLOL', fullName: 'Circuit Brazilian League of Legends', lp: ['Circuit Brazilian League of Legends'], tier: 1, region: 'BR', country: 'Brazil', franchised: false },

  { id: 'LCKCL', name: 'LCK CL', fullName: 'LCK Challengers League', lp: ['LCK Challengers League'], tier: 2, region: 'KR', country: 'South Korea', parent: 'LCK' },
  { id: 'NACL', name: 'NACL', fullName: 'North American Challengers League', lp: ['North American Challengers League'], tier: 2, region: 'NA', country: 'North America', parent: 'LCS' },
  { id: 'CD', name: 'CD', fullName: 'Circuito Desafiante', lp: ['Circuito Desafiante'], tier: 2, region: 'BR', country: 'Brazil', parent: 'CBLOL' },
  { id: 'LJL', name: 'LJL', fullName: 'LoL Japan League', lp: ['LoL Japan League'], tier: 2, region: 'APAC', country: 'Japan', parent: 'LCP' },
  { id: 'VCS', name: 'VCS', fullName: 'Vietnam Championship Series', lp: ['Vietnam Championship Series'], tier: 2, region: 'APAC', country: 'Vietnam', parent: 'LCP' },
  { id: 'PCS', name: 'PCS', fullName: 'Pacific Championship Series', lp: ['Pacific Championship Series'], tier: 2, region: 'APAC', country: 'Taiwan / SEA', parent: 'LCP' },
  { id: 'LFL', name: 'LFL', fullName: 'La Ligue Française', lp: ['La Ligue Française'], tier: 2, region: 'EMEA', country: 'France', parent: 'LEC' },
  { id: 'PRM', name: 'Prime League', fullName: 'Prime League Pro Division', lp: ['Prime League Pro Division'], tier: 2, region: 'EMEA', country: 'Germany', parent: 'LEC' },
  { id: 'LES', name: 'LES', fullName: 'Liga Española de League of Legends', lp: ['Liga Española de League of Legends'], tier: 2, region: 'EMEA', country: 'Spain', parent: 'LEC' },
  { id: 'TCL', name: 'TCL', fullName: 'Turkish Championship League', lp: ['Turkish Championship League'], tier: 2, region: 'EMEA', country: 'Turkey', parent: 'LEC' },
  { id: 'NLC', name: 'NLC', fullName: 'Northern League of Legends Championship', lp: ['Northern League of Legends Championship'], tier: 2, region: 'EMEA', country: 'UK / Nordics', parent: 'LEC' },
  { id: 'RL', name: 'Rift Legends', fullName: 'Rift Legends', lp: ['Rift Legends'], tier: 2, region: 'EMEA', country: 'Poland / CEE', parent: 'LEC' },
  { id: 'LIT', name: 'LIT', fullName: 'LoL Italian Tournament', lp: ['LIT'], tier: 2, region: 'EMEA', country: 'Italy', parent: 'LEC' },
  { id: 'ROL', name: 'Road of Legends', fullName: 'Road Of Legends', lp: ['TransIP Road Of Legends'], tier: 2, region: 'EMEA', country: 'Benelux', parent: 'LEC' },
  { id: 'HLL', name: 'HLL', fullName: 'Hellenic Legends League', lp: ['Hellenic Legends League'], tier: 2, region: 'EMEA', country: 'Greece / Cyprus', parent: 'LEC' },
  { id: 'EBL', name: 'EBL', fullName: 'Esports Balkan League', lp: ['Esports Balkan League'], tier: 2, region: 'EMEA', country: 'Balkans', parent: 'LEC' },
  { id: 'HM', name: 'Hitpoint Masters', fullName: 'Hitpoint Masters', lp: ['Hitpoint Masters'], tier: 2, region: 'EMEA', country: 'Czechia / Slovakia', parent: 'LEC' },
  { id: 'LPLOL', name: 'LPLOL', fullName: 'Liga Portuguesa', lp: ['Liga Portuguesa'], tier: 2, region: 'EMEA', country: 'Portugal', parent: 'LEC' },
  { id: 'AL', name: 'Arabian League', fullName: 'Arabian League', lp: ['Arabian League'], tier: 2, region: 'EMEA', country: 'MENA', parent: 'LEC' },

  { id: 'LCKAS', name: 'LCK AS', fullName: 'LCK Academy Series', lp: ['LCK Academy Series'], tier: 3, region: 'KR', country: 'South Korea', parent: 'LCKCL' },
  { id: 'PRM1', name: 'Prime 1st Div', fullName: 'Prime League 1st Division', lp: ['Prime League 1st Division'], tier: 3, region: 'EMEA', country: 'Germany', parent: 'PRM' },
  { id: 'HCC', name: 'Hellenic CC', fullName: 'Hellenic Challengers Cup', lp: ['Hellenic Challengers Cup'], tier: 3, region: 'EMEA', country: 'Greece', parent: 'HLL' },
  { id: 'AL2', name: 'Arabian L. Div 2', fullName: 'Arabian League 2nd Division', lp: ['Arabian League 2nd Division'], tier: 3, region: 'EMEA', country: 'MENA', parent: 'AL' },
  { id: 'HC', name: 'Hitpoint Chall.', fullName: 'Hitpoint Challengers', lp: ['Hitpoint Challengers'], tier: 3, region: 'EMEA', country: 'Czechia / Slovakia', parent: 'HM' },
  { id: 'NEXUS', name: 'Nexus League', fullName: 'Nexus League', lp: ['Nexus League'], tier: 3, region: 'EMEA', country: 'UK / Ireland', parent: 'NLC' },
  { id: 'BAS', name: 'Benelux Ascend', fullName: 'Benelux Ascend Series', lp: ['Benelux Ascend Series'], tier: 3, region: 'EMEA', country: 'Benelux', parent: 'ROL' },
  { id: 'LRN', name: 'Liga Regional Norte', fullName: 'Liga Regional Norte', lp: ['Liga Regional Norte'], tier: 3, region: 'NA', country: 'Latin America North', parent: 'NACL' },
  { id: 'LRS', name: 'Liga Regional Sur', fullName: 'Liga Regional Sur', lp: ['Liga Regional Sur'], tier: 3, region: 'BR', country: 'Latin America South', parent: 'CD' },
];

// International events whose 2026 games we also pull (for match history & champion meta)
export const INTERNATIONAL_LEAGUES = ['First Stand', 'Mid-Season Invitational', 'Esports World Cup', 'World Championship', 'KeSPA Cup', 'EMEA Masters'];
