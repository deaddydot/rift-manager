# Rift Manager — a League of Legends esports manager

A Football-Manager-style esports management game for League of Legends that runs entirely in the browser.
You take over any of 308 real teams across 34 leagues (LCK, LPL, LEC, LCS, LCP, CBLOL, tier-2 ERLs / Challengers
leagues and tier-3 academies), with real 2026 rosters, stats and match history, and play through the real 2026
competitive calendar — and beyond.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static production build in dist/ (open with any static file server)
```

Saves are stored in your browser (IndexedDB, gzip-compressed) and can be exported/imported as `.lolsave` files.

## What's in the game

- **173 champions** with real base stats, growth, and Q/W/E/R kits (damage values, ratios, cooldowns, ranges, CC
  types/durations, shields, heals, dashes) from Riot Data Dragon (patch 16.20) and Meraki Analytics, plus a
  hand-authored pro-play gameplay profile per champion (power curve, laning, waveclear, engage, peel, splitpush,
  objective control, jungle clear/gank, blind-pick safety…).
- **1,636 real players** (+ coaches) from Leaguepedia with portraits, bios, champion pools built from their 2026
  picks, real 2026 stats and match history. Attributes are derived from 2026 performance (team Elo over ~10,000
  games + per-role stat z-scores) and curated for well-known players. Every player also has **hidden attributes**
  (end-game far-sight, mistake-proneness, composure, snowball/resilience, potential, work ethic, ego, loyalty…)
  and **traits** (Game Ender, Ice Veins, Throw Merchant, Coinflip, Lane Kingdom, Objective Thief, Weakside Hero…)
  that change how they play in matches.
- **Ratings run 0–200** (`src/engine/ratings.ts`): the best players of 2026 sit around 90, tier-2 regulars around 45–60,
  and 100+ (Elite, Legendary 125+, Mythic 150+, Immortal 180+) is beyond anyone playing today. Potentials are on the
  same scale — young tier-1 stars typically have ceilings of 130–170, the rare prodigy 200, and lower-league kids
  enough room to climb leagues (`src/engine/management/potential.ts`). Growth comes from training (room to the
  ceiling, age, work ethic, and a club's coaching × training facility, which roughly doubles from a bare-bones club
  to an elite one) and from official games — wins on big stages most — and winners who reach their ceiling can push
  it higher (`src/engine/management/development.ts`). The match engine is tuned on 1–100: above that, each point is
  worth a little less (`simRating`: 120 → 116.5, 150 → 132, 200 → 143), and wages follow a player's standing in the
  market rather than the raw number.
- **Top-down match simulator** (`src/engine/sim`): a tick-based Summoner's Rift with real tower/camp/pit
  positions, A* pathing on the real walkability map, minion waves with wave management (push / slow push / freeze),
  lane priority and roams, jungle pathing and ganks, vision & wards (map control after towers fall), trades and
  all-ins, teamfights with real ability damage, CC and summoners, Voidgrubs/Herald/elemental drakes & souls/Elder/
  Baron (2026 rules: no Atakhan, Feats removed), turret plates, lane swaps, Baron power plays, backdoors,
  composition power windows, and player mistakes. Watch it live with speed controls and in-game shouts, or simulate.
- **Pro draft** with Fearless and an AI drafter that weighs player comfort, real 2026 pro meta and comp balance.
- **The real 2026 calendar**: LCK Cup → Rounds → Road to MSI → Playoffs, LPL/LEC/LCS/LCP/CBLOL splits, First
  Stand (São Paulo), MSI (Daejeon), Esports World Cup (Paris), KeSPA Cup, EMEA Masters, Worlds (Play-In, Swiss,
  Knockouts, NYC final), LCS/CBLOL/LCP promotion tournaments; following seasons repeat the format.
- **Management**: finances (salaries, sponsorships, merchandise, streaming/content, league revenue share, prize
  money), parody-brand sponsors that approach every few weeks with bonus clauses, merchandise production & pricing, six facilities (gaming house, training
  facility, analytics lab, content studio, wellness, academy), staff market, training plans & individual focus,
  player development & aging, contracts/renewals/releases, transfer windows with AI teams buying and selling,
  scouting that reveals hidden attributes, solo-queue prospects each offseason, a batch of fictional free agents
  (rookies, journeymen, ex-pro veterans, rare gems) in every region whenever a transfer window opens, franchise slot sales, board
  objectives, fans/hype/prestige (a die-hard core that sticks around win or lose — built by club history, long-serving,
  charismatic or streaming players and local heroes — and casual fans who follow results), AI clubs that renew sponsors,
  restock merch and reinvest surpluses in facilities, inbox & news.
- **Paths up the pyramid** for tier-2/3 clubs (`src/engine/management/ascension.ts`, `franchise.ts`; the Boardroom's
  "Path up the pyramid" panel shows them): promotion series (tier-3 champions vs the last-placed tier-2 club; tier-2
  champions vs the last LCS/LCP/CBLOL club), league spots that struggling clubs sell every offseason — franchised
  LCK/LPL/LEC partnerships, open tier-1 and tier-2 spots — with die-hard fans crowdfunding part of the price, and
  **big-chance brand backing**: a club that dominates its league may be approached by a global brand offering a
  naming-rights deal ("Monstar Wolves" / "Wolves Monstar") that funds most of a buyout of a spot in the league above.
  AI clubs climb the same ways; brands walk away (and names revert) if a club is relegated.
- **Editor**: create custom players, teams and staff (portraits/logos uploaded from your computer), edit anyone
  (including coaches, analysts and other staff), and keep a reusable custom library.

## Data pipeline (optional — data is already in `public/`)

```bash
node scripts/build-champions.mjs   # Data Dragon + Meraki → public/data/champions.json (+ icons)
node scripts/build-items.mjs       # items.json (+ icons)
node scripts/build-map.mjs         # stylised rift.webp + navgrid.json from the minimap walkability layer
node scripts/apply-builds.mjs      # per-champion op.gg builds (scripts/data/opgg-builds.json) → champions.json
node scripts/fetch-esports.mjs     # Leaguepedia (Special:CargoExport) → data-raw/esports/*.json (cached)
node scripts/fetch-golgg.mjs       # gol.gg 2024-2025 tournament player stats → data-raw/esports/golgg_history.json (cached)
node scripts/build-players.mjs     # ratings (2026 + career history), champion pools → public/data/{players,teams,staff,...}.json
npx tsx scripts/sim-test.ts 50     # simulator calibration harness (MIRROR=1 for skill tests)
npx tsx scripts/season-test.ts     # headless full-season run
```

Player, staff and caster portraits and team logos are loaded from Leaguepedia's image CDN at runtime (a few
portraits from Liquipedia); a generated avatar/badge is shown when an image is unavailable. To look up photos for
anyone still missing one:

```bash
node scripts/fetch-portraits.mjs               # Leaguepedia wiki API (page images), politely paced, cached
node scripts/fetch-portraits-liquipedia.mjs    # Liquipedia API (≤1 req/2s), only when the real name matches
```

## Hosting it online

The game is a static site (no server), so any static host works. The **online build** is the same game
without the player / team / staff Editor and without the in-browser AI chat (the stream chat uses its
built-in lines):

```bash
npm run build:hosted   # → dist/ (about 16 MB)
npx vite preview       # check it locally
```

**GitHub Pages** (free): push this folder to a GitHub repository, then in the repository open
Settings → Pages and set Source to "GitHub Actions". The workflow in `.github/workflows/deploy-pages.yml`
builds the online version and publishes it on every push to `main`, at
`https://<your-user>.github.io/<repo-name>/`. The app uses relative paths and hash URLs, so it works from a
sub-folder without extra configuration.

**Your own website**: upload the contents of `dist/` to any folder on your web host.

Saves live in each visitor's browser (IndexedDB), so nothing is shared between players and no backend is
needed. `npm run build` still produces the full version with the Editor and the optional AI chat.

## Credits

Fan-made and non-commercial. Rosters, stats, match history and images: [Leaguepedia](https://lol.fandom.com)
(CC BY-SA 3.0); a few portraits: [Liquipedia](https://liquipedia.net/leagueoflegends) (CC BY-SA 3.0). 2024-2025 career stats: [gol.gg](https://gol.gg). Item builds: [op.gg](https://op.gg). Champion & item data: Riot Games Data Dragon, [Meraki Analytics](https://github.com/meraki-analytics/lolstaticdata),
CommunityDragon. League of Legends is a trademark of Riot Games, Inc.; this project is not endorsed by Riot Games.
