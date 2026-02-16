import { useState } from 'react';
import Layout, { type Page } from './components/Layout';
import TerminalLayout from './components/terminallayout';
import DesktopLayout from './components/DesktopLayout';
import Scanner from './pages/Scanner';
import TerminalScanner from './pages/terminalscanner';
import DesktopScanner from './pages/DesktopScanner';
import IPResult from './pages/results/IPResult';
import URLResult from './pages/results/URLResult';
import DomainResult from './pages/results/DomainResult';
import HashResult from './pages/results/HashResult';
import ExtensionResult from './pages/results/ExtensionResult';
import TerminalIPResult from './pages/results/terminalipresult';
import TerminalURLResult from './pages/results/TerminalURLResult';
import TerminalDomainResult from './pages/results/TerminalDomainResult';
import TerminalHashResult from './pages/results/TerminalHashResult';
import DesktopIPResult from './pages/results/DesktopIPResult';
// TODO: Create these as needed following the same pattern as DesktopIPResult
// import DesktopURLResult from './pages/results/DesktopURLResult';
// import DesktopDomainResult from './pages/results/DesktopDomainResult';
// import DesktopHashResult from './pages/results/DesktopHashResult';
import IPLookup from './pages/IPLookup';
import URLScanner from './pages/URLScanner';
import BulkLookup from './pages/BulkLookup';
import History from './pages/History';
import EmailAnalyzer from './pages/EmailAnalyzer';
import IOCExtractor from './pages/IOCExtractor';
import HashLookup from './pages/HashLookup';
import DomainIntel from './pages/DomainIntel';
import DefangTool from './pages/DefangTool';
import DecoderTool from './pages/DecoderTool';
import CaseNotes from './pages/CaseNotes';
import NewsFeed from './pages/NewsFeed';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import ExtensionScanner from './pages/ExtensionScanner';
import { useTheme } from './contexts/themecontext';
import type { ScanFlags } from './lib/cliFlags';

function App() {
  const { theme } = useTheme();
  const [currentPage, setCurrentPage] = useState<Page>('scanner');
  const [scanResult, setScanResult] = useState<{ type: string; value: string; flags?: ScanFlags } | null>(null);

  const handleScan = (type: string, value: string, flags?: ScanFlags) => {
    setScanResult({ type, value, flags });
  };

  const handleNavigate = (page: Page) => {
    setScanResult(null);
    setCurrentPage(page);
  };

  const handleBackToScanner = () => {
    setScanResult(null);
  };

  // ─── Desktop Theme Renderer ───────────────────────────────
  const renderDesktopPage = () => {
    if (currentPage === 'scanner' && scanResult) {
      switch (scanResult.type) {
        case 'ip':
          return <DesktopIPResult ip={scanResult.value} flags={scanResult.flags} onBack={handleBackToScanner} />;
        // TODO: Uncomment as Desktop result components are created
        // case 'url':
        //   return <DesktopURLResult url={scanResult.value} flags={scanResult.flags} onBack={handleBackToScanner} />;
        // case 'domain':
        //   return <DesktopDomainResult domain={scanResult.value} flags={scanResult.flags} onBack={handleBackToScanner} />;
        // case 'hash':
        //   return <DesktopHashResult hash={scanResult.value} flags={scanResult.flags} onBack={handleBackToScanner} />;
        default:
          // Fallback to terminal results for types not yet built
          return <DesktopScanner onScan={handleScan} />;
      }
    }
    return <DesktopScanner onScan={handleScan} />;
  };

  // ─── Terminal Theme Renderer ──────────────────────────────
  const renderTerminalPage = () => {
    if (currentPage === 'scanner' && scanResult) {
      switch (scanResult.type) {
        case 'ip':
          return <TerminalIPResult ip={scanResult.value} flags={scanResult.flags} onBack={handleBackToScanner} />;
        case 'url':
          return <TerminalURLResult url={scanResult.value} flags={scanResult.flags} onBack={handleBackToScanner} />;
        case 'domain':
          return <TerminalDomainResult domain={scanResult.value} flags={scanResult.flags} onBack={handleBackToScanner} />;
        case 'hash':
          return <TerminalHashResult hash={scanResult.value} flags={scanResult.flags} onBack={handleBackToScanner} />;
        default:
          return <TerminalScanner onScan={handleScan} />;
      }
    }
    return <TerminalScanner onScan={handleScan} />;
  };

  // ─── Tactical Theme Renderer ──────────────────────────────
  const renderTacticalPage = () => {
    if (currentPage === 'scanner' && scanResult) {
      switch (scanResult.type) {
        case 'ip':
          return <IPResult ip={scanResult.value} />;
        case 'url':
          return <URLResult url={scanResult.value} />;
        case 'domain':
          return <DomainResult domain={scanResult.value} />;
        case 'hash':
          return <HashResult hash={scanResult.value} />;
        case 'extension':
          return <ExtensionScanner />;
        default:
          return <Scanner onScan={handleScan} />;
      }
    }

    switch (currentPage) {
      case 'scanner': return <Scanner onScan={handleScan} />;
      case 'ip': return <IPLookup />;
      case 'url': return <URLScanner />;
      case 'bulk': return <BulkLookup />;
      case 'history': return <History />;
      case 'email': return <EmailAnalyzer />;
      case 'ioc': return <IOCExtractor />;
      case 'hash': return <HashLookup />;
      case 'domain': return <DomainIntel />;
      case 'extension': return <ExtensionScanner />;
      case 'defang': return <DefangTool />;
      case 'decoder': return <DecoderTool />;
      case 'cases': return <CaseNotes />;
      case 'news': return <NewsFeed />;
      case 'settings': return <Settings />;
      case 'admin': return <Admin />;
      default: return <Scanner onScan={handleScan} />;
    }
  };

  // ─── Theme Router ─────────────────────────────────────────

  if (theme === 'desktop') {
    return (
      <DesktopLayout currentPage={currentPage} onNavigate={handleNavigate}>
        {renderDesktopPage()}
      </DesktopLayout>
    );
  }

  if (theme === 'terminal') {
    return (
      <TerminalLayout currentPage={currentPage} onNavigate={handleNavigate}>
        {renderTerminalPage()}
      </TerminalLayout>
    );
  }

  return (
    <Layout currentPage={currentPage} onNavigate={handleNavigate} onScan={handleScan}>
      {renderTacticalPage()}
    </Layout>
  );
}

export default App;
