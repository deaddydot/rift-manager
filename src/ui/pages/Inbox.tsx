import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame, useStore, nav } from '../../store/game';
import type { InboxMessage, GameState } from '../../engine/types';
import { ROLE_LABEL } from '../../engine/types';
import { Empty, Pill, Portrait, TeamLogo, Rating, RoleIcon, money, fmtDate, ageOf } from '../components/kit';
import { sponsorSlots } from '../../engine/management/sponsors';
import { askingFee, playerOvr } from '../../engine/management/transfers';
import { activeSponsors, acceptSponsorOffer, declineSponsorOffer, respondIncomingOffer, bonusText } from '../../engine/management/offerActions';
import { sales, userPrice } from '../../engine/management/franchise';
import { offerLive, offerById, acceptAscension, declineAscension, buySpot } from '../../engine/management/ascension';
import { ownerRequestLive } from '../../engine/management/owner';
import { OwnerChoiceBox } from '../components/FanPulseWidget';
import { PlayerChoiceBox } from '../components/PlayerTalk';
import { playerRequestLive } from '../../engine/management/people';
import { StanceBox } from '../components/BidStance';

const KIND: Record<InboxMessage['kind'], { label: string; color: string }> = {
  info: { label: 'Info', color: '#8a97b3' },
  board: { label: 'Board', color: '#f0c674' },
  sponsor: { label: 'Sponsor', color: '#f472b6' },
  transfer: { label: 'Transfer', color: '#38bdf8' },
  player: { label: 'Player', color: '#4ade80' },
  match: { label: 'Match', color: '#f87171' },
  finance: { label: 'Finance', color: '#facc15' },
  media: { label: 'Media', color: '#a78bfa' },
};
const kindOf = (k: string) => KIND[k as InboxMessage['kind']] ?? { label: k, color: '#8a97b3' };
/** An action is open while not handled and its underlying offer still exists / is pending. */
function actionLive(state: GameState, m: InboxMessage) {
  const a = m.action;
  if (!a || a.done) return false;
  if (a.type === 'sponsorOffer') return state.sponsorOffers.some((o) => o.id === a.payload);
  if (a.type === 'incomingOffer') {
    const o = state.transferOffers.find((x) => x.id === a.payload);
    return !!o && o.status === 'pending' && state.players[o.playerId]?.teamId === state.userTeamId;
  }
  if (a.type === 'franchiseOffer') { const sale = sales(state).find((x) => x.id === a.payload); return !!sale && sale.status === 'open' && sale.expires >= state.date; }
  if (a.type === 'ascensionOffer') return offerLive(state, offerById(state, String(a.payload)));
  if (a.type === 'openPlayer') return !!state.players[String(a.payload)]?.contract && state.players[String(a.payload)].teamId === state.userTeamId;
  if (a.type === 'ownerChoice') return ownerRequestLive(state, String(a.payload));
  if (a.type === 'playerChoice') return playerRequestLive(state, String(a.payload));
  return true;
}
type Filter = 'all' | 'unread' | 'action' | InboxMessage['kind'];

