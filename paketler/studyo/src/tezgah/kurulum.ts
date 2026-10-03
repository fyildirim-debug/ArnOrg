// VS Code tezgâhının kurulumu: servisler, çalışanlar, varsayılan ayarlar, dosya sistemi, eklentiler.
// Bu modül Türkçe dil paketi yüklendikten sonra içe aktarılır (index.ts); tezgâh sayfa başına bir kez kurulur.
import "vscode/localExtensionHost";
import "@codingame/monaco-vscode-all-language-default-extensions";
import "@codingame/monaco-vscode-all-language-feature-default-extensions";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "@codingame/monaco-vscode-theme-seti-default-extension";
import "@codingame/monaco-vscode-theme-monokai-default-extension";
import "@codingame/monaco-vscode-theme-solarized-dark-default-extension";
import "@codingame/monaco-vscode-theme-solarized-light-default-extension";
import "@codingame/monaco-vscode-theme-quietlight-default-extension";
import "@codingame/monaco-vscode-theme-abyss-default-extension";
import "@codingame/monaco-vscode-theme-tomorrow-night-blue-default-extension";
import "@codingame/monaco-vscode-references-view-default-extension";
import "@codingame/monaco-vscode-media-preview-default-extension";
import "@codingame/monaco-vscode-merge-conflict-default-extension";

import { getService, IEditorService, initialize, IWorkbenchLayoutService, LogLevel, StandaloneServices } from "@codingame/monaco-vscode-api";
import type { IMonacoEnvironment } from "@codingame/monaco-vscode-api/vscode/vs/base/browser/browser";
import { isCancellationError } from "@codingame/monaco-vscode-api/vscode/vs/base/common/errors";
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import { ColorScheme } from "@codingame/monaco-vscode-api/vscode/vs/platform/theme/common/theme";
import type { IWorkbenchConstructionOptions } from "@codingame/monaco-vscode-api/vscode/vs/workbench/browser/web.api";
import { EditorResourceAccessor, SideBySideEditor } from "@codingame/monaco-vscode-api/vscode/vs/workbench/common/editor";
import getAccessibilityServiceOverride from "@codingame/monaco-vscode-accessibility-service-override";
import getAuthenticationServiceOverride from "@codingame/monaco-vscode-authentication-service-override";
import getConfigurationServiceOverride from "@codingame/monaco-vscode-configuration-service-override";
import getDialogsServiceOverride from "@codingame/monaco-vscode-dialogs-service-override";
import getEmmetServiceOverride from "@codingame/monaco-vscode-emmet-service-override";
import getEnvironmentServiceOverride from "@codingame/monaco-vscode-environment-service-override";
import getExplorerServiceOverride from "@codingame/monaco-vscode-explorer-service-override";
import getExtensionGalleryServiceOverride from "@codingame/monaco-vscode-extension-gallery-service-override";
import getExtensionServiceOverride from "@codingame/monaco-vscode-extensions-service-override";
import { createIndexedDBProviders, initFile, registerCustomProvider } from "@codingame/monaco-vscode-files-service-override";
import getKeybindingsServiceOverride, { initUserKeybindings } from "@codingame/monaco-vscode-keybindings-service-override";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import getLifecycleServiceOverride from "@codingame/monaco-vscode-lifecycle-service-override";
import getLocalizationServiceOverride from "@codingame/monaco-vscode-localization-service-override";
import getLogServiceOverride from "@codingame/monaco-vscode-log-service-override";
import getMarkersServiceOverride from "@codingame/monaco-vscode-markers-service-override";
import getModelServiceOverride from "@codingame/monaco-vscode-model-service-override";
import getMultiDiffEditorServiceOverride from "@codingame/monaco-vscode-multi-diff-editor-service-override";
import getNotificationServiceOverride from "@codingame/monaco-vscode-notifications-service-override";
import getOutlineServiceOverride from "@codingame/monaco-vscode-outline-service-override";
import getOutputServiceOverride from "@codingame/monaco-vscode-output-service-override";
import getPreferencesServiceOverride from "@codingame/monaco-vscode-preferences-service-override";
import getQuickAccessServiceOverride from "@codingame/monaco-vscode-quickaccess-service-override";
import getScmServiceOverride from "@codingame/monaco-vscode-scm-service-override";
import getSearchServiceOverride from "@codingame/monaco-vscode-search-service-override";
import getSecretStorageServiceOverride from "@codingame/monaco-vscode-secret-storage-service-override";
import getSnippetServiceOverride from "@codingame/monaco-vscode-snippets-service-override";
import getStorageServiceOverride from "@codingame/monaco-vscode-storage-service-override";
import getTerminalServiceOverride from "@codingame/monaco-vscode-terminal-service-override";
import getTextmateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getUserDataProfileServiceOverride from "@codingame/monaco-vscode-user-data-profile-service-override";
import getWorkbenchServiceOverride from "@codingame/monaco-vscode-workbench-service-override";
import getWorkingCopyServiceOverride from "@codingame/monaco-vscode-working-copy-service-override";
import getWorkspaceTrustOverride from "@codingame/monaco-vscode-workspace-trust-service-override";
import { konumCoz, SEMA } from "./adres";
import { CALISMA_ALANI_DOSYASI, calismaAlaniIcerigi, calismaAlaniniIzle } from "./calismaAlani";
import { ArnorgDosyaSistemi } from "./dosyaSistemi";
import { arnorgEklentisiniKaydet } from "./eklenti";
import { klavyeSuzgeciniKur, tezgahGorunurlugu } from "./klavye";
import { ArnorgTerminalArkaUcu, etkinKonumBagla } from "./terminal";
import { ILK_RENKLER, TEMA_ADI } from "./tema";

