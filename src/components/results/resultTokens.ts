import { palette } from '../../design-system/tokens';

/** Semantic tone for result-kit surfaces. Colors always come from tokens.ts. */
export type Tone = 'neutral' | 'good' | 'warn' | 'danger' | 'accent';

export const toneColor: Record<Tone, string> = {
  neutral: palette.textSecondary,
  good: palette.green,
  warn: palette.amber,
  danger: palette.rose,
  accent: palette.accent,
};

export function toneBg(tone: Tone, opacity = 0.08): string {
  if (tone === 'neutral') return palette.base;
  return `${toneColor[tone]}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

export function toneBorder(tone: Tone, opacity = 0.28): string {
  if (tone === 'neutral') return palette.borderDefault;
  return `${toneColor[tone]}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

export const cardStyle = {
  background: palette.base,
  border: `1px solid ${palette.borderDefault}`,
  borderRadius: '9px',
} as const;
