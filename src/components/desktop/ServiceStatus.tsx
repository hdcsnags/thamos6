import { Shield, Zap, Globe } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';

export type ServiceName = 'sentinel' | 'defender' | 'entra';

export interface ServiceState {
  id: ServiceName;
  name: string;
  status: 'online' | 'offline' | 'warning' | 'not configured';
  icon: any;
  color: string;
}

// Honest state: none of these integrations are wired up yet, so they render
// as dim/neutral placeholders — no green dots, no fake health.
const SERVICES: ServiceState[] = [
  { id: 'sentinel', name: 'Microsoft Sentinel', status: 'not configured', icon: Shield, color: palette.textTertiary },
  { id: 'defender', name: 'Microsoft Defender', status: 'not configured', icon: Zap, color: palette.textTertiary },
  { id: 'entra', name: 'Entra ID / SSO', status: 'not configured', icon: Globe, color: palette.textTertiary },
];

export function ServiceStatus() {
  const services = SERVICES;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/5">
      {services.map(service => (
        <div key={service.id} className="relative group">
          <service.icon
            className="w-3.5 h-3.5 transition-all duration-300"
            style={{
              color:
                service.status === 'online' ? service.color
                : service.status === 'warning' ? palette.amber
                : service.status === 'offline' ? palette.rose
                : palette.textDisabled,
              opacity: service.status === 'not configured' ? 0.7 : service.status === 'online' ? 0.8 : 1,
            }}
          />

          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[100]"
            style={{
              fontSize: '10px',
              fontFamily: typography.mono,
              backgroundColor: palette.elevated,
              border: `1px solid ${palette.borderDefault}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              color: palette.textPrimary,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    service.status === 'online' ? service.color
                    : service.status === 'warning' ? palette.amber
                    : service.status === 'offline' ? palette.rose
                    : palette.textDisabled,
                }}
              />
              <span className="font-bold uppercase tracking-wider">{service.name}</span>
            </div>
            <div className="text-[9px]" style={{ color: palette.textTertiary }}>
              STATUS: <span style={{ color: service.status === 'online' ? palette.green : service.status === 'not configured' ? palette.textTertiary : palette.amber }}>{service.status.toUpperCase()}</span>
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: palette.textTertiary }}>
              INTEGRATION: not connected yet
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
