export type ThemeId =
  | 'mythic-gold'
  | 'arcane-navy'
  | 'parchment-tome'
  | 'ember-violet';

export interface ThemeMeta {
  id: ThemeId;
  /** Brand-sheet number from design/brand-themes-reference.png */
  ref: number;
  name: string;
  tagline: string;
  mood: string;
  headingFont: string;
  /** Palette for the Settings preview cards: [bg, surface, primary, accent, text]. */
  swatches: [string, string, string, string, string];
}

export const DEFAULT_THEME_ID: ThemeId = 'mythic-gold';

export const THEMES: ThemeMeta[] = [
  {
    id: 'mythic-gold',
    ref: 1,
    name: 'Mythic Gold',
    tagline: 'Your Campaign. Bound by Myth.',
    mood: 'Dark, heraldic, gold + violet accent',
    headingFont: 'Cinzel',
    swatches: ['#0e0f13', '#16181e', '#c9a24b', '#7c4def', '#eceae3'],
  },
  {
    id: 'arcane-navy',
    ref: 3,
    name: 'Arcane Navy',
    tagline: 'Weave legends. Build worlds.',
    mood: 'Midnight blue, scholarly, warm gold',
    headingFont: 'Lora',
    swatches: ['#0c1726', '#13243a', '#d9a93e', '#4c7ca8', '#eaf0f6'],
  },
  {
    id: 'parchment-tome',
    ref: 6,
    name: 'Parchment Tome',
    tagline: 'Ideas. Adventures. Bound.',
    mood: 'Cozy parchment, hand-drawn (light)',
    headingFont: 'IM Fell English',
    swatches: ['#f3ecdd', '#fbf6ec', '#5b3fa0', '#c07f46', '#2e2620'],
  },
  {
    id: 'ember-violet',
    ref: 9,
    name: 'Ember Violet',
    tagline: 'Bring stories to life.',
    mood: 'Black + violet flame, modern',
    headingFont: 'Playfair Display',
    swatches: ['#100e16', '#1a1722', '#7c3aed', '#a78bfa', '#f1efe6'],
  },
];

export function getTheme(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === 'string' && THEMES.some((t) => t.id === value)
  );
}
