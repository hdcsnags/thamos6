import { useState } from 'react';
import Layout, { type Page } from './components/Layout';
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
import IntelHub from './pages/IntelHub';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('intel');

  const renderPage = () => {
    switch (currentPage) {
      case 'intel':
        return <IntelHub />;
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
        return <IntelHub />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

export default App;
