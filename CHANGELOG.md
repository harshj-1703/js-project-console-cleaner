# Change Log

All notable changes to the "JavaScript Console Cleaner" extension will be documented in this file.

## [1.0.0] - 2024-02-08

### Added

- Initial release of JavaScript Console Cleaner
- Automatic detection of console statements across JavaScript/TypeScript projects
- Beautiful sidebar interface with file listing
- One-click cleaning for entire project or individual files
- Real-time file watching with debounced scanning
- Configurable settings for:
  - Ignored folders
  - File extensions to scan
  - Console methods to target
  - Auto-scan on startup
  - Confirmation before cleaning
- Progress indicators for scanning and cleaning operations
- Visual statistics showing total files and console statements
- Smart regex patterns to remove various console statement formats
- Support for single-line and multi-line console statements
- Removal of commented console statements
- Confirmation dialogs for destructive operations
- Error handling and user-friendly error messages

### Features

- Scans `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs` files by default
- Ignores common folders like `node_modules`, `build`, `dist`, etc.
- Detects all common console methods: log, warn, error, info, debug, trace, table, time, timeEnd, assert, count, dir, dirxml, group, groupCollapsed, groupEnd, clear
- File watcher automatically updates when files are created, modified, or deleted
- Clean individual files or entire project
- Rescan project on demand

### Technical Details

- Built with TypeScript
- VS Code API 1.85.0+
- Webview-based sidebar UI
- File system watching with 2-second debounce
- Configuration management with VS Code settings
- Proper error handling and user notifications

---

## Future Plans

### [1.1.0] - Planned

- [ ] Support for custom regex patterns
- [ ] Exclude specific files from scanning
- [ ] Undo/redo functionality
- [ ] Statistics dashboard
- [ ] Export scan results to file

### [1.2.0] - Planned

- [ ] Support for other logging libraries (winston, bunyan, etc.)
- [ ] Git integration to only clean modified files
- [ ] Pre-commit hook integration
- [ ] Workspace-specific settings

---

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.
