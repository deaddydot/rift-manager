// "Fan buzz" panel for the player page: how the fans see him (perception label), anomalies they noticed
// (overnight rating jumps, editor tweaks, possessed / slump runs…), form vs rating, and recent posts about him.
import { useGame, nav } from '../../store/game';
import { perception, playerPosts, formOf, days } from '../../engine/management/buzzCore';
import { Panel, Pill, Sparkline, fmtDate } from './kit';
import { PostCard, SENTIMENT_COLOR } from './FanPulseWidget';

const BADGE: Record<string, (d: Record<string, string | number>, edited?: boolean) => [string, string]> = {
  jump: (d, e) => [`Rated ${d.old} → ${d.ovr} overnight${e ? ' (edited)' : ''}`, '#e879f9'],
  drop: (d, e) => [`Rated ${d.old} → ${d.ovr} overnight${e ? ' (edited)' : ''}`, '#ef4444'],
  possessed: (d) => [`Possessed: ${d.mvps} MVPs, ${d.kda} KDA in ${d.games} games`, '#f0c674'],
  slump: (d) => [`Slump: ${d.kda} KDA in ${d.games} games`, '#f97316'],
  glow_up: (d) => [`+${d.delta} over ${d.weeks} weeks of training`, '#84cc16'],
  slow_decline: (d) => [`−${d.delta} over ${d.weeks} weeks`, '#94a3b8'],
  renamed: (d) => [`Formerly known as ${d.oldname}`, '#38bdf8'],
  teleport: (d) => [`Arrived from ${d.from} without a transfer`, '#38bdf8'],
  mystery: () => ['No record anywhere before joining', '#38bdf8'],
};

export default function PlayerBuzz({ playerId, className = '' }: { playerId: string; className?: string }) {
  const state = useGame();
  const p = state.players[playerId];
  if (!p) return null;
  const per = perception(state, playerId);
  const posts = playerPosts(state, playerId, 6);
  const month = posts.filter((x) => days(x.date, state.date) <= 30);
  const pos = month.filter((x) => x.sentiment > 0).length, neg = month.filter((x) => x.sentiment < 0).length;
  const events = (state.fanPulse?.buzz?.events ?? []).filter((e) => e.playerId === playerId && BADGE[e.kind]).slice(0, 4);
  const form = state.fanPulse?.buzz?.form[playerId] ?? [];
  const f6 = formOf(state, playerId, 6);
  return (
    <Panel title="Fan buzz" className={className} right={<Pill color={per.color}>{per.label}</Pill>}>
      <div className="flex gap-5">
        <div className="w-60 shrink-0 space-y-3">
          <div>
            <div className="font-display text-2xl font-bold leading-tight" style={{ color: per.color }}>{per.label}</div>
            <div className="text-xs text-muted mt-1 leading-snug">{per.why}</div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-muted mb-1"><span>Posts this month</span><span className="text-text font-semibold">{month.length}</span></div>
            <div className="h-1.5 rounded bg-[#0a1120] flex overflow-hidden">
              {month.length > 0 && <div style={{ width: `${(pos / month.length) * 100}%`, background: SENTIMENT_COLOR[2] }} />}
              {month.length > 0 && <div style={{ width: `${((month.length - pos - neg) / month.length) * 100}%`, background: SENTIMENT_COLOR[0] }} />}
              {month.length > 0 && <div style={{ width: `${(neg / month.length) * 100}%`, background: SENTIMENT_COLOR[-2] }} />}
            </div>
            <div className="flex justify-between text-[10px] text-dim mt-0.5"><span>{pos} positive</span><span>{neg} critical</span></div>
          </div>
          {form.length >= 2 && (
            <div>
              <div className="flex justify-between text-[11px] text-muted mb-1" title="Each game's performance score minus what his rating predicts against that opponent">
                <span>Form vs rating</span><span className={f6.res >= 0 ? 'text-win' : 'text-loss'}>{f6.res >= 0 ? '+' : ''}{f6.res.toFixed(1)}</span>
              </div>
              <Sparkline data={form.map((x) => x[0])} width={236} height={34} zero color={f6.res >= 0 ? '#22c55e' : '#f97316'} />
            </div>
          )}
          {events.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted font-bold">What the fans noticed</div>
              {events.map((e) => {
                const [text, color] = BADGE[e.kind](e.data ?? {}, e.edited);
                return <div key={e.id} className="text-[11px] flex gap-1.5"><span style={{ color }}>●</span><span className="text-text/90">{text}</span><span className="text-dim ml-auto shrink-0">{fmtDate(e.date, { month: 'short', day: 'numeric' })}</span></div>;
              })}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 divide-y divide-[#141e33]">
          {posts.length ? posts.map((x) => <PostCard key={x.id} state={state} p={x} compactMode />)
            : <div className="text-sm text-muted py-2">Nobody’s talking about {p.handle} yet.</div>}
          {posts.length > 0 && <div className="pt-2"><button className="btn btn-ghost text-xs" onClick={() => nav('fans')}>Open the Fan Pulse feed →</button></div>}
        </div>
      </div>
    </Panel>
  );
}
