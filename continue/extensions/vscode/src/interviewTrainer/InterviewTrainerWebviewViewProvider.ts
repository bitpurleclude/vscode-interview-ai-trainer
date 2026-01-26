import * as vscode from "vscode";

import { getTheme } from "../util/getTheme";
import { getExtensionVersion, getvsCodeUriScheme } from "../util/util";
import { getExtensionUri, getNonce, getUniqueId } from "../util/vscode";
import { VsCodeWebviewProtocol } from "../webviewProtocol";

export class InterviewTrainerWebviewViewProvider
  implements vscode.WebviewViewProvider
{
  public static readonly viewType = "interviewTrainer.mainView";
  public webviewProtocol: VsCodeWebviewProtocol;

  private _webview?: vscode.Webview;
  private _webviewView?: vscode.WebviewView;

  constructor(
    private readonly windowId: string,
    private readonly extensionContext: vscode.ExtensionContext,
  ) {
    this.webviewProtocol = new VsCodeWebviewProtocol();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void | Thenable<void> {
    this.webviewProtocol.webview = webviewView.webview;
    this._webviewView = webviewView;
    this._webview = webviewView.webview;
    webviewView.webview.html = this.getSidebarContent(
      this.extensionContext,
      webviewView,
    );
  }

  get isVisible(): boolean {
    return this._webviewView?.visible ?? false;
  }

  getSidebarContent(
    context: vscode.ExtensionContext | undefined,
    panel: vscode.WebviewPanel | vscode.WebviewView,
  ): string {
    const extensionUri = getExtensionUri();
    let scriptUri: string;
    let styleMainUri: string;
    const vscMediaUrl: string = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(extensionUri, "gui"))
      .toString();

    const inDevelopmentMode =
      context?.extensionMode === vscode.ExtensionMode.Development;
    if (inDevelopmentMode) {
      scriptUri = "http://localhost:5173/src/main.tsx";
      styleMainUri = "http://localhost:5173/src/index.css";
    } else {
      scriptUri = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(extensionUri, "gui/assets/index.js"))
        .toString();
      styleMainUri = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(extensionUri, "gui/assets/index.css"))
        .toString();
    }

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, "gui"),
        vscode.Uri.joinPath(extensionUri, "assets"),
        vscode.Uri.joinPath(
          extensionUri,
          "src",
          "extension",
          "assets",
          "interview_trainer",
        ),
      ],
      enableCommandUris: true,
    };

    const nonce = getNonce();
    const currentTheme = getTheme();
    this.webviewProtocol.webview = panel.webview;

    const bootHtml = `
      <div class="it-boot">
        <div class="it-boot__header">
          <div class="it-boot__title">Interview Trainer</div>
          <div class="it-boot__pill">Loading...</div>
        </div>
        <div class="it-boot__actions">
          <button disabled>Start Recording</button>
          <button disabled>Stop</button>
          <button disabled>Import</button>
          <button disabled>Analyze</button>
          <button disabled>Save</button>
          <button disabled>History</button>
          <button disabled>Settings</button>
        </div>
        <div class="it-boot__status">Preparing UI...</div>
        <div class="it-boot__steps">
          <div class="it-boot__step"></div>
          <div class="it-boot__step"></div>
          <div class="it-boot__step"></div>
          <div class="it-boot__step"></div>
        </div>
      </div>
    `;

    return `<!DOCTYPE html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>const vscode = acquireVsCodeApi();</script>
        <style>
          :root {
            color-scheme: light dark;
          }
          body {
            margin: 0;
            padding: 12px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            font-family: var(--vscode-font-family);
          }
          .it-boot {
            display: grid;
            gap: 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 12px;
            background: var(--vscode-sideBar-background);
          }
          .it-boot__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }
          .it-boot__title {
            font-weight: 600;
            font-size: 14px;
          }
          .it-boot__pill {
            font-size: 12px;
            padding: 2px 8px;
            border-radius: 999px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-foreground);
          }
          .it-boot__actions {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }
          .it-boot__actions button {
            border: 1px solid var(--vscode-button-border, transparent);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 12px;
            opacity: 0.6;
            pointer-events: none;
          }
          .it-boot__status {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
          }
          .it-boot__steps {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
          }
          .it-boot__step {
            height: 8px;
            border-radius: 4px;
            background: linear-gradient(
              90deg,
              var(--vscode-editor-inactiveSelectionBackground),
              var(--vscode-editorWidget-background),
              var(--vscode-editor-inactiveSelectionBackground)
            );
            animation: it-boot-shimmer 1.6s infinite;
          }
          @keyframes it-boot-shimmer {
            0% { opacity: 0.35; }
            50% { opacity: 0.75; }
            100% { opacity: 0.35; }
          }
        </style>
        <link href="${styleMainUri}" rel="stylesheet">
        <title>Interview Trainer</title>
      </head>
      <body>
        <div id="root">${bootHtml}</div>
        ${
          inDevelopmentMode
            ? `<script type="module">
          import RefreshRuntime from "http://localhost:5173/@react-refresh"
          RefreshRuntime.injectIntoGlobalHook(window)
          window.$RefreshReg$ = () => {}
          window.$RefreshSig$ = () => (type) => type
          window.__vite_plugin_react_preamble_installed__ = true
          </script>`
            : ""
        }
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        <script>
          window.__itReady = false;
          setTimeout(() => {
            if (!window.__itReady) {
              const status = document.querySelector('.it-boot__status');
              if (status) {
                status.textContent = 'Still loading, UI will unlock soon...';
              }
            }
          }, 6000);
        </script>
        <script>localStorage.setItem("ide", '"vscode"')</script>
        <script>localStorage.setItem("vsCodeUriScheme", '"${getvsCodeUriScheme()}"')</script>
        <script>localStorage.setItem("extensionVersion", '"${getExtensionVersion()}"')</script>
        <script>window.windowId = "${this.windowId}"</script>
        <script>window.vscMachineId = "${getUniqueId()}"</script>
        <script>window.vscMediaUrl = "${vscMediaUrl}"</script>
        <script>window.ide = "vscode"</script>
        <script>window.fullColorTheme = ${JSON.stringify(currentTheme)}</script>
        <script>window.colorThemeName = "dark-plus"</script>
        <script>window.workspacePaths = ${JSON.stringify(
          vscode.workspace.workspaceFolders?.map((folder) =>
            folder.uri.toString(),
          ) || [],
        )}</script>
        <script>window.isFullScreen = false</script>
        <script>window.location.pathname = "/interview-trainer"</script>
      </body>
    </html>`;
  }
}
