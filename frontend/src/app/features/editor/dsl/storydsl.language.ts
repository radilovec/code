declare const monaco: typeof import('monaco-editor');

const LANGUAGE_ID = 'storydsl';

export function registerStoryDsl(): void {
  if (monaco.languages.getLanguages().some(l => l.id === LANGUAGE_ID)) {
    return;
  }

  monaco.languages.register({ id: LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    keywords: [
      'scene', 'choice', 'if', 'else', 'set', 'when',
      'character', 'video', 'text', 'description', 'from', 'to',
    ],
    booleans: ['true', 'false'],
    operators: ['==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '->'],
    logicals: ['and', 'or', 'not'],

    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/"[^"]*"/, 'string'],
        [/\b(true|false)\b/, 'boolean'],
        [/\b\d+(\.\d+)?\b/, 'number'],
        [/->/, 'operator.arrow'],
        [/[=<>!]=?|[+\-*/]/, 'operator'],
        [/[{}()]/, 'delimiter'],
        [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, {
          cases: {
            '@keywords': 'keyword',
            '@logicals': 'keyword.logical',
            '@default': 'identifier',
          },
        }],
      ],
    },
  } as never);

  monaco.editor.defineTheme('storydsl-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c586c0', fontStyle: 'bold' },
      { token: 'keyword.logical', foreground: 'c586c0' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'boolean', foreground: 'b5cea8' },
      { token: 'identifier', foreground: '9cdcfe' },
      { token: 'operator', foreground: 'c8c8c8' },
      { token: 'operator.arrow', foreground: 'dcdcaa' },
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'delimiter', foreground: 'c8c8c8' },
    ],
    colors: {
      'editor.background': '#0f1117',
      'editor.foreground': '#e0e0e0',
      'editor.lineHighlightBackground': '#1a1d27',
      'editor.selectionBackground': '#2a4a7a55',
      'editorLineNumber.foreground': '#4a4f5c',
      'editorLineNumber.activeForeground': '#8b8fa3',
      'editorCursor.foreground': '#6c8cff',
      'editor.selectionHighlightBackground': '#2a4a7a33',
    },
  });
}
