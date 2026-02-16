import { useDesktop } from '../../contexts/DesktopContext';
import Scanner from '../../pages/Scanner';
import type { ScanFlags } from '../../lib/cliFlags';

export function DesktopScanner() {
  const desktop = useDesktop();

  const handleScan = (type: string, value: string) => {
    const flags: ScanFlags = {
      verbose: true,
      threats: true,
      network: true,
      vpn: true,
      geo: true,
      sources: true,
      json: false,
    };

    const appIdMap: Record<string, 'ip-result' | 'url-result' | 'domain-result' | 'hash-result'> = {
      ip: 'ip-result',
      url: 'url-result',
      domain: 'domain-result',
      hash: 'hash-result',
    };

    const appId = appIdMap[type];

    if (appId) {
      desktop.openWindow({
        appId,
        title: `${type.toUpperCase()} Scan: ${value.slice(0, 30)}${value.length > 30 ? '...' : ''}`,
        data: { value, flags },
        size: { width: 1000, height: 700 },
      });
    } else {
      console.warn(`Unknown scan type: ${type}`);
    }
  };

  return <Scanner onScan={handleScan} />;
}
