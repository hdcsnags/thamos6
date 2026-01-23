import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Shield, AlertTriangle, Search, Clock, FileCode, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import AnalysisResults from './components/AnalysisResults';
import AnalysisHistory from './components/AnalysisHistory';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface Analysis {
  id: string;
  extension_id: string;
  extension_name: string;
  extension_version: string;
  extension_url: string;
  risk_score: number;
  risk_level: string;
  manifest_data: any;
  analysis_summary: string;
  analyzed_at: string;
}

function App() {
  const [extensionUrl, setExtensionUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<Analysis | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadRecentAnalyses();
  }, []);

  const loadRecentAnalyses = async () => {
    const { data, error } = await supabase
      .from('extension_analyses')
      .select('*')
      .order('analyzed_at', { ascending: false })
      .limit(10);

    if (data && !error) {
      setRecentAnalyses(data);
    }
  };

  const analyzeExtension = async () => {
    if (!extensionUrl.trim()) {
      setError('Please enter a Chrome Web Store URL');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setCurrentAnalysis(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-extension`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ extensionUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Analysis failed');
      }

      const { data: analysis } = await supabase
        .from('extension_analyses')
        .select('*')
        .eq('id', result.analysis_id)
        .single();

      if (analysis) {
        setCurrentAnalysis(analysis);
        loadRecentAnalyses();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze extension');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAnalyzing) {
      analyzeExtension();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-12 h-12 text-blue-600" />
            <h1 className="text-5xl font-bold text-slate-900">Extension Security Analyzer</h1>
          </div>
          <p className="text-lg text-slate-600">
            Analyze Chrome extensions for security risks, suspicious permissions, and malicious code patterns
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-slate-200">
          <div className="flex gap-4 items-start">
            <div className="flex-1">
              <label htmlFor="extension-url" className="block text-sm font-semibold text-slate-700 mb-2">
                Chrome Web Store URL
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  id="extension-url"
                  type="text"
                  value={extensionUrl}
                  onChange={(e) => setExtensionUrl(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="https://chromewebstore.google.com/detail/extension-name/abcdefghijklmnopqrstuvwxyz"
                  className="w-full pl-12 pr-4 py-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-slate-800 placeholder:text-slate-400"
                  disabled={isAnalyzing}
                />
              </div>
              {error && (
                <div className="mt-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            <div className="pt-7">
              <button
                onClick={analyzeExtension}
                disabled={isAnalyzing}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:shadow-none flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <FileCode className="w-5 h-5" />
                    Analyze
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {currentAnalysis && <AnalysisResults analysis={currentAnalysis} />}

        {recentAnalyses.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full px-8 py-6 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-slate-600" />
                <h2 className="text-2xl font-bold text-slate-900">Recent Analyses</h2>
                <span className="px-3 py-1 bg-slate-100 text-slate-700 text-sm font-semibold rounded-full">
                  {recentAnalyses.length}
                </span>
              </div>
              {showHistory ? (
                <ChevronUp className="w-6 h-6 text-slate-400" />
              ) : (
                <ChevronDown className="w-6 h-6 text-slate-400" />
              )}
            </button>

            {showHistory && (
              <div className="border-t border-slate-200">
                <AnalysisHistory analyses={recentAnalyses} onSelect={setCurrentAnalysis} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
