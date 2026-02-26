import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { go } from '@codemirror/lang-go';
import type { Extension } from '@codemirror/state';

const EXT_MAP: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true, jsx: false }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript({ jsx: false }),
  jsx: () => javascript({ jsx: true }),
  py: () => python(),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  scss: () => css(),
  json: () => json(),
  md: () => markdown(),
  sql: () => sql(),
  xml: () => xml(),
  svg: () => xml(),
  rs: () => rust(),
  c: () => cpp(),
  cpp: () => cpp(),
  h: () => cpp(),
  hpp: () => cpp(),
  java: () => java(),
  go: () => go(),
  yaml: () => markdown(),
  yml: () => markdown(),
  toml: () => markdown(),
  sh: () => markdown(),
  bash: () => markdown(),
  dockerfile: () => markdown(),
};

export function getLanguageExtension(filename: string): Extension | null {
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile' || lower === 'makefile') {
    return EXT_MAP['dockerfile']?.() || null;
  }
  const ext = lower.split('.').pop() || '';
  return EXT_MAP[ext]?.() || null;
}

export function detectFileLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop() || '';
  const langMap: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript (JSX)', js: 'JavaScript', jsx: 'JavaScript (JSX)',
    py: 'Python', html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS',
    json: 'JSON', md: 'Markdown', sql: 'SQL', xml: 'XML', svg: 'SVG',
    rs: 'Rust', c: 'C', cpp: 'C++', h: 'C Header', hpp: 'C++ Header',
    java: 'Java', go: 'Go', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
    sh: 'Shell', bash: 'Bash', dockerfile: 'Docker',
  };
  if (lower === 'dockerfile') return 'Docker';
  if (lower === 'makefile') return 'Makefile';
  return langMap[ext] || 'Plain Text';
}
