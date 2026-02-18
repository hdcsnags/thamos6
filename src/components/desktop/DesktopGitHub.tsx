import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { palette, typography } from '../../design-system/tokens';
import {
  fetchUser, fetchRepos, fetchContents, fetchFileContent,
  searchRepos, detectLanguage, isTextFile,
  type GitHubUser, type GitHubRepo, type GitHubContent,
} from '../../lib/github';
import { GitHubFileViewer } from './GitHubFileViewer';
import { useGitHub } from '../../contexts/GitHubContext';

type View = 'connect' | 'repos' | 'files' | 'file';

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  teal: palette.teal,
  cyan: palette.cyan,
  green: palette.green,
  amber: palette.amber,
  rose: palette.rose,
};

export function DesktopGitHub() {
  const { session, signInWithGitHub, providerToken } = useAuth();
  const { ghToken, setGhToken, pinFile, setActiveProject } = useGitHub();
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [view, setView] = useState<View>('connect');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [contents, setContents] = useState<GitHubContent[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [fileContent, setFileContent] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [currentFileSha, setCurrentFileSha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
  const [manualToken, setManualToken] = useState('');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (providerToken) {
      setGhToken(providerToken);
    }
  }, [providerToken]);

  useEffect(() => {
    if (!ghToken) {
      setView('connect');
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([fetchUser(ghToken), fetchRepos(ghToken)])
      .then(([user, repos]) => {
        setGhUser(user);
        setRepos(repos);
        setFilteredRepos(repos);
        setView('repos');
      })
      .catch(err => {
        setError(err.message);
        setGhToken(null);
        setView('connect');
      })
      .finally(() => setLoading(false));
  }, [ghToken]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredRepos(repos);
      return;
    }
    const q = search.toLowerCase();
    const local = repos.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q)
    );
    setFilteredRepos(local);

    if (ghToken && local.length < 3) {
      const timer = setTimeout(() => {
        searchRepos(ghToken, search).then(results => {
          const merged = [...local];
          for (const r of results) {
            if (!merged.find(m => m.id === r.id)) merged.push(r);
          }
          setFilteredRepos(merged);
        }).catch(() => {});
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [search, repos, ghToken]);

  const openRepo = useCallback(async (repo: GitHubRepo) => {
    if (!ghToken) return;
    setLoading(true);
    setError(null);
    setSelectedRepo(repo);
    setCurrentPath('');
    setPathHistory([]);
    setActiveProject({
      repoFullName: repo.full_name,
      owner: repo.owner.login,
      repo: repo.name,
      branch: repo.default_branch,
      defaultBranch: repo.default_branch,
    });
    try {
      const data = await fetchContents(ghToken, repo.owner.login, repo.name);
      setContents(sortContents(data));
      setView('files');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repo');
    } finally {
      setLoading(false);
    }
  }, [ghToken, setActiveProject]);

  const navigateDir = useCallback(async (path: string) => {
    if (!ghToken || !selectedRepo) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchContents(ghToken, selectedRepo.owner.login, selectedRepo.name, path);
      setPathHistory(prev => [...prev, currentPath]);
      setCurrentPath(path);
      setContents(sortContents(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [ghToken, selectedRepo, currentPath]);

  const openFile = useCallback(async (item: GitHubContent) => {
    if (!ghToken || !selectedRepo) return;
    if (!isTextFile(item.name)) {
      window.open(item.html_url, '_blank');
      return;
    }
    setLoading(true);
    setError(null);
    setPinned(false);
    try {
      const content = await fetchFileContent(ghToken, selectedRepo.owner.login, selectedRepo.name, item.path);
      setFileContent(content);
      setCurrentFile(item.path);
      setCurrentFileSha(item.sha);
      setView('file');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [ghToken, selectedRepo]);

  const goBack = useCallback(() => {
    if (view === 'file') {
      setView('files');
      return;
    }
    if (pathHistory.length > 0) {
      const prev = pathHistory[pathHistory.length - 1];
      setPathHistory(h => h.slice(0, -1));
      if (!ghToken || !selectedRepo) return;
      setLoading(true);
      fetchContents(ghToken, selectedRepo.owner.login, selectedRepo.name, prev)
        .then(data => {
          setCurrentPath(prev);
          setContents(sortContents(data));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else if (view === 'files') {
      setView('repos');
      setSelectedRepo(null);
    }
  }, [view, pathHistory, ghToken, selectedRepo]);

  const handleConnect = useCallback(async () => {
    if (manualToken.trim()) {
      setGhToken(manualToken.trim());
      return;
    }
    try {
      await signInWithGitHub();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [signInWithGitHub, manualToken]);

  const disconnect = useCallback(() => {
    setGhToken(null);
    setGhUser(null);
    setRepos([]);
    setFilteredRepos([]);
    setSelectedRepo(null);
    setContents([]);
    setView('connect');
    setManualToken('');
    setActiveProject(null);
  }, [setGhToken, setActiveProject]);

  const handleSendToAgent = useCallback(() => {
    if (!selectedRepo || !currentFile || !fileContent) return;
    pinFile({
      repoFullName: selectedRepo.full_name,
      owner: selectedRepo.owner.login,
      repo: selectedRepo.name,
      branch: selectedRepo.default_branch,
      path: currentFile,
      sha: currentFileSha,
      content: fileContent,
      pinnedAt: Date.now(),
    });
    setPinned(true);
  }, [selectedRepo, currentFile, currentFileSha, fileContent, pinFile]);

  if (view === 'connect') {
    return <ConnectView
      loading={loading}
      error={error}
      session={!!session}
      manualToken={manualToken}
      onManualTokenChange={setManualToken}
      onConnect={handleConnect}
    />;
  }

  if (view === 'file' && selectedRepo) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: P.void }}>
        <Toolbar
          ghUser={ghUser}
          selectedRepo={selectedRepo}
          currentPath={currentFile}
          view={view}
          onBack={goBack}
          onDisconnect={disconnect}
          onGoToRepos={() => { setView('repos'); setSelectedRepo(null); }}
        />
        <GitHubFileViewer
          content={fileContent}
          filename={currentFile.split('/').pop() || ''}
          language={detectLanguage(currentFile)}
          htmlUrl={`${selectedRepo.html_url}/blob/${selectedRepo.default_branch}/${currentFile}`}
          onSendToAgent={handleSendToAgent}
          pinned={pinned}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void }}>
      <Toolbar
        ghUser={ghUser}
        selectedRepo={selectedRepo}
        currentPath={currentPath}
        view={view}
        onBack={goBack}
        onDisconnect={disconnect}
        onGoToRepos={() => { setView('repos'); setSelectedRepo(null); }}
      />

      {error && (
        <div className="px-3 py-2" style={{ backgroundColor: `${P.rose}10`, borderBottom: `1px solid ${P.rose}30` }}>
          <span className="text-xs" style={{ color: P.rose }}>{error}</span>
        </div>
      )}

      {loading && (
        <div className="px-3 py-2" style={{ borderBottom: `1px solid ${P.border}` }}>
          <div className="h-0.5 rounded overflow-hidden" style={{ backgroundColor: P.border }}>
            <div className="h-full rounded animate-pulse" style={{ width: '60%', backgroundColor: P.teal }} />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {view === 'repos' && (
          <RepoList
            repos={filteredRepos}
            search={search}
            onSearchChange={setSearch}
            onSelectRepo={openRepo}
          />
        )}
        {view === 'files' && (
          <FileList
            contents={contents}
            onNavigateDir={navigateDir}
            onOpenFile={openFile}
          />
        )}
      </div>
    </div>
  );
}

function ConnectView({
  loading, error, session, manualToken, onManualTokenChange, onConnect,
}: {
  loading: boolean;
  error: string | null;
  session: boolean;
  manualToken: string;
  onManualTokenChange: (v: string) => void;
  onConnect: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6" style={{ backgroundColor: P.void, fontFamily: typography.ui }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ backgroundColor: `${P.teal}0a`, border: `1px solid ${P.teal}20` }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={P.teal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
        </svg>
      </div>
      <span className="text-sm font-medium mb-1" style={{ color: P.textLight }}>GitHub Code Browser</span>
      <span className="text-xs mb-6 text-center max-w-xs" style={{ color: P.dim }}>
        Browse and view repository files. Connect with GitHub OAuth or paste a personal access token.
      </span>

      {error && (
        <div className="mb-4 px-3 py-2 rounded w-full max-w-xs" style={{ backgroundColor: `${P.rose}10`, border: `1px solid ${P.rose}30` }}>
          <span className="text-xs" style={{ color: P.rose }}>{error}</span>
        </div>
      )}

      <div className="w-full max-w-xs space-y-3">
        {session && (
          <button
            onClick={onConnect}
            disabled={loading || !!manualToken.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: `${P.teal}12`,
              border: `1px solid ${P.teal}40`,
              color: P.teal,
              opacity: manualToken.trim() ? 0.4 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            {loading ? 'CONNECTING...' : 'CONNECT WITH GITHUB'}
          </button>
        )}

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ backgroundColor: P.border }} />
          <span className="text-xs" style={{ color: P.dim, fontFamily: typography.mono }}>or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: P.border }} />
        </div>

        <div className="space-y-2">
          <input
            type="password"
            value={manualToken}
            onChange={e => onManualTokenChange(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxx"
            className="w-full px-3 py-2 text-xs rounded focus:outline-none"
            style={{
              backgroundColor: P.surfaceLight,
              border: `1px solid ${P.border}`,
              color: P.textLight,
              fontFamily: typography.mono,
            }}
          />
          {manualToken.trim() && (
            <button
              onClick={onConnect}
              disabled={loading}
              className="w-full py-2 text-xs font-medium rounded transition-all"
              style={{
                backgroundColor: `${P.teal}12`,
                border: `1px solid ${P.teal}40`,
                color: P.teal,
              }}
            >
              {loading ? 'CONNECTING...' : 'USE TOKEN'}
            </button>
          )}
        </div>

        <div className="pt-2">
          <span className="text-xs" style={{ color: P.dim, lineHeight: '1.5' }}>
            Token needs <span style={{ color: P.text }}>repo</span> and <span style={{ color: P.text }}>read:user</span> scopes.{' '}
            <a href="https://github.com/settings/tokens/new?scopes=repo,read:user" target="_blank" rel="noopener noreferrer"
              style={{ color: P.teal, textDecoration: 'none' }}
            >Generate one</a>
          </span>
        </div>
      </div>
    </div>
  );
}

function Toolbar({
  ghUser, selectedRepo, currentPath, view, onBack, onDisconnect, onGoToRepos,
}: {
  ghUser: GitHubUser | null;
  selectedRepo: GitHubRepo | null;
  currentPath: string;
  view: View;
  onBack: () => void;
  onDisconnect: () => void;
  onGoToRepos: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2" style={{
      backgroundColor: P.surface,
      borderBottom: `1px solid ${P.border}`,
      fontFamily: typography.mono,
    }}>
      {view !== 'repos' && (
        <button
          onClick={onBack}
          className="p-1 rounded transition-colors"
          style={{ color: P.text }}
          title="Back"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      <div className="flex items-center gap-1.5 flex-1 min-w-0 text-xs">
        {ghUser && (
          <button onClick={onGoToRepos} className="flex items-center gap-1 hover:opacity-80 transition-opacity" style={{ color: P.teal }}>
            <img src={ghUser.avatar_url} alt="" className="w-4 h-4 rounded-full" />
            <span>{ghUser.login}</span>
          </button>
        )}
        {selectedRepo && (
          <>
            <span style={{ color: P.dim }}>/</span>
            <button onClick={() => { if (currentPath) onBack(); }} style={{ color: P.textLight }}>
              {selectedRepo.name}
            </button>
          </>
        )}
        {currentPath && (
          <>
            <span style={{ color: P.dim }}>/</span>
            <span className="truncate" style={{ color: P.text }}>{currentPath}</span>
          </>
        )}
      </div>

      <button
        onClick={onDisconnect}
        className="px-2 py-1 text-xs rounded transition-all"
        style={{ color: P.dim, border: `1px solid ${P.border}` }}
        title="Disconnect"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function RepoList({
  repos, search, onSearchChange, onSelectRepo,
}: {
  repos: GitHubRepo[];
  search: string;
  onSearchChange: (v: string) => void;
  onSelectRepo: (r: GitHubRepo) => void;
}) {
  return (
    <div>
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${P.border}` }}>
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search repositories..."
          className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
          style={{
            backgroundColor: P.surfaceLight,
            border: `1px solid ${P.border}`,
            color: P.textLight,
            fontFamily: typography.mono,
          }}
        />
      </div>
      <div>
        {repos.map(repo => (
          <button
            key={repo.id}
            onClick={() => onSelectRepo(repo)}
            className="w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors"
            style={{ borderBottom: `1px solid ${P.border}` }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = P.surfaceLight)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate" style={{ color: P.teal }}>{repo.name}</span>
                {repo.private && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${P.amber}15`, color: P.amber, fontSize: '9px' }}>
                    PRIVATE
                  </span>
                )}
                {repo.fork && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${P.dim}20`, color: P.dim, fontSize: '9px' }}>
                    FORK
                  </span>
                )}
              </div>
              {repo.description && (
                <span className="text-xs block truncate mt-0.5" style={{ color: P.dim }}>{repo.description}</span>
              )}
              <div className="flex items-center gap-3 mt-1">
                {repo.language && (
                  <span className="text-xs" style={{ color: P.text }}>
                    <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: langColor(repo.language) }} />
                    {repo.language}
                  </span>
                )}
                {repo.stargazers_count > 0 && (
                  <span className="text-xs" style={{ color: P.dim }}>
                    {repo.stargazers_count} stars
                  </span>
                )}
                <span className="text-xs" style={{ color: P.dim }}>
                  {formatDate(repo.updated_at)}
                </span>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={P.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-1 flex-shrink-0">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
        {repos.length === 0 && (
          <div className="px-3 py-8 text-center">
            <span className="text-xs" style={{ color: P.dim }}>No repositories found</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FileList({
  contents, onNavigateDir, onOpenFile,
}: {
  contents: GitHubContent[];
  onNavigateDir: (path: string) => void;
  onOpenFile: (item: GitHubContent) => void;
}) {
  return (
    <div>
      {contents.map(item => (
        <button
          key={item.sha}
          onClick={() => item.type === 'dir' ? onNavigateDir(item.path) : openFile(item)}
          className="w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors"
          style={{ borderBottom: `1px solid ${P.border}` }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = P.surfaceLight)}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          {item.type === 'dir' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill={`${P.teal}40`} stroke={P.teal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={P.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          )}
          <span className="text-xs flex-1 truncate" style={{ color: item.type === 'dir' ? P.teal : P.textLight, fontFamily: typography.mono }}>
            {item.name}
          </span>
          {item.type === 'file' && item.size > 0 && (
            <span className="text-xs flex-shrink-0" style={{ color: P.dim, fontSize: '10px' }}>
              {formatSize(item.size)}
            </span>
          )}
          {item.type === 'dir' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={P.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );

  function openFile(item: GitHubContent) {
    onOpenFile(item);
  }
}

function sortContents(items: GitHubContent[]): GitHubContent[] {
  return [...items].sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function langColor(lang: string): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
    Rust: '#dea584', Go: '#00ADD8', Java: '#b07219',
    'C++': '#f34b7d', C: '#555555', Ruby: '#701516',
    Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051',
    HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c',
  };
  return colors[lang] || P.dim;
}
