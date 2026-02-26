export interface EditorFile {
  id: string;
  filename: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  source: 'github' | 'local' | 'artifact';
  githubMeta?: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    sha: string;
  };
  createdAt: number;
}

const STORAGE_KEY = 'thamos-editor-files';

export function loadLocalFiles(): EditorFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLocalFiles(files: EditorFile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    // quota exceeded
  }
}

export function createNewFile(
  filename = 'untitled.ts',
  content = '',
  source: EditorFile['source'] = 'local'
): EditorFile {
  return {
    id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    filename,
    content,
    originalContent: content,
    isDirty: false,
    source,
    createdAt: Date.now(),
  };
}

export function createArtifactFile(filename: string, content: string): EditorFile {
  return {
    id: `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    filename,
    content,
    originalContent: content,
    isDirty: false,
    source: 'artifact',
    createdAt: Date.now(),
  };
}

export function createGitHubFile(
  filename: string,
  content: string,
  meta: EditorFile['githubMeta']
): EditorFile {
  return {
    id: `gh-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    filename,
    content,
    originalContent: content,
    isDirty: false,
    source: 'github',
    githubMeta: meta,
    createdAt: Date.now(),
  };
}
