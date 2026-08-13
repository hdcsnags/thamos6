import React from 'react';
import { palette } from './tokens';

export interface IconProps {
  size?: number;
  className?: string;
}

interface AppIconTileProps {
  icon: React.FC<IconProps>;
  color: string;
  size?: number;
  iconSize?: number;
  className?: string;
  active?: boolean;
}

// Neutral tile, colored glyph. Identity color lives in the icon stroke only —
// the surrounding plate stays a dark neutral surface like a real OS dock.
export function AppIconTile({ icon: Icon, color, size = 38, iconSize, className, active = false }: AppIconTileProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className || ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(9, Math.round(size * 0.27)),
        color,
        background: `linear-gradient(160deg, ${palette.float} 0%, ${palette.base} 100%)`,
        border: `1px solid ${active ? palette.borderActive : palette.borderDefault}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 6px rgba(0,0,0,0.3)',
      }}
    >
      <Icon size={iconSize || Math.round(size * 0.52)} />
    </span>
  );
}

const baseProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// ThamOS logo mark — hex plate with a T-shaped circuit trace and live node.
// Reads at 16px in the taskbar and scales to boot/login lockups.
export const ThamosLogoIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" />
    <path d="M7.5 8.5h9" />
    <path d="M12 8.5v6.5" />
    <circle cx="12" cy="16.75" r="1.25" fill="currentColor" stroke="none" />
  </svg>
);

export const TerminalIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <rect x="2.5" y="3.5" width="19" height="17" rx="2.5" />
    <path d="M2.5 7.5h19" />
    <path d="m6 11 3 2.5L6 16" />
    <rect x="11.5" y="14.6" width="4.2" height="1.7" rx="0.4" fill="currentColor" stroke="none" />
  </svg>
);

export const VpsTerminalIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M8.5 6.8a5 5 0 0 1 7 0" />
    <path d="M6 4.3a9 9 0 0 1 12 0" />
    <rect x="3" y="9.5" width="18" height="5" rx="1.5" />
    <rect x="3" y="16" width="18" height="5" rx="1.5" />
    <path d="M6.5 12h.01" strokeWidth={2.5} />
    <path d="M6.5 18.5h.01" strokeWidth={2.5} />
    <path d="M17.5 12h-3.5" />
    <path d="M17.5 18.5h-3.5" />
  </svg>
);

export const ScannerIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12 18.9 6.2" />
    <path d="M18.9 6.2A9 9 0 0 1 21 12" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const BrowserIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <rect x="2.5" y="3.5" width="19" height="17" rx="2.5" />
    <path d="M2.5 8h19" />
    <path d="M5.5 5.8h.01" strokeWidth={2.5} />
    <path d="M8.5 5.8h.01" strokeWidth={2.5} />
    <circle cx="12" cy="14.5" r="4" />
    <path d="M8 14.5h8" />
    <ellipse cx="12" cy="14.5" rx="1.7" ry="4" />
  </svg>
);

export const MaestroIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M12 2a5 5 0 0 1 5 5v2a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z" />
    <path d="M9 22v-4" />
    <path d="M15 22v-4" />
    <path d="M8 15h8" />
    <circle cx="12" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <path d="M12 11.5V15" />
  </svg>
);

export const IntelIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M12 10.5V21" />
    <circle cx="12" cy="8.5" r="1.75" />
    <path d="M8.8 11.7a4.5 4.5 0 0 1 0-6.4" />
    <path d="M15.2 5.3a4.5 4.5 0 0 1 0 6.4" />
    <path d="M6.3 14.2a8 8 0 0 1 0-11.4" />
    <path d="M17.7 2.8a8 8 0 0 1 0 11.4" />
  </svg>
);

export const CaseIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <rect x="3" y="7.5" width="18" height="13" rx="2" />
    <path d="M9 7.5V5.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    <path d="M3 12.5h7.5" />
    <path d="M13.5 12.5H21" />
    <rect x="10.5" y="11.2" width="3" height="2.6" rx="0.6" />
  </svg>
);

export const FilesIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <circle cx="9" cy="11.5" r="1.2" />
    <circle cx="15" cy="16.5" r="1.2" />
    <path d="M9 12.7v.8a2.5 2.5 0 0 0 2.5 2.5h2.3" />
  </svg>
);

export const EditorIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <polyline points="16 17 21 12 16 7" />
    <polyline points="8 7 3 12 8 17" />
    <path d="M12 8.5v7" />
    <path d="M10.8 8.5h2.4" />
    <path d="M10.8 15.5h2.4" />
  </svg>
);

export const MonitorIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <rect x="2" y="3.5" width="20" height="14" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17.5V21" />
    <path d="M5.5 10.5h3L10 7.8l2.5 5.6 1.5-2.9h4.5" />
  </svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M4 6h3" />
    <path d="M11 6h9" />
    <circle cx="9" cy="6" r="2" />
    <path d="M4 12h9" />
    <path d="M17 12h3" />
    <circle cx="15" cy="12" r="2" />
    <path d="M4 18h1" />
    <path d="M9 18h11" />
    <circle cx="7" cy="18" r="2" />
  </svg>
);

export const SearchResultIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
    <path d="M8.2 9.5h5.6" />
    <path d="M8.2 12.5h4" />
  </svg>
);


export const DecoderIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M4 8.5h13" />
    <path d="m13.5 5 3.5 3.5-3.5 3.5" />
    <path d="M20 15.5H7" />
    <path d="m10.5 12-3.5 3.5 3.5 3.5" />
  </svg>
);

export const DefangIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M10 9.5H8.5v5H10" />
    <path d="M14 9.5h1.5v5H14" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const EmailAnalyzerIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M17.5 12.5V7a2 2 0 0 0-2-2H4.5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h7" />
    <path d="m2.5 7.5 7.5 5 7.5-5" />
    <circle cx="17.5" cy="16.5" r="3.5" />
    <path d="m20.2 19.2 1.8 1.8" />
  </svg>
);

export const IOCExtractorIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7" />
    <path d="M7.5 7h4.5" />
    <path d="M7.5 10.5h3" />
    <path d="M11 15.5h9" />
    <path d="m17 12.5 3 3-3 3" />
    <circle cx="17" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="20" cy="8" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const BulkLookupIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M4 5h16" />
    <path d="M4 9.7h6.5" />
    <path d="M4 14.4h5.5" />
    <path d="M4 19h8" />
    <circle cx="16" cy="14" r="4.5" />
    <path d="m19.3 17.3 2.7 2.7" />
  </svg>
);

export const ExtensionScannerIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M3.5 7V5A1.5 1.5 0 0 1 5 3.5h2" />
    <path d="M17 3.5h2A1.5 1.5 0 0 1 20.5 5v2" />
    <path d="M20.5 17v2a1.5 1.5 0 0 1-1.5 1.5h-2" />
    <path d="M7 20.5H5A1.5 1.5 0 0 1 3.5 19v-2" />
    <path d="M8.4 17.6v-5h2.5a1.6 1.6 0 0 1 3.2 0h2.5v5h-8.2z" />
  </svg>
);

export const DocAnalyzerIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <circle cx="11" cy="14" r="3" />
    <path d="m13.2 16.2 1.8 1.8" />
  </svg>
);

// Thamos AI orb icon — core with tilted orbital ring and live satellite
export const ThamosIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <circle cx="12" cy="12" r="4" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-25 12 12)" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="7.6" r="1" fill="currentColor" stroke="none" />
  </svg>
);
