# Project to Text VS Code Extension

Concatenate and structure your project files for LLM or documentation consumption, with robust file selection and tree view.

## Features

- Select files and folders to include using a tree view
- Supports include/exclude globs (see settings)
- One-click generation of a structured, LLM-friendly text output
- Quick Generate: select files via a quick pick dialog
- Handles edge cases and large projects robustly

## Requirements

- Node.js (v18+ recommended)
- Visual Studio Code 1.97.0 or later

## Usage

1. Open your project in VS Code.
2. Open the "Project to Text" view in the Explorer sidebar.
3. Use the checkboxes to select files/folders, or use the context menu to toggle selection.
4. Click the "Generate" command (from the view or command palette) to create a structured text document of your selected files.
5. Use "Quick Generate" for a fast file picker experience.

## Extension Settings

This extension contributes the following settings (see VS Code settings under "Project to Text"):

- `projectToText.include`: Array of glob patterns for files to include (default: `["**/*"]`).
- `projectToText.exclude`: Array of glob patterns for files to exclude (default: `["**/node_modules/**", "**/.git/**", ...]`).

## Commands

- `Project to Text: Generate` – Generate structured text from selected files
- `Project to Text: Quick Generate` – Use a quick pick dialog to select files
- `Project to Text: Select All` / `Select None` – Quickly select or deselect all files
- `Project to Text: Refresh` – Reload the file tree and settings

## Testing

Run all tests with:

```sh
pnpm test
```

All tests are pure mocks and do not require a real file system or VS Code instance.

## Known Issues

- File system warnings may appear in the test output; these are expected and do not affect test results.
- Large projects may take a few seconds to scan on first load.

## Release Notes

### 0.0.2
- Robust file selection and tree logic
- Pure mock tests for all edge cases
- All tests pass under VS Code extension test runner

### 1.0.0 (planned)
- Improved documentation and UX polish

---

**Enjoy using Project to Text!**
