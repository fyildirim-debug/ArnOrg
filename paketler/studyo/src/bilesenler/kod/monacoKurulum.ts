// Monaco yerel paketten yüklenir (CDN yok); çalışanlar Vite ?worker ile derlenir; FY teması tanımlanır
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorCalisani from "monaco-editor/editor/editor.worker?worker";
import JsonCalisani from "monaco-editor/language/json/json.worker?worker";
import CssCalisani from "monaco-editor/language/css/css.worker?worker";
import HtmlCalisani from "monaco-editor/language/html/html.worker?worker";
import TsCalisani from "monaco-editor/language/typescript/ts.worker?worker";

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

self.MonacoEnvironment = {
  getWorker(_kimlik: string, etiket: string) {
    switch (etiket) {
      case "json":
        return new JsonCalisani();
      case "css":
      case "scss":
      case "less":
        return new CssCalisani();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlCalisani();
      case "typescript":
      case "javascript":
        return new TsCalisani();
      default:
        return new EditorCalisani();
    }
  },
};

loader.config({ monaco });

export const TEMA = "arnorg-fy";

monaco.editor.defineTheme(TEMA, {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "f2f0ec", background: "0a0a0b" },
    { token: "comment", foreground: "7d7871", fontStyle: "italic" },
    { token: "keyword", foreground: "f27a68" },
    { token: "keyword.control", foreground: "f27a68" },
    { token: "storage", foreground: "f27a68" },
    { token: "string", foreground: "b9d39b" },
    { token: "string.escape", foreground: "e3b37f" },
    { token: "regexp", foreground: "b9d39b" },
    { token: "number", foreground: "eccb72" },
    { token: "type", foreground: "9ec7e3" },
    { token: "type.identifier", foreground: "9ec7e3" },
    { token: "identifier", foreground: "f2f0ec" },
    { token: "tag", foreground: "e3b37f" },
    { token: "attribute.name", foreground: "e3b37f" },
    { token: "attribute.value", foreground: "b9d39b" },
    { token: "delimiter", foreground: "a19c94" },
    { token: "delimiter.bracket", foreground: "c9c4bb" },
    { token: "key", foreground: "9ec7e3" },
    { token: "string.key.json", foreground: "9ec7e3" },
    { token: "string.value.json", foreground: "b9d39b" },
    { token: "keyword.md", foreground: "f27a68" },
    { token: "emphasis", fontStyle: "italic" },
    { token: "strong", fontStyle: "bold" },
  ],
  colors: {
    "editor.background": "#0a0a0b",
    "editor.foreground": "#f2f0ec",
    "editorLineNumber.foreground": "#4d4a46",
    "editorLineNumber.activeForeground": "#a19c94",
    "editor.lineHighlightBackground": "#f2f0ec08",
    "editor.lineHighlightBorder": "#00000000",
    "editor.selectionBackground": "#f27a6840",
    "editor.inactiveSelectionBackground": "#f27a6822",
    "editor.selectionHighlightBackground": "#f2f0ec12",
    "editor.wordHighlightBackground": "#f2f0ec10",
    "editor.findMatchBackground": "#eccb7255",
    "editor.findMatchHighlightBackground": "#eccb7228",
    "editorCursor.foreground": "#f27a68",
    "editorIndentGuide.background1": "#f2f0ec10",
    "editorIndentGuide.activeBackground1": "#f2f0ec30",
    "editorWhitespace.foreground": "#f2f0ec18",
    "editorWidget.background": "#0f0f11",
    "editorWidget.border": "#f2f0ec38",
    "editorSuggestWidget.background": "#0f0f11",
    "editorSuggestWidget.border": "#f2f0ec38",
    "editorSuggestWidget.selectedBackground": "#222226",
    "editorSuggestWidget.highlightForeground": "#f27a68",
    "editorHoverWidget.background": "#0f0f11",
    "editorHoverWidget.border": "#f2f0ec38",
    "editorGutter.background": "#0a0a0b",
    "editorError.foreground": "#f07c6c",
    "editorWarning.foreground": "#eccb72",
    "editorInfo.foreground": "#9ec7e3",
    "editorBracketMatch.background": "#f27a6822",
    "editorBracketMatch.border": "#f27a6880",
    "editorOverviewRuler.border": "#00000000",
    "editorStickyScroll.background": "#0f0f11",
    "scrollbarSlider.background": "#2e2e3399",
    "scrollbarSlider.hoverBackground": "#77726b99",
    "scrollbarSlider.activeBackground": "#a19c9499",
    "minimap.background": "#0a0a0b",
    focusBorder: "#f27a68",
    "input.background": "#0a0a0b",
    "input.border": "#f2f0ec38",
    "inputOption.activeBorder": "#f27a68",
    "list.activeSelectionBackground": "#222226",
    "list.focusBackground": "#222226",
    "list.hoverBackground": "#161619",
    "list.highlightForeground": "#f27a68",
    "widget.shadow": "#00000000",
  },
});

// Proje bağlamı (node_modules, tsconfig) editörde yok; anlamsal tanılama yerine yalnız sözdizimi denetlenir
for (const varsayilan of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
  varsayilan.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  varsayilan.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    jsx: monaco.typescript.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
  });
}

// Yazı tipi geç yüklenirse ölçüler yeniden alınır
void document.fonts?.ready.then(() => monaco.editor.remeasureFonts());

export { monaco };

export const EDITOR_SECENEKLERI: monaco.editor.IStandaloneEditorConstructionOptions = {
  fontFamily: '"IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace',
  fontSize: 13,
  lineHeight: 21,
  fontLigatures: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: "line",
  smoothScrolling: true,
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  padding: { top: 10, bottom: 10 },
  tabSize: 2,
  automaticLayout: true,
  stickyScroll: { enabled: true },
  bracketPairColorization: { enabled: false },
  guides: { indentation: true },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  fixedOverflowWidgets: true,
};

/** Çalışma alanı + yol için model adresi */
export function modelAdresi(alan: string, yol: string): monaco.Uri {
  return monaco.Uri.from({ scheme: "file", path: `/${encodeURIComponent(alan)}/${yol}` });
}

/** Sunucunun verdiği dil kimliği Monaco'da yoksa düz metne düşer */
export function dilKimligi(dil: string): string {
  const diller = monaco.languages.getLanguages().map((l) => l.id);
  return diller.includes(dil) ? dil : "plaintext";
}

export function dilAdi(dil: string): string {
  const l = monaco.languages.getLanguages().find((x) => x.id === dil);
  return l?.aliases?.[0] ?? dil;
}
