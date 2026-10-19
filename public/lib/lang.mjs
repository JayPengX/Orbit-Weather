// The reader's language and W('今天', 'Today'): the kit's lang.mjs; an older
// cached kit without it gets the same two lines from its detectLang.
import { detectLang } from '#kit/quadra.mjs';

const k = await import('#kit/lang.mjs').catch(() => null);
export const lang = k?.lang ?? (typeof document === 'undefined' ? 'zh' : detectLang());
export const en = k?.en ?? lang === 'en';
export const W = k?.W ?? ((zh, english) => (en ? english : zh));