export default function Inbox(_props: { id?: string; tab?: string; kind?: string; targetId?: string }) {
  const state = useGame();
  const v = useStore((s) => s.v);
  const bump = useStore((s) => s.bump);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(() => (state.inbox.find((m) => !m.read && actionLive(state, m)) ?? state.inbox.find((m) => !m.read) ?? state.inbox[0])?.id ?? null);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return state.inbox.filter((m) =>
      (filter === 'all' || (filter === 'unread' ? !m.read : filter === 'action' ? actionLive(state, m) : m.kind === filter)) &&
      (!qq || m.subject.toLowerCase().includes(qq) || m.from.toLowerCase().includes(qq) || m.body.toLowerCase().includes(qq)));
  }, [state.inbox, v, filter, q]);
  const unread = state.inbox.filter((m) => !m.read).length;
  const actions = state.inbox.filter((m) => actionLive(state, m)).length;
  const kinds = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of state.inbox) c[m.kind] = (c[m.kind] ?? 0) + 1;
    return c;
  }, [state.inbox, v]);
  const msg = state.inbox.find((m) => m.id === sel) ?? null;

  // mark as read when opened
  useEffect(() => {
    if (msg && !msg.read) { msg.read = true; bump(); }
  }, [msg?.id]);

  const markAll = () => { for (const m of state.inbox) m.read = true; bump(); };
  const remove = (id: string) => {
    const idx = list.findIndex((m) => m.id === id);
    state.inbox = state.inbox.filter((m) => m.id !== id);
    const next = list[idx + 1] ?? list[idx - 1];
    setSel(next && next.id !== id ? next.id : null);
    bump();
  };
  const removeRead = () => {
    state.inbox = state.inbox.filter((m) => !m.read || actionLive(state, m));
    if (sel && !state.inbox.some((m) => m.id === sel)) setSel(state.inbox[0]?.id ?? null);
    bump();
  };

  return (
    <div className="panel overflow-hidden grid grid-cols-[minmax(260px,min(400px,36%))_1fr] h-[calc(100vh-7.5rem)] min-h-[520px]">
      {/* list pane */}
      <div className="flex flex-col border-r hairline min-h-0 min-w-0">
        <div className="px-3 pt-3 pb-2 border-b hairline space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold gold-text leading-none">Inbox</h1>
            <div className="flex gap-1">
              <button className="btn btn-ghost py-1 px-2 text-xs" disabled={!unread} onClick={markAll}>Mark all read</button>
              <button className="btn btn-ghost py-1 px-2 text-xs" title="Delete read messages without pending actions" onClick={removeRead}>Clear read</button>
            </div>
          </div>
          <input className="input w-full py-1.5 text-xs" placeholder="Search messages…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex gap-1 flex-wrap">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All <span className="text-dim">{state.inbox.length}</span></FilterChip>
            <FilterChip active={filter === 'unread'} onClick={() => setFilter('unread')}>Unread <span className="text-dim">{unread}</span></FilterChip>
            <FilterChip active={filter === 'action'} onClick={() => setFilter('action')} color={actions ? '#f0c674' : undefined}>Action <span className="text-dim">{actions}</span></FilterChip>
            {Object.entries(kinds).map(([k, n]) => (
              <FilterChip key={k} active={filter === k} onClick={() => setFilter(k as Filter)} color={kindOf(k).color}>{kindOf(k).label} <span className="text-dim">{n}</span></FilterChip>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? <Empty>No messages.</Empty> : list.map((m) => {
            const k = kindOf(m.kind);
            const active = m.id === sel;
            return (
              <button key={m.id} onClick={() => setSel(m.id)} className={`w-full text-left px-3 py-2.5 border-b border-[#141e33] flex gap-2.5 transition ${active ? 'bg-[#16213a]' : 'hover:bg-[#111a2e]'}`} style={{ boxShadow: active ? `inset 3px 0 0 ${k.color}` : undefined }}>
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${m.read ? 'opacity-0' : ''}`} style={{ background: '#f0c674' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-sm flex-1 ${m.read ? 'text-muted' : 'text-text font-bold'}`}>{m.from}</span>
                    <span className="text-[11px] text-dim shrink-0">{fmtDate(m.date, { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className={`truncate text-[13px] ${m.read ? 'text-muted' : 'text-gold2 font-semibold'}`}>{m.subject}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="chip py-0 text-[10px]" style={{ color: k.color, borderColor: k.color + '55', background: k.color + '14' }}>{k.label}</span>
                    {m.action && (m.action.done ? <span className="text-[10px] text-dim">✓ handled</span> : actionLive(state, m) ? <span className="text-[10px] font-semibold text-gold">● {m.action.label}</span> : <span className="text-[10px] text-dim">expired</span>)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* reading pane */}
      <div className="flex flex-col min-h-0 min-w-0">
        {!msg ? <div className="flex-1 flex items-center justify-center"><Empty>Select a message to read it.</Empty></div> : (
          <>
            <div className="px-6 pt-5 pb-4 border-b hairline">
              <div className="flex items-start gap-4">
                <SenderBadge name={msg.from} color={kindOf(msg.kind).color} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Pill color={kindOf(msg.kind).color}>{kindOf(msg.kind).label}</Pill>
                    {msg.action && (msg.action.done ? <Pill color="#4ade80">✓ Handled</Pill> : actionLive(state, msg) ? <Pill color="#f0c674">Action required</Pill> : <Pill color="#8a97b3">Expired</Pill>)}
                  </div>
                  <h2 className="font-display text-2xl font-bold leading-tight">{msg.subject}</h2>
                  <div className="text-sm text-muted mt-0.5">From <span className="text-text">{msg.from}</span> · {fmtDate(msg.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                  <button className="btn btn-ghost py-1 text-xs" onClick={() => { msg.read = false; bump(); setSel(null); }}>Mark unread</button>
                  <button className="btn btn-danger py-1 text-xs" onClick={() => remove(msg.id)}>Delete</button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="text-[15px] leading-relaxed whitespace-pre-line text-text/90 max-w-3xl">{msg.body}</div>
              {msg.action && <div className="mt-6 max-w-3xl"><ActionBox state={state} m={msg} /></div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`chip px-2 py-0.5 text-[11px] ${active ? 'border-gold text-gold2' : 'text-muted hover:text-text'}`} style={!active && color ? { color } : undefined}>{children}</button>
  );
}

function SenderBadge({ name, color, size = 48 }: { name: string; color: string; size?: number }) {
  const initials = name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <div className="rounded-xl shrink-0 flex items-center justify-center font-display font-bold" style={{ width: size, height: size, fontSize: size * 0.36, color, background: `linear-gradient(150deg, ${color}2e, ${color}0a)`, boxShadow: `inset 0 0 0 1px ${color}55` }}>{initials}</div>
  );
}

// ------------------------------------------------------------------ actions
function ActionBox({ state, m }: { state: GameState; m: InboxMessage }) {
  const a = m.action!;
  if (a.type === 'sponsorOffer') return <SponsorAction state={state} m={m} />;
  if (a.type === 'incomingOffer') return <BidAction state={state} m={m} />;
  if (a.type === 'franchiseOffer') return <FranchiseAction state={state} m={m} />;
  if (a.type === 'ascensionOffer') return <AscensionAction state={state} m={m} />;
  if (a.type === 'ownerChoice') return <OwnerChoiceBox state={state} reqId={String(a.payload)} />;
  if (a.type === 'playerChoice') return <PlayerChoiceBox state={state} reqId={String(a.payload)} />;
  if (a.type === 'openPlayer') return (
    <Shell title="Contract renewal">
      <button className="btn btn-gold" onClick={() => nav('player', String(a.payload))}>Open {state.players[String(a.payload)]?.handle ?? 'player'}'s profile</button>
    </Shell>
  );
  return <GenericAction m={m} />;
}

function FranchiseAction({ state, m }: { state: GameState; m: InboxMessage }) {
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const sale = sales(state).find((x) => x.id === String(m.action!.payload));
  const team = state.teams[state.userTeamId];
  if (!sale) return <Shell title="League spot" done><div className="text-sm text-muted">This sale is no longer available.</div></Shell>;
  const seller = state.teams[sale.sellerId];
  const open = sale.status === 'open' && sale.expires >= state.date;
  const pay = userPrice(sale);
  const lname = state.leagues[sale.league]?.name ?? sale.league;
  return (
    <Shell title={`${lname} spot for sale`} done={!open}>
      <div className="flex items-center gap-4 mb-3">
        <TeamLogo team={seller} size={40} />
        <div className="text-sm">
          <div><b>{seller?.name}</b> sell their place in the {lname}</div>
          <div className="text-muted">Price {money(sale.price)}{sale.pledge ? <> · fans crowdfunded <span className="text-gold2">{money(sale.pledge)}</span> · you pay {money(pay)}</> : null} · your balance {money(team.balance)} · open until {fmtDate(sale.expires)}</div>
        </div>
      </div>
      {open ? (
        <button className="btn btn-gold" disabled={team.balance < pay} onClick={() => { const r = buySpot(state, sale.id); notify(r.message); if (r.ok) m.action!.done = true; bump(); }}>
          {team.balance < pay ? 'Not enough funds' : `Buy the spot for ${money(pay)}`}
        </button>
      ) : <div className="text-sm text-muted">{sale.status === 'sold' ? (sale.buyerId === team.id ? 'You own this slot — you join the league next season.' : 'Sold to another organisation.') : 'Offer expired.'}</div>}
    </Shell>
  );
}

function AscensionAction({ state, m }: { state: GameState; m: InboxMessage }) {
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const o = offerById(state, String(m.action!.payload));
  if (!o) return <Shell title="Big-chance partnership" done><div className="text-sm text-muted">This offer no longer exists.</div></Shell>;
  const team = state.teams[o.teamId];
  const seller = state.teams[o.sellerId];
  const live = offerLive(state, o);
  const target = state.leagues[o.targetLeague]?.name ?? o.targetLeague;
  const act = (style: 'title' | 'cobrand' | null) => {
    const r = style ? acceptAscension(state, o.id, style) : declineAscension(state, o.id);
    notify(r.message);
    if (r.ok) m.action!.done = true;
    bump();
  };
  return (
    <Shell title="Big-chance partnership" done={!live}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center font-display font-bold text-lg shrink-0" style={{ background: `linear-gradient(145deg, ${o.color}, ${o.color}99)`, color: '#0b0f19' }}>
          {o.brand.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{o.brand} <span className="text-xs text-muted font-normal">· {o.category}</span></div>
          <div className="text-xs text-muted">Because {team?.name ?? 'the club'} {o.reason}.</div>
        </div>
        <div className="flex items-center gap-2 text-right shrink-0">
          <div className="text-xs"><div className="text-dim">Buyout of</div><div className="font-semibold">{seller?.name ?? '—'}</div><div className="text-gold2 font-display font-bold">{money(o.price)}</div></div>
          <TeamLogo team={seller} size={36} />
        </div>
      </div>
      <div className="text-xs text-muted mb-3">Step up to the <b className="text-text">{target}</b> at the end of the season. If the club is relegated from the {target}, {o.brand} walk away and the name reverts.</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {o.options.map((x) => {
          const short = team && team.balance < x.teamPays;
          return (
            <div key={x.style} className="panel-flat p-3 flex flex-col gap-2" style={{ borderColor: x.style === 'title' ? `${o.color}88` : undefined }}>
              <div className="text-[10px] uppercase tracking-wider font-bold text-dim">{x.style === 'title' ? 'Title naming' : 'Co-branding'} · {x.seasons} seasons</div>
              <div className="font-display text-xl font-bold leading-tight" style={{ color: x.style === 'title' ? o.color : undefined }}>{x.name} <span className="text-xs text-muted font-normal">[{x.short}]</span></div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Fact label={`${o.brand} pay`} value={`${Math.round(x.fund * 100)}% · ${money(x.brandPays)}`} />
                <Fact label="You pay" value={money(x.teamPays)} warn={short} />
                <Fact label="Per month" value={money(x.monthly)} />
                <Fact label="Signing fee" value={money(x.signing)} />
              </div>
              {live && <button className={x.style === 'title' ? 'btn btn-gold mt-1' : 'btn mt-1'} disabled={short} onClick={() => act(x.style)}>{short ? `Need ${money(x.teamPays)}` : x.style === 'title' ? `Become ${x.name}` : `Sign as ${x.name}`}</button>}
            </div>
          );
        })}
      </div>
      {live ? (
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn" onClick={() => act(null)}>Decline — keep our name</button>
          <span className="text-xs text-muted ml-auto">Your balance {money(team?.balance ?? 0)} · offer open until {fmtDate(o.expires)}</span>
        </div>
      ) : (
        <div className="text-sm text-muted">{o.status === 'accepted' ? `Signed (${o.accepted === 'title' ? 'title naming' : 'co-branding'}). The move to the ${target} happens at season rollover.` : o.status === 'declined' ? 'You declined this offer.' : 'This offer has expired.'}</div>
      )}
    </Shell>
  );
}

function Shell({ title, children, done }: { title: string; children: ReactNode; done?: boolean }) {
  return (
    <div className={`panel-flat p-4 ${done ? '' : 'border-gold/40'}`}>
      <div className="text-[11px] uppercase tracking-wider font-bold text-gold2 mb-3">{title}</div>
      {children}
    </div>
  );
}

function SponsorAction({ state, m }: { state: GameState; m: InboxMessage }) {
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const team = state.teams[state.userTeamId];
  const id = String(m.action!.payload);
  const o = state.sponsorOffers.find((x) => x.id === id);
  const deal = team.sponsors.find((x) => x.id === id);
  const slots = sponsorSlots(team);
  const used = activeSponsors(state, team).length;

  if (!o) {
    return (
      <Shell title="Sponsorship offer" done>
        <div className="text-sm text-muted">
          {deal ? <>Accepted: <span className="text-text font-semibold">{deal.name}</span> pays {money(deal.monthly)}/month until {fmtDate(deal.endDate)}.</> : 'This offer has expired or was declined.'}
        </div>
        <button className="btn btn-ghost py-1 text-xs mt-2" onClick={() => nav('sponsors')}>Open Sponsors →</button>
      </Shell>
    );
  }
  const full = used >= slots;
  const act = (accept: boolean) => {
    const r = accept ? acceptSponsorOffer(state, o.id) : declineSponsorOffer(state, o.id);
    notify(r.message);
    bump();
  };
  return (
    <Shell title="Sponsorship offer">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center font-display font-bold text-lg" style={{ background: `linear-gradient(145deg, ${o.logoColor}, ${o.logoColor}99)`, color: '#0b0f19' }}>
          {o.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="font-semibold">{o.name}</div>
          <div className="text-xs text-muted">{o.category} · brand tier {o.tier} · “{o.pitch}”</div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold text-gold2 leading-none">{money(o.monthly)}</div>
          <div className="text-[11px] text-muted">per month</div>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3 text-xs mb-3">
        <Fact label="Length" value={`${o.months} months`} />
        <Fact label="Total value" value={money(o.monthly * o.months)} />
        <Fact label="Offer expires" value={fmtDate(o.expires)} />
        <Fact label="Sponsor slots" value={`${used} / ${slots}`} warn={full} />
      </div>
      {o.bonus && <div className="text-xs text-muted mb-3">Bonus clause: <span className="text-text">{bonusText(o.bonus)}</span> → <span className="text-gold2 font-semibold">+{money(o.bonus.amount)}</span></div>}
      {full && <div className="text-xs text-amber-300 mb-3">All sponsor slots are in use. Upgrade the Content Studio or wait for a deal to expire.</div>}
      <div className="flex gap-2 flex-wrap">
        <button className="btn btn-gold" disabled={full} onClick={() => act(true)}>Accept offer</button>
        <button className="btn" onClick={() => act(false)}>Decline</button>
        <button className="btn btn-ghost ml-auto" onClick={() => nav('sponsors')}>Compare on Sponsors page →</button>
      </div>
    </Shell>
  );
}

function BidAction({ state, m }: { state: GameState; m: InboxMessage }) {
  const bump = useStore((s) => s.bump);
  const notify = useStore((s) => s.notify);
  const [confirm, setConfirm] = useState(false);
  const id = String(m.action!.payload);
  const o = state.transferOffers.find((x) => x.id === id);
  if (!o) return <Shell title="Transfer bid" done><div className="text-sm text-muted">This bid no longer exists.</div></Shell>;
  const p = state.players[o.playerId];
  const user = state.teams[state.userTeamId];
  const buyer = state.teams[o.toTeamId];
  if (!p) return <Shell title="Transfer bid" done><div className="text-sm text-muted">Player not found.</div></Shell>;
  const pending = o.status === 'pending' && p.teamId === user.id;
  const ovr = Math.round(playerOvr(p));
  const asking = p.teamId === user.id ? askingFee(state, p, user) : 0;
  const ratio = asking ? o.fee / asking : 1;
  const starter = Object.values(user.lineup).includes(p.id);
  const act = (accept: boolean) => {
    const r = respondIncomingOffer(state, o.id, accept);
    notify(r.message);
    setConfirm(false);
    bump();
  };
  const statusColor = o.status === 'accepted' ? '#4ade80' : o.status === 'pending' ? '#f0c674' : '#8a97b3';
  return (
    <Shell title="Transfer bid" done={!pending}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <button className="flex items-center gap-3 text-left group" onClick={() => nav('player', p.id)}>
          <Portrait player={p} team={user} size={56} />
          <div className="min-w-0">
            <div className="font-display text-xl font-bold group-hover:text-gold2 leading-tight">{p.handle}</div>
            <div className="text-xs text-muted flex items-center gap-1"><RoleIcon role={p.role} size={13} /> {ROLE_LABEL[p.role]} · age {ageOf(p.birthdate, state.date) ?? '?'}{starter ? ' · starter' : ' · sub'}</div>
          </div>
          <Rating v={ovr} />
        </button>
        <div className="text-center">
          <div className="font-display text-2xl font-bold text-gold2">{money(o.fee)}</div>
          <div className="text-[11px] text-muted">→</div>
        </div>
        <button className="flex items-center gap-3 text-right group min-w-0" onClick={() => buyer && nav('team', buyer.id)}>
          <div className="min-w-0">
            <div className="font-semibold group-hover:text-gold2 truncate">{buyer?.name ?? 'Unknown'}</div>
            <div className="text-xs text-muted">{buyer ? state.leagues[buyer.leagueId]?.name : ''}</div>
          </div>
          <TeamLogo team={buyer} size={44} />
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3 text-xs mb-3">
        <Fact label="Bid" value={money(o.fee)} />
        <Fact label="Your valuation" value={asking ? money(asking) : '—'} />
        <Fact label="Market value" value={money(p.value)} />
        <Fact label="Contract" value={p.contract ? `${money(p.contract.salary)}/yr → ${p.contract.expires.slice(0, 4)}` : 'None'} />
        <Fact label="Bid expires" value={fmtDate(o.expires)} />
      </div>
      <StanceBox o={o} p={p} pending={pending} />
      {asking > 0 && pending && (
        <div className="text-xs mb-3" style={{ color: ratio >= 1 ? '#4ade80' : ratio >= 0.85 ? '#fbbf24' : '#f87171' }}>
          The bid is {Math.round(ratio * 100)}% of your valuation{ratio >= 1 ? ' — a strong offer.' : ratio >= 0.85 ? ' — close to fair value.' : ' — well below value.'}
          {starter && ' Selling a starter will hurt chemistry.'}
        </div>
      )}
      {pending ? (
        <div className="flex gap-2 items-center flex-wrap">
          {confirm ? (
            <>
              <span className="text-xs text-muted">Sell {p.handle} to {buyer?.short} for {money(o.fee)}?{o.stance && (o.stance.label === 'reluctant' || o.stance.label === 'refuses') ? ' He doesn’t want to go.' : ''}</span>
              <button className="btn btn-gold" onClick={() => act(true)}>Confirm sale</button>
              <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Back</button>
            </>
          ) : (
            <>
              <button className="btn btn-gold" onClick={() => setConfirm(true)}>Accept bid</button>
              <button className="btn" onClick={() => act(false)}>Reject</button>
              <button className="btn btn-ghost ml-auto" onClick={() => nav('transfers')}>Transfers →</button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <Pill color={statusColor}>{o.status === 'pending' ? 'No longer possible' : o.status[0].toUpperCase() + o.status.slice(1)}</Pill>
          <span className="text-muted text-xs">{o.status === 'accepted' ? `${p.handle} has joined ${buyer?.name}.` : o.status === 'withdrawn' ? 'The buyer withdrew the bid.' : o.status === 'rejected' ? o.message ?? 'You turned the bid down.' : 'The player is no longer at your club.'}</span>
        </div>
      )}
    </Shell>
  );
}

function GenericAction({ m }: { m: InboxMessage }) {
  const bump = useStore((s) => s.bump);
  const a = m.action!;
  return (
    <Shell title={a.label} done={a.done}>
      {a.done ? <div className="text-sm text-muted">Handled.</div> : (
        <button className="btn btn-gold" onClick={() => { a.done = true; bump(); }}>Mark as handled</button>
      )}
    </Shell>
  );
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-dim">{label}</div>
      <div className={`font-semibold ${warn ? 'text-amber-300' : 'text-text'}`}>{value}</div>
    </div>
  );
}
