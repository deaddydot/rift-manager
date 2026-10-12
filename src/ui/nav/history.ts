// In-app navigation history (for the Back button) and platform key labels.

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

const stack: string[] = [];
/** Track hash changes so the Back button knows whether there is an in-app page to go back to. */
export function trackHistory(hash: string) {
  if (stack.length > 1 && stack[stack.length - 2] === hash) stack.pop();
  else if (stack[stack.length - 1] !== hash) stack.push(hash);
  if (stack.length > 100) stack.splice(0, stack.length - 100);
}
export const canGoBack = () => stack.length > 1;