/** Vite, `new Worker(new URL(...))` kalıbını görünce çalışanı ayrı paket olarak derler; bu sınıf yalnız adresi taşır */
class Worker {
  constructor(
    readonly url: string | URL,
    readonly options?: WorkerOptions,
  ) {}
}

const calisanlar: Partial<Record<string, Worker>> = {
  editorWorkerService: new Worker(new URL("@codingame/monaco-vscode-api/workers/editor.worker", import.meta.url), { type: "module" }),
  extensionHostWorkerMain: new Worker(new URL("@codingame/monaco-vscode-api/workers/extensionHost.worker", import.meta.url), { type: "module" }),
  TextMateWorker: new Worker(new URL("@codingame/monaco-vscode-textmate-service-override/worker", import.meta.url), { type: "module" }),
  OutputLinkDetectionWorker: new Worker(new URL("@codingame/monaco-vscode-output-service-override/worker", import.meta.url), { type: "module" }),
};

const ortam: IMonacoEnvironment = {
  getWorkerUrl: (_kimlik, etiket) => calisanlar[etiket]?.url.toString(),
  getWorkerOptions: (_kimlik, etiket) => calisanlar[etiket]?.options,
};
(globalThis as { MonacoEnvironment?: IMonacoEnvironment }).MonacoEnvironment = ortam;

const YAZI = "'IBM Plex Mono', ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Liberation Mono', monospace";

