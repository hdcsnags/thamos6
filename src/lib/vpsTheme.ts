import type { ITheme } from '@xterm/xterm';
import { palette } from '../design-system/tokens';

export const vpsTerminalTheme: ITheme = {
  background: '#060610',
  foreground: '#c8cde0',
  cursor: palette.cyan,
  cursorAccent: '#060610',
  selectionBackground: 'rgba(0, 217, 255, 0.2)',
  selectionForeground: '#f8fafc',
  black: '#0a0e1a',
  red: '#ff0080',
  green: '#00ff9d',
  yellow: '#fbbf24',
  blue: '#00b4d8',
  magenta: '#b794f6',
  cyan: '#00d9ff',
  white: '#c8cde0',
  brightBlack: '#3a3f55',
  brightRed: '#ff3399',
  brightGreen: '#33ffb4',
  brightYellow: '#fcd34d',
  brightBlue: '#38bdf8',
  brightMagenta: '#c4b5fd',
  brightCyan: '#22d3ee',
  brightWhite: '#f8fafc',
};
