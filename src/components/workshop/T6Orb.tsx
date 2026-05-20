export type T6OrbState =
  | 'idle'
  | 'thinking'
  | 'broadcasting'
  | 'deliberating'
  | 'synthesizing'
  | 'done'
  | 'tense'
  | 'conflict'
  | 'error';

interface T6OrbProps {
  state: T6OrbState;
  size?: number;
}

// Silver base, state-color adaptive.
// Operational phases  → pulse (active work in progress)
// Post-synthesis states → idle breathe (ambient status indicator)
//   done     → cool blue-white  (consensus)
//   tense    → amber breathe    (unresolved tensions)
//   conflict → rose breathe     (significant disagreement)
//   error    → rose pulse       (failure)
const ORB_CONFIG: Record<T6OrbState, { gradient: string; glow: string; animation: string; duration: string }> = {
  idle: {
    gradient: 'radial-gradient(circle at 35% 30%, rgba(230,235,245,0.95) 0%, rgba(180,190,210,0.85) 28%, rgba(120,130,155,0.55) 62%, rgba(40,45,65,0.15) 88%, transparent 100%)',
    glow: '180,190,210',
    animation: 'orb-idle',
    duration: '4s',
  },
  thinking: {
    gradient: 'radial-gradient(circle at 35% 30%, rgba(220,228,245,0.95) 0%, rgba(165,180,215,0.85) 28%, rgba(110,125,165,0.55) 62%, rgba(38,44,72,0.15) 88%, transparent 100%)',
    glow: '165,180,215',
    animation: 'orb-pulse',
    duration: '1.4s',
  },
  broadcasting: {
    gradient: 'radial-gradient(circle at 35% 30%, rgba(160,235,255,0.95) 0%, rgba(80,195,230,0.85) 28%, rgba(30,140,185,0.55) 62%, rgba(8,50,80,0.15) 88%, transparent 100%)',
    glow: '80,195,230',
    animation: 'orb-pulse',
    duration: '1.1s',
  },
  deliberating: {
    gradient: 'radial-gradient(circle at 35% 30%, rgba(255,210,120,0.95) 0%, rgba(210,148,50,0.85) 28%, rgba(148,92,18,0.55) 62%, rgba(60,32,6,0.15) 88%, transparent 100%)',
    glow: '210,148,50',
    animation: 'orb-pulse',
    duration: '1.8s',
  },
  synthesizing: {
    gradient: 'radial-gradient(circle at 35% 30%, rgba(148,240,190,0.95) 0%, rgba(72,192,128,0.85) 28%, rgba(30,138,75,0.55) 62%, rgba(8,55,28,0.15) 88%, transparent 100%)',
    glow: '72,192,128',
    animation: 'orb-pulse',
    duration: '2.2s',
  },
  // Post-synthesis: ambient breathe, not active pulse
  done: {
    gradient: 'radial-gradient(circle at 35% 30%, rgba(148,240,190,0.92) 0%, rgba(60,185,115,0.82) 28%, rgba(25,130,68,0.52) 62%, rgba(6,48,24,0.14) 88%, transparent 100%)',
    glow: '60,185,115',
    animation: 'orb-idle',
    duration: '5s',
  },
  tense: {
    gradient: 'radial-gradient(circle at 35% 30%, rgba(255,232,140,0.95) 0%, rgba(215,162,38,0.85) 28%, rgba(155,106,14,0.55) 62%, rgba(60,38,4,0.14) 88%, transparent 100%)',
    glow: '215,162,38',
    animation: 'orb-idle',
    duration: '3.5s',
  },
  conflict: {
    gradient: 'radial-gradient(circle at 35% 30%, rgba(255,185,185,0.95) 0%, rgba(210,72,72,0.85) 28%, rgba(148,28,28,0.55) 62%, rgba(60,8,8,0.14) 88%, transparent 100%)',
    glow: '210,72,72',
    animation: 'orb-idle',
    duration: '4.5s',
  },
  error: {
    gradient: 'radial-gradient(circle at 35% 30%, rgba(255,148,148,0.95) 0%, rgba(210,70,70,0.85) 28%, rgba(148,28,28,0.55) 62%, rgba(60,8,8,0.15) 88%, transparent 100%)',
    glow: '210,70,70',
    animation: 'orb-pulse',
    duration: '3.5s',
  },
};

const STATE_LABEL: Record<T6OrbState, string> = {
  idle: 'THAMOS',
  thinking: 'THINKING',
  broadcasting: 'BROADCAST',
  deliberating: 'DELIBERATING',
  synthesizing: 'SYNTHESIZING',
  done: 'CONSENSUS',
  tense: 'TENSION',
  conflict: 'CONFLICT',
  error: 'ERROR',
};

export function T6Orb({ state, size = 80 }: T6OrbProps) {
  const cfg = ORB_CONFIG[state];
  const glow = Math.round(size * 0.35);
  const spread = Math.round(size * 0.85);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: cfg.gradient,
            boxShadow: `0 0 ${glow}px rgba(${cfg.glow},0.38), 0 0 ${spread}px rgba(${cfg.glow},0.16), inset 0 0 ${Math.round(glow / 2)}px rgba(${cfg.glow},0.20)`,
            animation: `${cfg.animation} ${cfg.duration} ease-in-out infinite`,
            transition: 'background 0.9s ease, box-shadow 0.7s ease',
          }}
        />
        <style>{`
          @keyframes orb-idle {
            0%, 100% { transform: scale(1); filter: brightness(1); }
            50% { transform: scale(1.018); filter: brightness(1.04); }
          }
          @keyframes orb-pulse {
            0%, 100% { transform: scale(1); filter: brightness(1); }
            50% { transform: scale(1.06); filter: brightness(1.22); }
          }
        `}</style>
      </div>
      <div style={{
        fontSize: '0.6rem',
        letterSpacing: '0.12em',
        color: `rgba(${cfg.glow},0.7)`,
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 500,
        transition: 'color 0.7s ease',
        textTransform: 'uppercase',
      }}>
        {STATE_LABEL[state]}
      </div>
    </div>
  );
}