/** Varsayılan ayarlar (kullanıcı Ayarlar düzenleyicisinden değiştirebilir) */
const VARSAYILAN_AYARLAR: Record<string, unknown> = {
  "workbench.colorTheme": TEMA_ADI,
  "workbench.iconTheme": "vs-seti",
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.enableExperiments": false,
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "workbench.activity.showAccounts": false,
  "workbench.layoutControl.enabled": false,
  "window.title": "ArnOrg",
  "window.commandCenter": false,
  "window.menuBarVisibility": "compact",
  "editor.fontFamily": YAZI,
  "editor.fontSize": 13,
  "editor.lineHeight": 1.6,
  "editor.fontLigatures": false,
  "editor.minimap.enabled": true,
  "editor.renderLineHighlight": "all",
  "editor.cursorSmoothCaretAnimation": "off",
  "editor.smoothScrolling": false,
  "editor.guides.bracketPairs": "active",
  "editor.stickyScroll.enabled": true,
  "breadcrumbs.enabled": true,
  "debug.console.fontFamily": YAZI,
  "terminal.integrated.fontFamily": YAZI,
  "terminal.integrated.fontSize": 13,
  "terminal.integrated.shellIntegration.enabled": false,
  "markdown.preview.fontFamily": YAZI,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "extensions.ignoreRecommendations": true,
  "security.workspace.trust.enabled": false,
  "typescript.tsserver.web.projectWideIntellisense.enabled": true,
  "typescript.tsserver.web.typeAcquisition.enabled": false,
  "chat.disableAIFeatures": true,
  "chat.commandCenter.enabled": false,
  "scm.alwaysShowRepositories": true,
  "files.autoSave": "off",
};

/** Kısayollar: yeni terminal etkin dosyanın kökünde açılır (çok kökte klasör sorulmaz) */
const VARSAYILAN_KISAYOLLAR = JSON.stringify(
  [{ key: "ctrl+shift+`", command: "workbench.action.terminal.newInActiveWorkspace" }],
  null,
  2,
);

/** Tezgâhın arayüz yazısı Stüdyo'nunkiyle aynı olsun; gölge kökün içine eklenir */
const EK_STIL = `
.monaco-workbench, .monaco-workbench.linux, .monaco-workbench.windows, .monaco-workbench.mac {
  font-family: ${YAZI};
}
.monaco-workbench .part > .title > .title-label h2,
.monaco-workbench .pane-header .title,
.monaco-workbench .composite.title .title-label h2 { letter-spacing: 0.02em; }
`;

export interface TezgahDenetimi {
  /** Kod ekranı görünür olunca: yerleşimi kap boyutuna göre yeniler */
  goster(): void;
  gizle(): void;
}

