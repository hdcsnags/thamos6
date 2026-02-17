export const palette = {
  void: '#050508',
  base: '#0a0d12',
  elevated: '#11141a',
  float: '#181b22',
  surface: '#1e222b',

  borderSubtle: 'rgba(148, 163, 184, 0.06)',
  borderDefault: 'rgba(148, 163, 184, 0.10)',
  borderActive: 'rgba(148, 163, 184, 0.20)',

  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  textDisabled: '#475569',

  cyan: '#00d9ff',
  green: '#00ff9d',
  amber: '#fbbf24',
  rose: '#f43f5e',
  blue: '#00b4d8',
  teal: '#2dd4bf',

  agentX: '#00ff9d',
  agentY: '#fbbf24',
  agentZ: '#00d9ff',
} as const;

export const typography = {
  ui: 'Inter, system-ui, -apple-system, sans-serif',
  mono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

export const fontSizes = {
  xs: '11px',
  sm: '12px',
  base: '13px',
  md: '14px',
  lg: '16px',
  xl: '18px',
  '2xl': '20px',
} as const;

export const spacing = {
  px: '1px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const;

export const radii = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.4)',
  md: '0 4px 12px rgba(0, 0, 0, 0.5)',
  lg: '0 12px 48px rgba(0, 0, 0, 0.6)',
  xl: '0 24px 64px rgba(0, 0, 0, 0.8)',
  window: '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
  windowActive: '0 12px 48px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0, 0, 0, 0.4)',
} as const;

export const durations = {
  fast: '150ms',
  normal: '250ms',
  slow: '350ms',
} as const;

export const easings = {
  default: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

export function accentBg(color: string, opacity = 0.1): string {
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

export function accentBorder(color: string, opacity = 0.25): string {
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}
