import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isDirectory } from './utils';

/** Represents a file or folder item in the project tree. */
class ProjectFileItem extends vscode.TreeItem {
  constructor(
    public resourceUri: vscode.Uri,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.resourceUri = resourceUri;
  }
}

export class ProjectFileTreeProvider implements vscode.TreeDataProvider<ProjectFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ProjectFileItem | undefined> = new vscode.EventEmitter<ProjectFileItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<ProjectFileItem | undefined> = this._onDidChangeTreeData.event;

  /** Patterns for files/directories to ignore (e.g., from .gitignore). */
  private ignorePatterns: string[];

  constructor(private workspaceRoot: string, ignorePatterns: string[] = []) {
    this.workspaceRoot = workspaceRoot;
    this.ignorePatterns = ignorePatterns;
  }

  /** Refreshes the entire tree view. */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ProjectFileItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectFileItem): Promise<ProjectFileItem[]> {
    // Determine which directory to list: either root or a subfolder.
    const dirPath = element ? element.resourceUri.fsPath : this.workspaceRoot;
    if (!dirPath) {
      console.warn('ProjectFileTreeProvider: No workspace directory found to provide children.');
      return [];
    }

    try {
      const dirEntries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const items: ProjectFileItem[] = [];

      for (const entry of dirEntries) {
        const fullPath = path.join(dirPath, entry.name);
        // Apply ignore patterns: skip any file/folder that matches an ignore rule.
        if (this.shouldIgnore(fullPath)) {
          console.debug(`ProjectFileTreeProvider: Ignoring ${fullPath} (matched ignore pattern)`);
          continue;
        }

        if (entry.isDirectory()) {
          // Create a collapsible tree item for directories.
          const folderItem = new ProjectFileItem(vscode.Uri.file(fullPath), entry.name, vscode.TreeItemCollapsibleState.Collapsed);
          folderItem.contextValue = 'folder';  // tag for potential use in commands or UI
          items.push(folderItem);
        } else {
          // Create a leaf tree item for files.
          const fileItem = new ProjectFileItem(vscode.Uri.file(fullPath), entry.name, vscode.TreeItemCollapsibleState.None);
          fileItem.contextValue = 'file';
          items.push(fileItem);
        }
      }

      // Sort items: folders first (alphabetically), then files (alphabetically)
      items.sort((a, b) => {
        if (a.contextValue === b.contextValue) {
          return a.label.localeCompare(b.label);
        }
        return a.contextValue === 'folder' ? -1 : 1;
      });

      return items;
    } catch (error) {
      console.error(`ProjectFileTreeProvider: Error reading directory "${dirPath}":`, error);
      return [];
    }
  }

  /** Determine if a given file path should be ignored based on the ignore patterns. */
  private shouldIgnore(filePath: string): boolean {
    return this.ignorePatterns.some(pattern => {
      // Simple pattern check: exact match or prefix match.
      // In a real-world case, use glob matching (e.g., minimatch) for ignore patterns.
      return filePath.includes(pattern);
    });
  }
}
