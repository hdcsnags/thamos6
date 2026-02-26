import { useRef, useEffect, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { thamosEditorTheme, thamosSyntaxHighlight } from './editorTheme';
import { getLanguageExtension } from './editorLanguages';

interface CodeMirrorEditorProps {
  value: string;
  filename: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function CodeMirrorEditor({ value, filename, onChange, readOnly = false }: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const createState = useCallback((doc: string) => {
    const langExt = getLanguageExtension(filename);
    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      rectangularSelection(),
      highlightSpecialChars(),
      history(),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      autocompletion(),
      highlightSelectionMatches(),
      foldGutter(),
      thamosEditorTheme,
      thamosSyntaxHighlight,
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        ...closeBracketsKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    if (langExt) extensions.push(langExt);
    if (readOnly) extensions.push(EditorState.readOnly.of(true));

    return EditorState.create({ doc, extensions });
  }, [filename, readOnly]);

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: createState(value),
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.setState(createState(value));
    }
  }, [value, createState]);

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', overflow: 'auto' }}
    />
  );
}
