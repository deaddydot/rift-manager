// Small hand-written tables for the Vietnamese chat (chatVi.ts / chatMoments.ts), from the second Hoàng Luân stream
// study (data-raw/chat/hoangluan-notes.md): what Vietnamese viewers call champions ("cá sấu", Wukong as the Monkey
// King), jokes that come with them, puns on players' handles, the scaling champions chat counts out loud, the crowd
// chants heard through a stream, and the words a caster says that chat twists into a wave.
import type { Champion } from '../../engine/types';

/** Short nicknames ("-1 cá sấu", "cứu khỉ"). */
export const CHAMP_NICK: Record<string, string[]> = {
  Renekton: ['cá sấu'], MonkeyKing: ['khỉ', 'ngộ không'], Nasus: ['susan', 'chó'], Malphite: ['người đá'], Nidalee: ['mèo'],
  Volibear: ['gấu'], DrMundo: ['mundo'], Leblanc: ['lê blăng'], Maokai: ['cây'], Rammus: ['tê tê'], Twitch: ['chuột'],
  Warwick: ['sói'], Orianna: ['ori'], MissFortune: ['MF'], TwistedFate: ['TF'], JarvanIV: ['J4'], AurelionSol: ['rồng'],
  Ezreal: ['ez'], Caitlyn: ['cait'], Nocturne: ['noc'], KSante: ['sante'], Chogath: ['cho'], Kaisa: ['kai'], Galio: ['galio'],
  Blitzcrank: ['blitz'], TahmKench: ['cóc'], Yuumi: ['mèo'], Gnar: ['gnar'], Rengar: ['báo'], Nautilus: ['naut'],
};

/** Lore and meme lines a champion brings with it ({player} = who plays it, {short} = our team). */
export const CHAMP_LORE: Record<string, string[]> = {
  MonkeyKing: ['tề thiên đại thánh', 'đại náo thiên cung', 'lão tôn tới rồi', 'tôn ngộ không cứu lấy {team}', 'Black Myth Wukong :))', '{player} hoá đấu chiến thắng phật', 'nuôi khỉ thành công', 'tề thiên đại thánh đại náo thiên cung'],
  DrMundo: ['mundo bao cát di động', 'mundo bất tử', 'mundo đi đâu thì đi', 'mundo 1 tỷ máu', 'mundo càn quét'],
  Renekton: ['cá sấu cân 2 cân 3', 'đừng bắt cá sấu', 'cá sấu 1 tỷ máu', 'cá sấu chấp hết'],
  Nasus: ['susan tới chơi', 'susan xuống núi', 'con tuất', 'nasus bao cát'],
  Bard: ['phật bard', 'bard bóp', 'R bard hay á'],
  Orianna: ['ori trâu', 'ori bất tử'],
  Leblanc: ['lê blăng mượt đét', 'lê blăng ảo thuật'],
  LeeSin: ['sóng âm toàn trúng', 'insec', 'thần lee', 'lee múa ác'],
  Yasuo: ['hasagi', 'yasuo 0/10 power spike'],
  Teemo: ['nấm đâu', 'teemo là quỷ'],
  Malphite: ['người đá lăn vào', 'người đá ném 1 Q là về'],
  Nidalee: ['con mèo ăn thịt ghê quá', 'nida đi như đi chợ'],
  Ezreal: ['ez Q toàn hụt', 'ez đánh tay'],
  Caitlyn: ['cait bắn đến mai', 'cait 3 món'],
  Varus: ['varus xuống núi', 'varus 2 bùa'],
  Garen: ['DEMACIA!!!', 'quay quay quay'],
  Volibear: ['gấu điện', 'gấu lên đồ là ngon'],
  Jhin: ['viên thứ 4', 'số 4'],
  Draven: ['draven bắt rìu', 'rìu đâu'],
  Thresh: ['lồng đèn', 'kéo trúng'],
  Blitzcrank: ['kéo trúng', 'kéo là chết'],
  KSante: ['sante bật R như muỗi', 'sante như bố'],
  Zed: ['zed múa'],
  Qiyana: ['qiyana dame bựa'],
  Maokai: ['cây đi cướp rừng', 'maokai tập chơi à'],
  Rell: ['rell nổ não', 'rell bay vào'],
  Galio: ['galio bay vào'],
  Kaisa: ['kai sa hoàn hảo'],
  Shen: ['shen R bay về'],
  Sion: ['sion cày'],
  Viktor: ['viktor xanh là có hope'],
  Ashe: ['ashe R trúng là mở'],
  Akali: ['akali quấy rối'],
  Chogath: ['cắn đi cho', 'cho to dần'],
};