/** Tezgâhı verilen kabın gölge kökünde kurar */
export async function kur(kap: HTMLElement): Promise<TezgahDenetimi> {
  const golge = kap.shadowRoot ?? kap.attachShadow({ mode: "open" });
  const govde = document.createElement("div");
  govde.style.cssText = "width:100%;height:100%;";
  golge.replaceChildren(govde);
  const ekStil = new CSSStyleSheet();
  ekStil.replaceSync(EK_STIL);
  klavyeSuzgeciniKur(kap);
  // VS Code masaüstünde olduğu gibi: iptal edilen işlemlerin (hızlı açma, arama) yakalanmamış sözleri
  // hata değildir; diğerleri tezgâhın hata işleyicisine gider
  window.addEventListener("unhandledrejection", (e) => {
    if (isCancellationError(e.reason)) e.preventDefault();
  });

  // Ölçümler doğru olsun: düzenleyici yazısı yüklenmeden tezgâh kurulmaz
  await Promise.all(["400", "500", "600"].map((k) => document.fonts.load(`${k} 13px "IBM Plex Mono"`).catch(() => undefined)));

  const dosyaSistemi = new ArnorgDosyaSistemi();
  registerCustomProvider(SEMA, dosyaSistemi);
  await createIndexedDBProviders();
  await Promise.all([
    initFile(CALISMA_ALANI_DOSYASI, await calismaAlaniIcerigi(), { overwrite: true }),
    initUserKeybindings(VARSAYILAN_KISAYOLLAR),
  ]);
  arnorgEklentisiniKaydet(dosyaSistemi);

  const secenekler: IWorkbenchConstructionOptions = {
    enableWorkspaceTrust: false,
    workspaceProvider: {
      trusted: true,
      workspace: { workspaceUri: CALISMA_ALANI_DOSYASI },
      async open() {
        return false;
      },
    },
    developmentOptions: { logLevel: LogLevel.Warning },
    configurationDefaults: VARSAYILAN_AYARLAR,
    initialColorTheme: { themeType: ColorScheme.DARK, colors: ILK_RENKLER },
    productConfiguration: {
      nameShort: "ArnOrg",
      nameLong: "ArnOrg Kod",
      extensionsGallery: {
        serviceUrl: "https://open-vsx.org/vscode/gallery",
        resourceUrlTemplate: "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
        extensionUrlTemplate: "https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest",
        controlUrl: "",
        nlsBaseUrl: "",
      },
    },
  };

  await initialize(
    {
      ...getLogServiceOverride(),
      ...getExtensionServiceOverride({ enableWorkerExtensionHost: true }),
      ...getExtensionGalleryServiceOverride({ webOnly: true }),
      ...getModelServiceOverride(),
      ...getNotificationServiceOverride(),
      ...getDialogsServiceOverride(),
      ...getConfigurationServiceOverride(),
      ...getKeybindingsServiceOverride({ shouldUseGlobalKeybindings: () => true }),
      ...getTextmateServiceOverride(),
      ...getThemeServiceOverride(),
      ...getLanguagesServiceOverride(),
      ...getPreferencesServiceOverride(),
      ...getOutputServiceOverride(),
      ...getTerminalServiceOverride(new ArnorgTerminalArkaUcu()),
      ...getSearchServiceOverride(),
      ...getScmServiceOverride(),
      ...getMarkersServiceOverride(),
      ...getOutlineServiceOverride(),
      ...getExplorerServiceOverride(),
      ...getSnippetServiceOverride(),
      ...getMultiDiffEditorServiceOverride(),
      ...getWorkingCopyServiceOverride(),
      ...getWorkspaceTrustOverride(),
      ...getAccessibilityServiceOverride(),
      ...getSecretStorageServiceOverride(),
      ...getAuthenticationServiceOverride(),
      ...getUserDataProfileServiceOverride(),
      ...getEmmetServiceOverride(),
      ...getLifecycleServiceOverride(),
      ...getEnvironmentServiceOverride(),
      ...getStorageServiceOverride({ fallbackOverride: { "workbench.activity.showAccounts": false } }),
      ...getLocalizationServiceOverride({
        availableLanguages: [{ locale: "tr", languageName: "Türkçe" }],
        async setLocale() {},
        async clearLocale() {},
      }),
      ...getWorkbenchServiceOverride(),
      ...getQuickAccessServiceOverride({ isKeybindingConfigurationVisible: () => true, shouldUseGlobalPicker: () => true }),
    },
    govde,
    secenekler,
    { userHome: URI.file("/") },
  );
  golge.adoptedStyleSheets = [...golge.adoptedStyleSheets, ekStil];

  const yerlesim = await getService(IWorkbenchLayoutService);
  etkinKonumBagla(() => {
    const etkin = StandaloneServices.get(IEditorService).activeEditor;
    const u = etkin ? EditorResourceAccessor.getCanonicalUri(etkin, { supportSideBySide: SideBySideEditor.PRIMARY }) : undefined;
    return u?.scheme === SEMA ? konumCoz(u.path) : null;
  });
  calismaAlaniniIzle();

  // Kap boyutu değişince (pencere, gezinti, ray) yerleşim yenilenir
  let gorunur = true;
  new ResizeObserver(() => {
    if (gorunur && kap.clientWidth > 0 && kap.clientHeight > 0) yerlesim.layout();
  }).observe(kap);
  tezgahGorunurlugu(true);

  return {
    goster() {
      gorunur = true;
      tezgahGorunurlugu(true);
      requestAnimationFrame(() => yerlesim.layout());
    },
    gizle() {
      gorunur = false;
      tezgahGorunurlugu(false);
    },
  };
}
