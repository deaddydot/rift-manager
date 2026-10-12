// Inbox messages & news feed helpers.
import type { GameState, InboxMessage, NewsItem } from '../types';

export function addInbox(state: GameState, m: Omit<InboxMessage, 'id' | 'date' | 'read'> & { date?: string }) {
  state.inbox.unshift({ id: `msg_${state.seq++}`, date: m.date ?? state.date, read: false, ...m });
  if (state.inbox.length > 400) state.inbox.length = 400;
}

export function addNews(state: GameState, n: Omit<NewsItem, 'id' | 'date'> & { date?: string }) {
  state.news.unshift({ id: `news_${state.seq++}`, date: n.date ?? state.date, ...n });
  if (state.news.length > 600) state.news.length = 600;
}
