export interface Wallpaper {
  id: string;
  name: string;
  style: React.CSSProperties;
  preview: string; // CSS gradient for preview swatch
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: 'default',
    name: 'ThamOS',
    style: {
      background: 'radial-gradient(ellipse at 50% 40%, #0a0d12 0%, #050508 100%)',
    },
    preview: 'radial-gradient(circle at 50% 40%, #0a0d12, #050508)',
  },
  {
    id: 'void',
    name: 'Void',
    style: {
      background: '#050508',
    },
    preview: 'linear-gradient(135deg, #050508, #0a0a10)',
  },
  {
    id: 'grid',
    name: 'Grid',
    style: {
      backgroundColor: '#050508',
      backgroundImage: `
        linear-gradient(rgba(0, 217, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 217, 255, 0.03) 1px, transparent 1px)
      `,
      backgroundSize: '40px 40px',
    },
    preview: 'repeating-linear-gradient(0deg, rgba(0,217,255,0.1), rgba(0,217,255,0.1) 1px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, rgba(0,217,255,0.1), rgba(0,217,255,0.1) 1px, transparent 1px, transparent 20px), #050508',
  },
  {
    id: 'hex',
    name: 'Hex',
    style: {
      backgroundColor: '#050508',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%2300d9ff' fill-opacity='0.03'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-7.5L27.99 34H28v2.31h-.01L17 42.65V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
    },
    preview: 'linear-gradient(135deg, #050508, #0a0e1a)',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    style: {
      background: 'radial-gradient(ellipse at 20% 20%, rgba(0, 180, 216, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(0, 255, 157, 0.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, #0a0d12 0%, #050508 100%)',
    },
    preview: 'radial-gradient(circle at 20% 20%, rgba(0,180,216,0.3), transparent 50%), radial-gradient(circle at 80% 80%, rgba(0,255,157,0.2), transparent 50%), #050508',
  },
  {
    id: 'scanlines',
    name: 'CRT',
    style: {
      background: '#050508',
      backgroundImage: 'repeating-linear-gradient(0deg, rgba(0, 217, 255, 0.015) 0px, rgba(0, 217, 255, 0.015) 1px, transparent 1px, transparent 3px)',
    },
    preview: 'repeating-linear-gradient(0deg, rgba(0,217,255,0.15), rgba(0,217,255,0.15) 1px, transparent 1px, transparent 4px), #050508',
  },
  {
    id: 'dragon',
    name: 'Wyrm',
    style: {
      backgroundColor: '#050508',
      backgroundImage: `
        radial-gradient(ellipse at 50% 50%, rgba(0, 180, 216, 0.04) 0%, transparent 60%),
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'%3E%3Cdefs%3E%3Cfilter id='glow'%3E%3CfeGaussianBlur stdDeviation='4' result='b'/%3E%3CfeMerge%3E%3CfeMergeNode in='b'/%3E%3CfeMergeNode in='SourceGraphic'/%3E%3C/feMerge%3E%3C/filter%3E%3C/defs%3E%3Cg fill='none' stroke='%2300b4d8' stroke-width='0.8' opacity='0.12' filter='url(%23glow)'%3E%3Cpath d='M400 120c-20 40-60 80-100 100-40 20-80 20-100 40s-20 60 0 100c20 40 60 60 80 80s40 60 20 100c-20 40-60 60-80 100s-20 80 0 120c20 40 60 60 100 60s80-20 120-40c40-20 80-40 120-40s80 20 100 60c20 40 20 80 0 120s-60 60-100 60-80-20-100-60c-20-40-20-80 0-120s60-60 80-100c20-40 0-80-20-100s-60-40-80-80c-20-40 0-80 20-100s60-20 100-40c40-20 80-60 100-100'/%3E%3Cpath d='M400 180c-15 30-45 60-75 75-30 15-60 15-75 30s-15 45 0 75c15 30 45 45 60 60s30 45 15 75c-15 30-45 45-60 75s-15 60 0 90c15 30 45 45 75 45s60-15 90-30c30-15 60-30 90-30s60 15 75 45c15 30 15 60 0 90s-45 45-75 45-60-15-75-45c-15-30-15-60 0-90s45-45 60-75c15-30 0-60-15-75s-45-30-60-60c-15-30 0-60 15-75s45-15 75-30c30-15 60-45 75-75'/%3E%3Cpath d='M280 400c10-10 30-20 50-20s40 10 50 20c10 10 20 30 20 50s-10 40-20 50c-10 10-30 20-50 20s-40-10-50-20c-10-10-20-30-20-50s10-40 20-50z'/%3E%3Cpath d='M520 400c10-10 30-20 50-20s40 10 50 20c10 10 20 30 20 50s-10 40-20 50c-10 10-30 20-50 20s-40-10-50-20c-10-10-20-30-20-50s10-40 20-50z'/%3E%3Cpath d='M400 280l-20 40 20 20 20-20-20-40z'/%3E%3Cpath d='M400 520l-20-40 20-20 20 20-20 40z'/%3E%3C/g%3E%3C/svg%3E")
      `,
      backgroundSize: 'cover, 600px 600px',
      backgroundPosition: 'center, center',
      backgroundRepeat: 'no-repeat, no-repeat',
    },
    preview: 'radial-gradient(circle at 50% 50%, rgba(0,180,216,0.2), transparent 60%), #050508',
  },
];

export const WALLPAPER_STORAGE_KEY = 'thamos6-wallpaper';

export function getSavedWallpaper(): string {
  try {
    return localStorage.getItem(WALLPAPER_STORAGE_KEY) || 'default';
  } catch {
    return 'default';
  }
}

export function saveWallpaper(id: string): void {
  try {
    localStorage.setItem(WALLPAPER_STORAGE_KEY, id);
  } catch {}
}

export function getWallpaperById(id: string): Wallpaper {
  return WALLPAPERS.find(w => w.id === id) || WALLPAPERS[0];
}