/** Puns Vietnamese viewers make on handles (otherwise chat stretches the name: "Raptorrrr"). */
const NAME_PUNS: Record<string, string[]> = {
  raptor: ['rap', 'rapper', 'rap god'], taeyoon: ['Tày yoon', 'tày dôn', 'tày giun'], kellin: ['keo lin', 'kelina'],
  monki: ['monkey', 'em khỉ'], karis: ['ka rít', 'con báo'], cube: ['cú bé', 'cứu bé'], about: ['about to die'],
  faker: ['quỷ vương', 'quỷ vương bất tử'], zeus: ['thần sấm'], viper: ['rắn'], elk: ['nai'], tarzan: ['người rừng'],
  knight: ['hiệp sĩ'], canyon: ['hẻm núi'], gumayusi: ['Guma'],
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
/** A pun on a handle, or the handle stretched ("Raptorrrr", "em Kellin"). */
export function punOf(handle: string, pick: (a: string[]) => string): string {
  const p = NAME_PUNS[norm(handle)];
  if (p) return pick(p);
  const last = handle.slice(-1);
  return pick([`${handle}${last.repeat(4)}`, `em ${handle}`, `${handle} ơi`, handle]);
}
export function hasPun(handle: string): boolean { return !!NAME_PUNS[norm(handle)]; }

/** "Nhân tướng hợp nhất": the player's name and his champion are the same thing (Monki on Wukong). */
export function nameMatch(handle: string, ch: Champion): boolean {
  const h = norm(handle);
  if (h.length < 3) return false;
  const names = [ch.id, ch.name, ...(CHAMP_NICK[ch.id] ?? [])].map(norm);
  return names.some((n) => n.length >= 3 && (n.startsWith(h.slice(0, 4)) || h.startsWith(n.slice(0, 4)) || n.includes(h) || h.includes(n)));
}

/** Scaling champions chat counts out loud: their stacks estimated from the game ({n} {unit}). */
export const STACKERS: Record<string, { unit: string; est: (cs: number, takedowns: number, mins: number) => number }> = {
  Nasus: { unit: 'Q', est: (cs, td) => Math.round(cs * 1.5 + td * 12) },
  Veigar: { unit: 'AP', est: (cs, td, m) => Math.round(cs * 0.45 + td * 5 + m * 4) },
  Senna: { unit: 'linh hồn', est: (_cs, td, m) => Math.round(m * 1.8 + td * 2) },
  Smolder: { unit: 'stack', est: (cs, td) => Math.round(cs * 0.8 + td * 5) },
  Kindred: { unit: 'dấu ấn', est: (_cs, td, m) => Math.floor(m / 3.5 + td / 6) },
  Thresh: { unit: 'linh hồn', est: (_cs, _td, m) => Math.round(m * 2.2) },
  Bard: { unit: 'chuông', est: (_cs, _td, m) => Math.round(m * 1.5) },
  Chogath: { unit: 'stack R', est: (_cs, td, m) => Math.floor(td / 3 + m / 7) },
};

/** What a crowd chants, heard through the stream, by the crowd favourite's region ({FAV} = its short name). */
export const CROWD_CHANT: Record<string, string[]> = {
  CN: ['chá giò', 'cha yố', 'chả giò', '加油', '{FAV} 加油'],
  KR: ['hwaiting', 'hoai tinh', '{FAV} hwaiting', '{FAV} 파이팅'],
  VN: ['Việt Nam vô địch', '{FAV} cố lên', 'cố lên', '{FAV} {FAV}'],
  other: ['{FAV}! {FAV}!', 'let’s go {FAV}', '{FAV} {FAV} {FAV}'],
};
export const VENUE_CITY: Record<string, string> = { KR: 'Seoul', CN: 'Bắc Kinh', VN: 'Sài Gòn', EMEA: 'Berlin', NA: 'Los Angeles', BR: 'São Paulo', APAC: 'Đài Bắc' };

/** Words in a caster's line that chat twists into a pun wave ("có lời" → "lời tạm biệt" ×15). */
export const DESK_PUNS: [RegExp, string[]][] = [
  [/\blời\b/i, ['lời tạm biệt', 'lời chia tay', 'lời nha kênh chat', 'lời từ biệt', 'lời cảm ơn và chào tạm biệt']],
  [/phép màu|phép thuật/i, ['phép', 'phép tới', 'phépppp', 'làm phép đi anh Lu']],
  [/không thể tin/i, ['không thể tin nổi', 'ko thể tin nổi', 'KHÔNG THỂ TIN NỔI']],
  [/bất ngờ/i, ['bất ngờ chưa', 'bất ngờ chưa bà già']],
  [/hủy diệt/i, ['hủy diệt', 'HỦY DIỆT', 'hủy diệt thật']],
  [/bản lĩnh/i, ['bản lĩnh', 'bản lĩnh là đây']],
  [/đẳng cấp/i, ['đẳng cấp', 'ĐẲNG CẤP', 'đẳng cấp là mãi mãi']],
  [/trời ơi/i, ['trời ơi', 'trời ơiiiii', 'TRỜI ƠI']],
];
