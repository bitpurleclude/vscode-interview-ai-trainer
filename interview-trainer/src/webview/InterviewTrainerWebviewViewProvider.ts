import * as vscode from "vscode";
import { WebviewProtocol } from "./WebviewProtocol";

export class InterviewTrainerWebviewViewProvider
  implements vscode.WebviewViewProvider
{
  public static readonly viewType = "itInterviewTrainer.mainView";
  public readonly webviewProtocol = new WebviewProtocol();

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.webviewProtocol.webview = webviewView.webview;
    webviewView.webview.html = this.getHtml(webviewView.webview);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.css"),
    );

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
        vscode.Uri.joinPath(this.context.extensionUri, "assets"),
      ],
    };

    const bootHtml = `
      <div class="it-boot">
        <div class="it-boot__header">
          <div class="it-boot__title">面试训练助手</div>
          <div class="it-boot__pill">Loading...</div>
        </div>
        <div class="it-boot__actions">
          <button disabled>开始录音</button>
          <button disabled>停止录音</button>
          <button disabled>导入音频</button>
          <button disabled>开始分析</button>
          <button disabled>保存结果</button>
          <button disabled>历史记录</button>
          <button disabled>设置</button>
        </div>
        <div class="it-boot__status">界面初始化中...</div>
        <div class="it-boot__steps">
          <div class="it-boot__step"></div>
          <div class="it-boot__step"></div>
          <div class="it-boot__step"></div>
          <div class="it-boot__step"></div>
        </div>
      </div>
    `;

    const nonce = String(Math.random()).slice(2);

    return `<!DOCTYPE html>
      <html lang="zh-CN">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="
            default-src 'none';
            img-src ${webview.cspSource} https: data:;
            style-src ${webview.cspSource} 'unsafe-inline';
            script-src 'nonce-${nonce}';
          ">
          <style>
            :root { color-scheme: light dark; }
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
          <link href="${styleUri}" rel="stylesheet" />
          <title>面试训练助手</title>
        </head>
        <body>
          <div id="root">${bootHtml}</div>
          <script nonce="${nonce}">
            window.__itReady = false;
            window.__itScriptLoaded = false;
            window.__itLastError = "";

            window.addEventListener("error", (event) => {
              try {
                window.__itLastError = String(event?.message || event?.error?.message || event);
              } catch {}
            });
            window.addEventListener("unhandledrejection", (event) => {
              try {
                window.__itLastError = String(event?.reason?.message || event?.reason || event);
              } catch {}
            });

            function updateBoot(text) {
              const status = document.querySelector(".it-boot__status");
              if (status) {
                status.textContent = text;
              }
            }

            setTimeout(() => {
              if (window.__itReady) return;
              if (!window.__itScriptLoaded) {
                updateBoot("前端脚本未加载：请尝试重启 IDE 或重新安装 VSIX。");
                return;
              }
              if (window.__itLastError) {
                updateBoot("前端运行出错：" + window.__itLastError);
                return;
              }
              updateBoot("仍在加载，请稍候...");
            }, 6000);
          </script>
          <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>`;
  }
}
