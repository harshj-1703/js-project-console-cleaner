import * as vscode from "vscode";
import * as path from "path";

interface FileConsoleInfo {
  path: string;
  count: number;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "consoleCleanerView";

  private _view?: vscode.WebviewView;
  private _isScanning = false;
  private _isCleaning = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getFiles: () => FileConsoleInfo[],
    private readonly openFile: (path: string) => void,
    private readonly cleanFile: (path: string) => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this._view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    this.render();

    view.webview.onDidReceiveMessage(async (msg) => {
      try {
        switch (msg.command) {
          case "clean":
            await vscode.commands.executeCommand("consoleCleaner.cleanProject");
            break;
          case "cleanFile":
            await vscode.commands.executeCommand(
              "consoleCleaner.cleanFile",
              msg.path,
            );
            break;
          case "openFile":
            // Pass the path directly without any modification
            this.openFile(msg.path);
            break;
          case "rescan":
            await vscode.commands.executeCommand("consoleCleaner.rescan");
            break;
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Action failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  setScanning(isScanning: boolean) {
    this._isScanning = isScanning;
    this.refresh();
  }

  setCleaning(isCleaning: boolean) {
    this._isCleaning = isCleaning;
    this.refresh();
  }

  refresh() {
    this.render();
  }

  private render() {
    if (!this._view) {
      return;
    }

    const files = this.getFiles();
    const workspace = vscode.workspace.workspaceFolders
      ? [...vscode.workspace.workspaceFolders]
      : undefined;

    this._view.webview.html = this.getHtmlContent(files, workspace);
  }

  private getHtmlContent(
    files: FileConsoleInfo[],
    workspace: vscode.WorkspaceFolder[] | undefined,
  ): string {
    const fileListHtml = this.generateFileList(files);
    const stats = this.generateStats(files);
    const isAnyOperation = this._isScanning || this._isCleaning;
    const cleanButtonDisabled = isAnyOperation || files.length === 0;
    const rescanButtonDisabled = isAnyOperation;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <h2>JavaScript Console Cleaner</h2>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 16px;
    }

    h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--vscode-foreground);
    }

    .stats {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .stats-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .stats-item:last-child {
      margin-bottom: 0;
    }

    .stats-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .stats-value {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .button-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    button {
      width: 100%;
      padding: 8px 12px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-button-foreground);
      background-color: var(--vscode-button-background);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      transition: background-color 0.2s;
      outline: none;
    }

    button:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground);
    }

    button:active:not(:disabled) {
      transform: scale(0.98);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover:not(:disabled) {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 0.8s linear infinite;
      margin-right: 6px;
      vertical-align: middle;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 16px 0;
    }

    .empty-state {
      text-align: center;
      padding: 32px 16px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .empty-state-text {
      font-size: 14px;
      line-height: 1.5;
    }

    .file-list {
      list-style: none;
    }

    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px;
      margin-bottom: 4px;
      background-color: var(--vscode-editor-background);
      border-radius: 4px;
      transition: background-color 0.15s;
      gap: 8px;
    }

    .file-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .file-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      overflow: hidden;
    }

    .file-path {
      flex: 1;
      font-size: 12px;
      color: var(--vscode-textLink-foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-info:hover .file-path {
      text-decoration: underline;
    }

    .file-info:active .file-path {
      color: var(--vscode-textLink-activeForeground);
    }

    .console-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-badge-foreground);
      background-color: var(--vscode-badge-background);
      border-radius: 10px;
      flex-shrink: 0;
    }

    .file-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .icon-button {
      width: 24px;
      height: 24px;
      padding: 4px;
      background-color: transparent;
      color: var(--vscode-icon-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s;
      outline: none;
    }

    .icon-button:hover:not(:disabled) {
      background-color: var(--vscode-toolbar-hoverBackground);
    }

    .icon-button:active:not(:disabled) {
      transform: scale(0.95);
    }

    .icon-button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .section-header {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .developer-credit {
      text-align: center;
      padding: 16px 8px 8px 8px;
      margin-top: 24px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      border-top: 1px solid var(--vscode-panel-border);
    }

    .developer-credit a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }

    .developer-credit a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>

  ${stats}

  <div class="button-group">
    <button 
      id="cleanBtn" 
      ${cleanButtonDisabled ? "disabled" : ""}
      title="${files.length === 0 ? "No console logs to clean" : isAnyOperation ? "Operation in progress..." : "Clean all console logs from project"}">
      ${this._isCleaning ? '<span class="spinner"></span>Cleaning...' : "🧹 Clean All Console Logs"}
    </button>
    <button 
      id="rescanBtn" 
      class="secondary"
      ${rescanButtonDisabled ? "disabled" : ""}
      title="${isAnyOperation ? "Operation in progress..." : "Rescan project for console logs"}">
      ${this._isScanning ? '<span class="spinner"></span>Scanning...' : "🔄 Rescan Project"}
    </button>
  </div>

  <hr/>

  ${fileListHtml}

  <script>
    (function() {
      const vscode = acquireVsCodeApi();

      // Helper function to encode path for safe transmission
      // Using encodeURIComponent instead of btoa for better compatibility
      function encodePath(path) {
        return encodeURIComponent(path);
      }

      // Helper function to decode path
      function decodePath(encodedPath) {
        return decodeURIComponent(encodedPath);
      }

      // Clean all button
      const cleanBtn = document.getElementById("cleanBtn");
      if (cleanBtn) {
        cleanBtn.addEventListener("click", function() {
          if (!this.disabled) {
            vscode.postMessage({ command: "clean" });
          }
        });
      }

      // Rescan button
      const rescanBtn = document.getElementById("rescanBtn");
      if (rescanBtn) {
        rescanBtn.addEventListener("click", function() {
          if (!this.disabled) {
            vscode.postMessage({ command: "rescan" });
          }
        });
      }

      // Open file function
      window.openFile = function(pathData) {
        const decodedPath = decodePath(pathData);
        vscode.postMessage({ command: "openFile", path: decodedPath });
      };

      // Clean single file function
      window.cleanSingleFile = function(pathData) {
        const decodedPath = decodePath(pathData);
        vscode.postMessage({ command: "cleanFile", path: decodedPath });
      };
    })();
  </script>

  <div class="developer-credit">
    Developed by <strong>Harsh Jolapara</strong>
  </div>

</body>
</html>`;
  }

  private generateStats(files: FileConsoleInfo[]): string {
    if (this._isScanning) {
      return `
        <div class="stats">
          <div class="stats-item">
            <span class="stats-label">Status</span>
            <span class="stats-value">
              <span class="spinner"></span>
              Scanning...
            </span>
          </div>
        </div>
      `;
    }

    if (this._isCleaning) {
      return `
        <div class="stats">
          <div class="stats-item">
            <span class="stats-label">Status</span>
            <span class="stats-value">
              <span class="spinner"></span>
              Cleaning...
            </span>
          </div>
        </div>
      `;
    }

    const totalLogs = files.reduce((sum, file) => sum + file.count, 0);

    return `
      <div class="stats">
        <div class="stats-item">
          <span class="stats-label">Files with console logs</span>
          <span class="stats-value">${files.length}</span>
        </div>
        <div class="stats-item">
          <span class="stats-label">Total console logs</span>
          <span class="stats-value">${totalLogs}</span>
        </div>
      </div>
    `;
  }

  private generateFileList(files: FileConsoleInfo[]): string {
    if (files.length === 0 && !this._isScanning) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-text">
            No console logs found in your project!<br>
            Your code is clean.
          </div>
        </div>
      `;
    }

    if (files.length === 0) {
      return "";
    }

    const isOperating = this._isScanning || this._isCleaning;

    const fileItems = files
      .map((fileInfo) => {
        const relativePath = vscode.workspace.asRelativePath(fileInfo.path);
        const fileName = path.basename(fileInfo.path);
        const dirName = path.dirname(relativePath);

        // Use encodeURIComponent instead of base64 for better webview compatibility
        const encodedPath = encodeURIComponent(fileInfo.path);

        // Escape HTML for display
        const escapedRelativePath = this.escapeHtml(relativePath);
        const escapedFileName = this.escapeHtml(fileName);
        const escapedDirName = this.escapeHtml(dirName);

        return `
          <li class="file-item">
            <div 
              class="file-info" 
              onclick="openFile('${encodedPath}')"
              title="${escapedRelativePath}">
              <div class="file-path">
                <strong>${escapedFileName}</strong>
                ${dirName !== "." ? `<br><small style="color: var(--vscode-descriptionForeground);">${escapedDirName}</small>` : ""}
              </div>
              <span class="console-count" title="${fileInfo.count} console log${fileInfo.count !== 1 ? "s" : ""}">${fileInfo.count}</span>
            </div>
            <div class="file-actions">
              <button 
                class="icon-button" 
                onclick="cleanSingleFile('${encodedPath}')"
                title="${isOperating ? "Operation in progress..." : "Clean this file"}"
                ${isOperating ? "disabled" : ""}>
                🧹
              </button>
            </div>
          </li>
        `;
      })
      .join("");

    return `
      <div class="section-header">Affected Files (${files.length})</div>
      <ul class="file-list">
        ${fileItems}
      </ul>
    `;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
