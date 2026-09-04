import { useEffect, useState } from 'react';
import { Shield, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AnalysisResults from '../../components/extension/AnalysisResults';
import { palette, typography } from '../../design-system/tokens';

interface ExtensionResultProps {
  extensionId: string;
  onScan?: (type: string, value: string) => void;
}

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

export default function ExtensionResult({ extensionId }: ExtensionResultProps) {
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  useEffect(() => {
    const fetchOrAnalyze = async () => {
      setLoading(true);
      setError(null);

      try {
        // First, check if we have a recent analysis
        const { data: existingAnalysis } = await supabase
          .from('extension_analyses')
          .select('*')
          .eq('extension_id', extensionId)
          .order('analyzed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingAnalysis) {
          // Check if analysis is less than 24 hours old
          const analysisAge = Date.now() - new Date(existingAnalysis.analyzed_at).getTime();
          const twentyFourHours = 24 * 60 * 60 * 1000;

          if (analysisAge < twentyFourHours) {
            setAnalysis(existingAnalysis);
            setLoading(false);
            return;
          }
        }

        // If no recent analysis, trigger a new one
        setAnalyzing(true);
        const extensionUrl = `https://chromewebstore.google.com/detail/${extensionId}`;

        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-extension`;
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ extensionUrl }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Analysis failed');
        }

        // Fetch the newly created analysis
        const { data: newAnalysis } = await supabase
          .from('extension_analyses')
          .select('*')
          .eq('id', result.analysis_id)
          .single();

        if (newAnalysis) {
          setAnalysis(newAnalysis);
        }
      } catch (err) {
        console.error('Extension analysis error:', err);
        setError(err instanceof Error ? err.message : 'Failed to analyze extension');
      } finally {
        setLoading(false);
        setAnalyzing(false);
      }
    };

    fetchOrAnalyze();
  }, [extensionId]);

  if (loading || analyzing) {
    return (
      <div className="space-y-6" style={{ fontFamily: typography.ui }}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4" style={{ color: palette.accent }} />
            <p className="font-medium" style={{ color: palette.textSecondary }}>
              {analyzing ? 'Analyzing extension security...' : 'Loading analysis...'}
            </p>
            <p className="text-sm mt-2" style={{ color: palette.textTertiary }}>
              This may take 30-60 seconds
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="space-y-6" style={{ fontFamily: typography.ui }}>
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: `${palette.rose}1a`, border: `1px solid ${palette.rose}4d` }}
        >
          <AlertTriangle className="w-12 h-12 mx-auto mb-3" style={{ color: palette.rose }} />
          <p className="font-medium text-lg mb-2" style={{ color: palette.rose }}>
            {error || 'Failed to load extension analysis'}
          </p>
          <p className="text-sm" style={{ color: palette.textSecondary }}>
            Extension ID: <span style={{ fontFamily: typography.mono }}>{extensionId}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ fontFamily: typography.ui }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-8 h-8" style={{ color: palette.textTertiary }} />
        <div>
          <h1 className="text-3xl font-bold" style={{ color: palette.textPrimary }}>Extension Security Analysis</h1>
          <p style={{ color: palette.textSecondary }}>Analyzed {new Date(analysis.analyzed_at).toLocaleString()}</p>
        </div>
      </div>

      {/* Analysis Results Component */}
      <AnalysisResults analysis={analysis} />
    </div>
  );
}
