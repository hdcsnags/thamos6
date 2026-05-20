import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
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

export const TerminalIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <rect x="2" y="3" width="20" height="18" rx="2" />
    <path d="m6 8 3 3-3 3" />
    <path d="M11 14h6" />
  </svg>
);

export const VpsTerminalIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="m6 8 2.5 2.5L6 13" />
    <path d="M11 13h5" />
    <path d="M6 21h12" />
    <path d="M9 17v4" />
    <path d="M15 17v4" />
  </svg>
);

export const ScannerIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
    <path d="M11 8v6" />
    <path d="M8 11h6" />
    <circle cx="11" cy="11" r="2" strokeWidth={2} />
  </svg>
);

export const BrowserIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
    <path d="M3 12h18" />
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
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

export const CaseIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="m9 15 2 2 4-4" />
  </svg>
);

export const FilesIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <path d="M10 11h4" />
    <path d="M10 15h4" />
  </svg>
);

export const EditorIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

export const MonitorIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M6 10h.01" strokeWidth={2.5} />
    <path d="M10 7h.01" strokeWidth={2.5} />
    <path d="M14 10h.01" strokeWidth={2.5} />
    <path d="M18 7h.01" strokeWidth={2.5} />
    <path d="M6 13h.01" strokeWidth={2.5} />
    <path d="M10 10h.01" strokeWidth={2.5} />
    <path d="M14 13h.01" strokeWidth={2.5} />
    <path d="M18 10h.01" strokeWidth={2.5} />
  </svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const SearchResultIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
    <path d="M11 8v6" />
    <path d="M8 11h6" />
  </svg>
);

export const TopDeskIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M4.5 3h15a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M12 10v11" />
    <path d="M8 21h8" />
    <path d="M9 6h.01" strokeWidth={2.5} />
    <path d="M12 6h.01" strokeWidth={2.5} />
    <path d="M15 6h.01" strokeWidth={2.5} />
  </svg>
);

export const DecoderIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
    <path d="M10 12h4" />
  </svg>
);

export const DefangIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M4.5 4.5l15 15" />
  </svg>
);

export const EmailAnalyzerIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
    <path d="M9 12l-4 4" />
    <path d="M15 12l4 4" />
  </svg>
);

export const IOCExtractorIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
    <circle cx="11" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="7" cy="8" r="0.75" fill="currentColor" stroke="none" />
    <circle cx="14" cy="14" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

export const BulkLookupIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <rect x="2" y="3" width="20" height="6" rx="1" />
    <rect x="2" y="11" width="20" height="6" rx="1" />
    <path d="M6 6h.01" strokeWidth={2.5} />
    <path d="M6 14h.01" strokeWidth={2.5} />
  </svg>
);

export const ExtensionScannerIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg {...baseProps} width={size} height={size} className={className}>
    <path d="M4 7V4h3" />
    <path d="M17 4h3v3" />
    <path d="M20 17v3h-3" />
    <path d="M7 20H4v-3" />
    <path d="M9 9h6v6H9z" />
    <path d="M15 12h3" />
    <path d="M6 12H3" />
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
