import { Shield, Zap, Ticket, Globe } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';

export type ServiceName = 'topdesk' | 'sentinel' | 'defender' | 'entra';

export interface ServiceState {
  id: ServiceName;
  name: string;
  status: 'online' | 'offline' | 'warning';
  icon: any;
  color: string;
}

const SERVICES: ServiceState[] = [
  { id: 'sentinel', name: 'Microsoft Sentinel', status: 'online', icon: Shield, color: palette.cyan },
  { id: 'defender', name: 'Microsoft Defender', status: 'online', icon: Zap, color: palette.blue },
  { id: 'topdesk', name: 'TopDesk', status: 'online', icon: Ticket, color: palette.teal },
  { id: 'entra', name: 'Entra ID / SSO', status: 'online', icon: Globe, color: palette.green },
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
              color: service.status === 'online' ? service.color : service.status === 'warning' ? palette.amber : palette.rose,
              opacity: service.status === 'online' ? 0.8 : 1,
              filter: service.status !== 'online' ? `drop-shadow(0 0 4px ${palette.rose})` : 'none'
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
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: service.status === 'online' ? service.color : palette.amber }} />
              <span className="font-bold uppercase tracking-wider">{service.name}</span>
            </div>
            <div className="text-[9px] text-slate-500">
              STATUS: <span style={{ color: service.status === 'online' ? palette.green : palette.amber }}>{service.status.toUpperCase()}</span>
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              INTEGRATION: not yet configured
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
