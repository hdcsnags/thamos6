import { supabase } from './supabase';

const GITHUB_PROXY = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-proxy`;

async function getSessionToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;

  if (session) {
    const expiresAt = session.expires_at ?? 0;
    const nowSecs = Math.floor(Date.now() / 1000);
    if (expiresAt - nowSecs < 120) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error) {
        throw new Error('Session expired. Please sign in again.');
      }
      if (refreshed.session) session = refreshed.session;
    }
  }

  if (!session?.access_token) {
    throw new Error('Not authenticated with Supabase. Please sign in first.');
  }
  return session.access_token;
}

async function ghFetch(token: string, path: string, accept?: string): Promise<Response> {
  const sessionToken = await getSessionToken();
  const url = new URL(GITHUB_PROXY);
  url.searchParams.set('path', path);
  if (accept) url.searchParams.set('accept', accept);

  return fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'X-GitHub-Token': token,
    },
  });
}

async function ghPut(token: string, path: string, body: unknown): Promise<Response> {
  const sessionToken = await getSessionToken();
  const url = new URL(GITHUB_PROXY);
  url.searchParams.set('path', path);

  return fetch(url.toString(), {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'X-GitHub-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  name: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  default_branch: string;
  fork: boolean;
  owner: { login: string; avatar_url: string };
}

export interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  html_url: string;
  download_url: string | null;
  content?: string;
  encoding?: string;
}

export async function fetchUser(token: string): Promise<GitHubUser> {
  const res = await ghFetch(token, '/user');
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

export async function fetchRepos(
  token: string,
  page = 1,
  sort: 'updated' | 'pushed' | 'full_name' = 'updated'
): Promise<GitHubRepo[]> {
  const res = await ghFetch(
    token,
    `/user/repos?per_page=50&page=${page}&sort=${sort}&affiliation=owner,collaborator,organization_member`
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

export async function fetchContents(
  token: string,
  owner: string,
  repo: string,
  path = ''
): Promise<GitHubContent[]> {
  const encodedPath = path ? `/${path.split('/').map(encodeURIComponent).join('/')}` : '';
  const res = await ghFetch(token, `/repos/${owner}/${repo}/contents${encodedPath}`);
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

export async function fetchFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<string> {
  const res = await ghFetch(
    token,
    `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
    'application/vnd.github.raw+json'
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.text();
}

export async function searchRepos(
  token: string,
  query: string
): Promise<GitHubRepo[]> {
  const res = await ghFetch(
    token,
    `/search/repositories?q=${encodeURIComponent(query)}+in:name&per_page=20&sort=updated`
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

export interface CommitResult {
  sha: string;
  html_url: string;
}

export async function fetchFileMeta(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<{ sha: string }> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${encodedPath}`);
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) throw new Error('Path is a directory, not a file');
  return { sha: data.sha };
}

export async function commitFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string,
  message: string,
  branch: string
): Promise<CommitResult> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const encoded = btoa(unescape(encodeURIComponent(content)));

  const res = await ghPut(token, `/repos/${owner}/${repo}/contents/${encodedPath}`, {
    message,
    content: encoded,
    sha,
    branch,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${res.status}`);
  }

  const data = await res.json();
  return {
    sha: data.content?.sha || '',
    html_url: data.content?.html_url || '',
  };
}

const EXT_LANGS: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
  swift: 'swift', kt: 'kotlin', sql: 'sql', sh: 'bash', bash: 'bash',
  yml: 'yaml', yaml: 'yaml', json: 'json', xml: 'xml', html: 'html',
  css: 'css', scss: 'scss', md: 'markdown', toml: 'toml', dockerfile: 'dockerfile',
};

export function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  const ext = lower.split('.').pop() || '';
  return EXT_LANGS[ext] || 'text';
}

export function isTextFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  const binaryExts = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg',
    'mp3', 'mp4', 'wav', 'avi', 'mov', 'webm',
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2',
    'exe', 'dll', 'so', 'dylib', 'bin',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'woff', 'woff2', 'ttf', 'otf', 'eot',
  ]);
  const ext = lower.split('.').pop() || '';
  return !binaryExts.has(ext);
}
