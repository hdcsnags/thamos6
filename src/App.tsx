import { useState } from 'react';
import Layout, { type Page } from './components/Layout';
import Scanner from './pages/Scanner';
import IPResult from './pages/results/IPResult';
import URLResult from './pages/results/URLResult';
import DomainResult from './pages/results/DomainResult';
import HashResult from './pages/results/HashResult';
import ExtensionResult from './pages/results/ExtensionResult';
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

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('scanner');
  const [scanResult, setScanResult] = useState<{ type: string; value: string } | null>(null);

  const handleScan = (type: string, value: string) => {
    setScanResult({ type, value });
  };

  const handleNavigate = (page: Page) => {
    if (page !== 'scanner') {
      setScanResult(null);
    }
    setCurrentPage(page);
  };

  const renderPage = () => {
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
          return <ExtensionResult extensionId={scanResult.value} />;
        default:
          return <Scanner onScan={handleScan} />;
      }
    }

    switch (currentPage) {
      case 'scanner':
        return <Scanner onScan={handleScan} />;
      case 'ip':
        return <IPLookup />;
      case 'url':
        return <URLScanner />;
      case 'bulk':
        return <BulkLookup />;
      case 'history':
        return <History />;
      case 'email':
        return <EmailAnalyzer />;
      case 'ioc':
        return <IOCExtractor />;
      case 'hash':
        return <HashLookup />;
      case 'domain':
        return <DomainIntel />;
      case 'extension':
        return <ExtensionScanner />;
      case 'defang':
        return <DefangTool />;
      case 'decoder':
        return <DecoderTool />;
      case 'cases':
        return <CaseNotes />;
      case 'news':
        return <NewsFeed />;
      case 'settings':
        return <Settings />;
      case 'admin':
        return <Admin />;
      default:
        return <Scanner onScan={handleScan} />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={handleNavigate} onScan={handleScan}>
      {renderPage()}
    </Layout>
  );
}

export default App;
