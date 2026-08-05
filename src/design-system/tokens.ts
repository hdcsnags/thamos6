export const palette = {
  // Operator workstation: neutral graphite surfaces with one restrained accent.
  // Semantic colors are intentionally muted so they communicate state instead
  // of turning every control into a competing light source.
  void: '#0f1215',
  base: '#14181c',
  elevated: '#1a1f24',
  float: '#20262c',
  surface: '#272e35',

  borderSubtle: 'rgba(184, 196, 207, 0.10)',
  borderDefault: 'rgba(184, 196, 207, 0.16)',
  borderActive: 'rgba(184, 196, 207, 0.28)',

  textPrimary: '#e6eaed',
  textSecondary: '#a4adb5',
  textTertiary: '#79848e',
  textDisabled: '#59636c',

  accent: '#5f8fa8',
  cyan: '#5f8fa8',
  green: '#6f9a7c',
  amber: '#bd965d',
  rose: '#bd6969',
  blue: '#668eaa',
  teal: '#67978f',
  // Compatibility aliases used by older Desktop components.
  pink: '#67978f',
  orange: '#bd965d',

  mailPreviewBg: '#f8fafc',
  mailPreviewChrome: '#f1f5f9',
  mailPreviewBorder: '#e2e8f0',
  mailPreviewText: '#111827',
  mailPreviewMuted: '#64748b',
  mailPreviewChip: '#e2e8f0',
  mailPreviewLink: '#2563eb',
  mailPreviewDanger: '#dc2626',
  mailPreviewAvatarBg: '#dbeafe',
  mailPreviewAvatarText: '#1e40af',

  agentX: '#6f9a7c',
  agentY: '#bd965d',
  agentZ: '#5f8fa8',
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
  xl: '9px',
  '2xl': '12px',
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
