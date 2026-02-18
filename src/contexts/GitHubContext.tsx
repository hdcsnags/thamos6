import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface ContextFile {
  repoFullName: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha: string;
  content: string;
  pinnedAt: number;
}

export interface ActiveProject {
  repoFullName: string;
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
}

interface GitHubContextValue {
  ghToken: string | null;
  setGhToken: (token: string | null) => void;
  contextFiles: ContextFile[];
  pinFile: (file: ContextFile) => void;
  unpinFile: (path: string) => void;
  clearContext: () => void;
  activeProject: ActiveProject | null;
  setActiveProject: (project: ActiveProject | null) => void;
}

const GitHubContext = createContext<GitHubContextValue | null>(null);

export function GitHubProvider({ children }: { children: ReactNode }) {
  const [ghToken, setGhToken] = useState<string | null>(null);
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null);

  const pinFile = useCallback((file: ContextFile) => {
    setContextFiles(prev => {
      const existing = prev.findIndex(f => f.path === file.path && f.repoFullName === file.repoFullName);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = file;
        return updated;
      }
      return [...prev, file];
    });
  }, []);

  const unpinFile = useCallback((path: string) => {
    setContextFiles(prev => prev.filter(f => f.path !== path));
  }, []);

  const clearContext = useCallback(() => {
    setContextFiles([]);
  }, []);

  return (
    <GitHubContext.Provider value={{
      ghToken,
      setGhToken,
      contextFiles,
      pinFile,
      unpinFile,
      clearContext,
      activeProject,
      setActiveProject,
    }}>
      {children}
    </GitHubContext.Provider>
  );
}

export function useGitHub() {
  const ctx = useContext(GitHubContext);
  if (!ctx) throw new Error('useGitHub must be used within GitHubProvider');
  return ctx;
}
