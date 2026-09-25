import { ICON_PATHS } from './paths';

export const FALLBACK_ICON = 'dices';

export function iconPaths(key: string): readonly string[] {
  return ICON_PATHS[key] ?? ICON_PATHS[FALLBACK_ICON] ?? [];
}
