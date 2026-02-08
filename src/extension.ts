import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SidebarProvider } from "./sidebar";

interface FileConsoleInfo {
  path: string;
  count: number;
}

let filesWithConsoleLogs: Map<string, number> = new Map();
let sidebarProviderInstance: SidebarProvider | undefined;

// Helper function to get configuration
function getConfig() {
  const config = vscode.workspace.getConfiguration("consoleCleaner");
  return {
    ignoreFolders: config.get<string[]>("ignoreFolders", [
      "node_modules",
      "build",
      "dist",
      ".next",
      "out",
      "coverage",
      ".git",
      ".vscode",
      "vendor",
      "tmp",
      "temp",
    ]),
    fileExtensions: config.get<string[]>("fileExtensions", [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".mjs",
      ".cjs",
    ]),
    consoleMethods: config.get<string[]>("consoleMethods", [
      "log",
      "warn",
      "error",
      "info",
      "debug",
      "trace",
      "table",
      "time",
      "timeEnd",
      "assert",
      "count",
      "dir",
      "dirxml",
      "group",
      "groupCollapsed",
      "groupEnd",
      "clear",
    ]),
    autoScanOnStartup: config.get<boolean>("autoScanOnStartup", true),
    confirmBeforeCleaning: config.get<boolean>("confirmBeforeCleaning", true),
  };
}

export function activate(context: vscode.ExtensionContext) {
  sidebarProviderInstance = new SidebarProvider(
    context,
    () => {
      return Array.from(filesWithConsoleLogs.entries()).map(
        ([path, count]) => ({
          path,
          count,
        }),
      );
    },
    openFile,
    (filePath: string) => {
      cleanSingleFileCommand(filePath);
    },
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProviderInstance,
    ),
  );

  // Initial scan based on configuration
  const config = getConfig();
  if (config.autoScanOnStartup) {
    // Small delay to let VS Code finish loading
    setTimeout(() => {
      scanWorkspace();
    }, 1000);
  }

  // Set up file watcher
  setupFileWatcher(context);

  // Register clean project command
  context.subscriptions.push(
    vscode.commands.registerCommand("consoleCleaner.cleanProject", async () => {
      await cleanWorkspace();
    }),
  );

  // Register clean single file command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "consoleCleaner.cleanFile",
      async (filePath: string) => {
        await cleanSingleFileCommand(filePath);
      },
    ),
  );

  // Register rescan command
  context.subscriptions.push(
    vscode.commands.registerCommand("consoleCleaner.rescan", async () => {
      await scanWorkspace();
    }),
  );

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("consoleCleaner")) {
        // Re-scan when configuration changes
        scanWorkspace();
      }
    }),
  );
}

function setupFileWatcher(context: vscode.ExtensionContext) {
  const config = getConfig();
  const extensions = config.fileExtensions.map((ext) => ext.replace(".", ""));
  const pattern = `**/*.{${extensions.join(",")}}`;
  const fileSystemWatcher = vscode.workspace.createFileSystemWatcher(pattern);

  let scanTimeout: NodeJS.Timeout | undefined;
  const debouncedScan = () => {
    if (scanTimeout) {
      clearTimeout(scanTimeout);
    }
    scanTimeout = setTimeout(() => {
      scanWorkspace();
    }, 2000);
  };

  fileSystemWatcher.onDidCreate(debouncedScan);
  fileSystemWatcher.onDidChange(debouncedScan);
  fileSystemWatcher.onDidDelete((uri) => {
    filesWithConsoleLogs.delete(uri.fsPath);
    if (sidebarProviderInstance) {
      sidebarProviderInstance.refresh();
    }
  });

  context.subscriptions.push(fileSystemWatcher);
}

