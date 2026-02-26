import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  cyan: '#00d9ff',
  green: '#00ff9d',
  amber: '#fbbf24',
  rose: '#f43f5e',
  teal: '#2dd4bf',
  blue: '#00b4d8',
};

export const thamosEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: P.void,
    color: P.textLight,
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    height: '100%',
  },
  '.cm-content': {
    caretColor: P.cyan,
    padding: '8px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: P.cyan,
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: `${P.cyan}20 !important`,
  },
  '.cm-activeLine': {
    backgroundColor: `${P.surfaceLight}80`,
  },
  '.cm-gutters': {
    backgroundColor: P.surface,
    color: P.dim,
    border: 'none',
    borderRight: `1px solid ${P.border}`,
  },
  '.cm-activeLineGutter': {
    backgroundColor: P.surfaceLight,
    color: P.text,
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 12px 0 8px',
    minWidth: '40px',
    fontSize: '11px',
  },
  '.cm-matchingBracket': {
    backgroundColor: `${P.cyan}30`,
    outline: `1px solid ${P.cyan}50`,
  },
  '.cm-searchMatch': {
    backgroundColor: `${P.amber}30`,
    outline: `1px solid ${P.amber}50`,
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: `${P.amber}50`,
  },
  '.cm-foldPlaceholder': {
    backgroundColor: P.surfaceLight,
    border: `1px solid ${P.border}`,
    color: P.dim,
  },
  '.cm-tooltip': {
    backgroundColor: P.surface,
    border: `1px solid ${P.border}`,
    color: P.textLight,
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li[aria-selected]': {
      backgroundColor: `${P.cyan}15`,
      color: P.textLight,
    },
  },
  '.cm-panels': {
    backgroundColor: P.surface,
    color: P.textLight,
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: `1px solid ${P.border}`,
  },
  '.cm-panel.cm-search': {
    backgroundColor: P.surface,
    padding: '6px 8px',
  },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': {
    color: P.textLight,
    backgroundColor: P.surfaceLight,
    border: `1px solid ${P.border}`,
    borderRadius: '3px',
    fontSize: '12px',
    padding: '2px 6px',
  },
  '.cm-panel.cm-search button': {
    cursor: 'pointer',
  },
  '.cm-panel.cm-search button:hover': {
    backgroundColor: `${P.cyan}15`,
  },
  '.cm-panel.cm-search label': {
    color: P.text,
    fontSize: '12px',
  },
}, { dark: true });

export const thamosSyntaxHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: P.rose },
    { tag: tags.operator, color: P.rose },
    { tag: tags.special(tags.variableName), color: P.cyan },
    { tag: tags.typeName, color: P.teal },
    { tag: tags.atom, color: P.amber },
    { tag: tags.number, color: P.amber },
    { tag: tags.bool, color: P.amber },
    { tag: tags.definition(tags.variableName), color: P.textLight },
    { tag: tags.string, color: P.green },
    { tag: tags.special(tags.string), color: P.green },
    { tag: tags.comment, color: P.dim, fontStyle: 'italic' },
    { tag: tags.variableName, color: P.textLight },
    { tag: tags.function(tags.variableName), color: P.blue },
    { tag: tags.tagName, color: P.rose },
    { tag: tags.attributeName, color: P.amber },
    { tag: tags.attributeValue, color: P.green },
    { tag: tags.propertyName, color: P.cyan },
    { tag: tags.className, color: P.teal },
    { tag: tags.regexp, color: P.amber },
    { tag: tags.escape, color: P.amber },
    { tag: tags.meta, color: P.dim },
    { tag: tags.bracket, color: P.text },
    { tag: tags.punctuation, color: P.text },
    { tag: tags.self, color: P.rose },
    { tag: tags.null, color: P.amber },
    { tag: tags.processingInstruction, color: P.dim },
    { tag: tags.heading, color: P.textLight, fontWeight: 'bold' },
    { tag: tags.link, color: P.cyan, textDecoration: 'underline' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strong, fontWeight: 'bold' },
  ])
);