async function scanWorkspace() {
  const workspace = vscode.workspace.workspaceFolders;
  if (!workspace || workspace.length === 0) {
    vscode.window.showWarningMessage("No workspace folder open");
    return;
  }

  filesWithConsoleLogs.clear();

  if (sidebarProviderInstance) {
    sidebarProviderInstance.setScanning(true);
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Scanning for console logs...",
      cancellable: false,
    },
    async (progress) => {
      try {
        await scanDir(workspace[0].uri.fsPath, progress);

        if (sidebarProviderInstance) {
          sidebarProviderInstance.setScanning(false);
        }

        if (filesWithConsoleLogs.size > 0) {
          const totalLogs = Array.from(filesWithConsoleLogs.values()).reduce(
            (sum, count) => sum + count,
            0,
          );
          vscode.window.showInformationMessage(
            `Found ${totalLogs} console log(s) in ${filesWithConsoleLogs.size} file(s)`,
          );
        } else {
          vscode.window.showInformationMessage(
            "No console logs found in your project 🎉",
          );
        }
      } catch (error) {
        if (sidebarProviderInstance) {
          sidebarProviderInstance.setScanning(false);
        }
        vscode.window.showErrorMessage(
          `Error scanning workspace: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}

async function scanDir(
  dir: string,
  progress?: vscode.Progress<{ message?: string; increment?: number }>,
  visited: Set<string> = new Set(),
): Promise<number> {
  const config = getConfig();

  try {
    const realPath = await fs.promises.realpath(dir);
    if (visited.has(realPath)) {
      return 0;
    }
    visited.add(realPath);
  } catch (error) {
    if (visited.has(dir)) {
      return 0;
    }
    visited.add(dir);
  }

  let fileCount = 0;

  try {
    const files = await fs.promises.readdir(dir);

    for (const file of files) {
      if (config.ignoreFolders.includes(file)) {
        continue;
      }

      const fullPath = path.join(dir, file);

      try {
        const stat = await fs.promises.stat(fullPath);

        if (stat.isDirectory()) {
          fileCount += await scanDir(fullPath, progress, visited);
        } else if (config.fileExtensions.includes(path.extname(file))) {
          fileCount++;
          if (progress && fileCount % 50 === 0) {
            progress.report({
              message: `Scanned ${fileCount} files...`,
            });
          }

          const consoleCount = await countConsoleLogs(fullPath);
          if (consoleCount > 0) {
            filesWithConsoleLogs.set(fullPath, consoleCount);
          }
        }
      } catch (error) {
        // Silently skip files we can't access
      }
    }
  } catch (error) {
    // Silently skip directories we can't read
  }

  return fileCount;
}

async function countConsoleLogs(filePath: string): Promise<number> {
  try {
    const config = getConfig();
    const content = await fs.promises.readFile(filePath, "utf8");
    const methods = config.consoleMethods.join("|");
    const regex = new RegExp(`console\\s*\\.\\s*(${methods})\\s*\\(`, "gs");
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  } catch (error) {
    return 0;
  }
}

async function cleanWorkspace() {
  const config = getConfig();
  const workspace = vscode.workspace.workspaceFolders;
  if (!workspace || workspace.length === 0) {
    vscode.window.showWarningMessage("No workspace folder open");
    return;
  }

  const filesList = Array.from(filesWithConsoleLogs.keys());

  if (filesList.length === 0) {
    vscode.window.showInformationMessage("No console logs found to clean");
    return;
  }

  const totalLogs = Array.from(filesWithConsoleLogs.values()).reduce(
    (sum, count) => sum + count,
    0,
  );

  let confirmation = "Yes, Clean All";

  if (config.confirmBeforeCleaning) {
    const result = await vscode.window.showWarningMessage(
      `This will remove ${totalLogs} console log(s) from ${filesList.length} file(s). This action cannot be undone. Continue?`,
      { modal: true },
      "Yes, Clean All",
    );

    if (result !== "Yes, Clean All") {
      return;
    }
  }

  if (sidebarProviderInstance) {
    sidebarProviderInstance.setCleaning(true);
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Cleaning console logs...",
      cancellable: false,
    },
    async (progress) => {
      let cleanedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < filesList.length; i++) {
        const filePath = filesList[i];
        progress.report({
          message: `Cleaning ${i + 1}/${filesList.length}: ${path.basename(filePath)}`,
          increment: 100 / filesList.length,
        });

        const success = await cleanFile(filePath);
        if (success) {
          cleanedCount++;
          filesWithConsoleLogs.delete(filePath);
        } else {
          errorCount++;
        }
      }

      if (sidebarProviderInstance) {
        sidebarProviderInstance.setCleaning(false);
      }

      if (errorCount > 0) {
        vscode.window.showWarningMessage(
          `✅ Cleaned ${cleanedCount} file(s). Failed to clean ${errorCount} file(s).`,
        );
      } else {
        vscode.window.showInformationMessage(
          `✅ Successfully cleaned console logs from ${cleanedCount} file(s)`,
        );
      }
    },
  );
}

async function cleanSingleFileCommand(filePath: string): Promise<void> {
  const config = getConfig();
  const consoleCount = filesWithConsoleLogs.get(filePath) || 0;

  if (config.confirmBeforeCleaning) {
    const confirmation = await vscode.window.showWarningMessage(
      `Remove ${consoleCount} console log(s) from ${path.basename(filePath)}? This cannot be undone.`,
      { modal: true },
      "Yes, Clean",
    );

    if (confirmation !== "Yes, Clean") {
      return;
    }
  }

  if (sidebarProviderInstance) {
    sidebarProviderInstance.setCleaning(true);
  }

  const success = await cleanFile(filePath);

  if (success) {
    filesWithConsoleLogs.delete(filePath);
    vscode.window.showInformationMessage(
      `✅ Cleaned console logs from ${path.basename(filePath)}`,
    );
  } else {
    vscode.window.showErrorMessage(
      `Failed to clean ${path.basename(filePath)}`,
    );
  }

  if (sidebarProviderInstance) {
    sidebarProviderInstance.setCleaning(false);
  }
}

async function cleanFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.promises.readFile(filePath, "utf8");
    const cleaned = removeConsoleLogs(content);

    if (cleaned !== content) {
      await fs.promises.writeFile(filePath, cleaned, "utf8");
      return true;
    }
    return true;
  } catch (error) {
    return false;
  }
}

function removeConsoleLogs(content: string): string {
  const config = getConfig();
  const methods = config.consoleMethods.join("|");
  let result = content;

  // Pattern 1: Single-line console statements
  const singleLinePattern = new RegExp(
    `^[ \\t]*console\\s*\\.\\s*(${methods})\\s*\\([^;]*\\)\\s*;?\\s*$`,
    "gm",
  );
  result = result.replace(singleLinePattern, "");

  // Pattern 2: Multi-line console statements with nested parentheses
  const multiLinePattern = new RegExp(
    `^[ \\t]*console\\s*\\.\\s*(${methods})\\s*\\([^)]*(?:\\([^)]*\\)[^)]*)*\\)\\s*;?\\s*$`,
    "gm",
  );
  result = result.replace(multiLinePattern, "");

  // Pattern 3: Complex multi-line - iterative approach
  let previousResult = "";
  let iterations = 0;
  const maxIterations = 5;

  while (previousResult !== result && iterations < maxIterations) {
    previousResult = result;

    const complexPattern = new RegExp(
      `console\\s*\\.\\s*(${methods})\\s*\\([^;{}]*?\\)\\s*;?`,
      "gs",
    );

    result = result.replace(complexPattern, (match) => {
      const lines = match.split("\n");
      const firstLine = lines[0].trimStart();

      if (!match.includes("{") && !match.includes("function")) {
        return "";
      }
      return match;
    });

    iterations++;
  }

  // Pattern 4: Commented console statements
  const commentedPattern = new RegExp(
    `^[ \\t]*\\/\\/\\s*console\\s*\\.\\s*(${methods})\\s*\\(.*$`,
    "gm",
  );
  result = result.replace(commentedPattern, "");

  // Pattern 5: Block comments
  const blockCommentPattern = new RegExp(
    `\\/\\*[\\s\\S]*?console\\s*\\.\\s*(${methods})\\s*\\([\\s\\S]*?\\*\\/`,
    "g",
  );
  result = result.replace(blockCommentPattern, "");

  // Clean up excessive blank lines (max 2 consecutive blank lines)
  result = result.replace(/\n\s*\n\s*\n\s*\n/g, "\n\n\n");
  result = result.replace(/^[ \t]+$/gm, "");

  return result;
}

function openFile(filePath: string) {
  try {
    // Normalize the path to handle Windows paths properly
    const normalizedPath = path.normalize(filePath);

    // Check if file exists
    if (!fs.existsSync(normalizedPath)) {
      vscode.window.showErrorMessage(
        `File not found: ${normalizedPath}\n\nPlease rescan the project.`,
      );
      return;
    }

    // Create URI from the file path
    const uri = vscode.Uri.file(normalizedPath);

    // Open the document
    vscode.workspace.openTextDocument(uri).then(
      (document) => {
        vscode.window.showTextDocument(document, {
          preview: false,
          preserveFocus: false,
        });
      },
      (error) => {
        vscode.window.showErrorMessage(
          `Failed to open file: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to open file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function deactivate() {
  filesWithConsoleLogs.clear();
  sidebarProviderInstance = undefined;
}
