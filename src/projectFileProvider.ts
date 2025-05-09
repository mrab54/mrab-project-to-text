import * as vscode from 'vscode';

/**
 * Convert a TreeItem's label (which can be string|TreeItemLabel|undefined)
 * to a plain string. If it's a TreeItemLabel, extract its 'label' property.
 */
function toStringLabel(label: string | vscode.TreeItemLabel | undefined): string {
  if (!label) {
    return '';
  }
  if (typeof label === 'string') {
    return label;
  }
  // If it's a TreeItemLabel object, return its .label property
  return label.label;
}

/**
 * Single node in our tree, can be a file or directory.
 * "uri" is guaranteed to be a valid Uri for easy use.
 */
export class FileNode extends vscode.TreeItem {
  public children?: FileNode[];
  public selected: boolean;
  public readonly uri: vscode.Uri;

  constructor(uri: vscode.Uri, label: string, collapsibleState: vscode.TreeItemCollapsibleState, selected: boolean) {
    super(label, collapsibleState);

    this.uri = uri; // guaranteed Uri
    this.resourceUri = uri; // for VS Code icons, etc.
    this.selected = selected;

    this.description = selected ? '✓' : '';
    this.setContextValueAsync();
  }

  private async setContextValueAsync(): Promise<void> {
    try {
      const stat = await vscode.workspace.fs.stat(this.uri);
      this.contextValue = stat.type === vscode.FileType.Directory ? 'directory' : 'file';
    } catch (err) {
      console.error(`[FileNode] Error reading file type for ${this.uri.fsPath}:`, err);
      this.contextValue = 'file';
    }
  }
}

/**
 * The main TreeDataProvider that:
 *  - Loads config from "projectToText"
 *  - Finds all files in workspace
 *  - Marks "selected" if they match user's include/exclude globs
 *  - Allows toggling or selecting/deselecting items
 */
export class ProjectFileProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileNode | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootNodes: FileNode[] = [];
  private nodeIndex: Record<string, FileNode> = {};

  private includeGlobs: string[] = [];
  private excludeGlobs: string[] = [];

  constructor() {
    this.loadConfig();
  }

  /**
   * Public method to re-read config from settings
   * and rebuild the file tree.
   */
  public loadConfig(): void {
    console.debug('[ProjectFileProvider] loadConfig() invoked...');
    const config = vscode.workspace.getConfiguration('projectToText');
    this.includeGlobs = config.get<string[]>('include') ?? ['**/*'];
    this.excludeGlobs = config.get<string[]>('exclude') ?? ['**/node_modules/**', '**/.git/**'];
    void this.buildFileTree();
  }

  public getTreeItem(element: FileNode): vscode.TreeItem {
    // Convert element.label (string|TreeItemLabel|undefined) to a string
    const oldLabel = toStringLabel(element.label);

    // If node is selected, show "[✓] label"; else "[ ] label".
    const prefix = element.selected ? '[✓] ' : '[ ] ';
    // remove any existing bracket prefix if it already exists
    const rawLabel = oldLabel.replace(/^\[.*\]\s/, '');
    element.label = prefix + rawLabel;

    element.description = element.selected ? '✓' : '';
    return element;
  }

  public getChildren(element?: FileNode): FileNode[] {
    return element?.children ?? this.rootNodes;
  }

  /**
   * Builds the file tree for the workspace, marking selected files.
   * Refactored for clarity and maintainability.
   */
  private async buildFileTree(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      console.warn('[ProjectFileProvider] No workspace folder is open.');
      this.rootNodes = [];
      this.nodeIndex = {};
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    // Gather all files in the workspace
    const allFiles = await vscode.workspace.findFiles('**/*');
    allFiles.sort((a, b) => a.fsPath.localeCompare(b.fsPath));

    // Convert multiple globs to a single brace pattern
    const includePattern = this.toBracePattern(this.includeGlobs);
    const excludePattern = this.toBracePattern(this.excludeGlobs);

    // Determine which files are "included"
    const includedFiles = await vscode.workspace.findFiles(includePattern, excludePattern);
    const includedSet = new Set(includedFiles.map((uri) => uri.fsPath));

    // Clear old data
    this.rootNodes = [];
    this.nodeIndex = {};

    const workspaceRoot = folders[0].uri;

    // Helper to add a node (directory or file) to the tree
    const addNode = (segments: string[], fileUri: vscode.Uri, isSelected: boolean) => {
      let currentPath = '';
      let parentArray = this.rootNodes;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isLast = i === segments.length - 1;
        currentPath = currentPath ? `${currentPath}/${seg}` : seg;

        if (!isLast) {
          // Directory segment
          if (!this.nodeIndex[currentPath]) {
            const dirUri = vscode.Uri.joinPath(workspaceRoot, currentPath);
            const folderNode = new FileNode(dirUri, seg, vscode.TreeItemCollapsibleState.Collapsed, false);
            folderNode.children = [];
            parentArray.push(folderNode);
            this.nodeIndex[currentPath] = folderNode;
          }
          parentArray = this.nodeIndex[currentPath].children!;
        } else {
          // File segment
          const fileNode = new FileNode(fileUri, seg, vscode.TreeItemCollapsibleState.None, isSelected);
          parentArray.push(fileNode);
          this.nodeIndex[currentPath] = fileNode;
        }
      }
    };

    for (const fileUri of allFiles) {
      const relPath = vscode.workspace.asRelativePath(fileUri);
      const segments = relPath.split(/[\\/]/);
      const isSelected = includedSet.has(fileUri.fsPath);
      addNode(segments, fileUri, isSelected);
    }

    this.sortNodes(this.rootNodes);
    this._onDidChangeTreeData.fire(undefined);
  }

  private sortNodes(nodes: FileNode[]): void {
    nodes.sort((a, b) => {
      // Directories first
      const aIsDir = a.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed;
      const bIsDir = b.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed;
      if (aIsDir && !bIsDir) {
        return -1;
      }
      if (!aIsDir && bIsDir) {
        return 1;
      }

      // Convert label to string for comparison
      const aLabel = toStringLabel(a.label);
      const bLabel = toStringLabel(b.label);
      return aLabel.localeCompare(bLabel);
    });
    for (const node of nodes) {
      if (node.children) { this.sortNodes(node.children);}
    }
  }

  private toBracePattern(globs: string[]): string {
    if (!globs || globs.length === 0) {
      return '';
    }
    if (globs.length === 1) {
      return globs[0];
    }
    return `{${globs.join(',')}}`;
  }

  public toggleFile(node: FileNode): void {
    const newState = !node.selected;
    node.selected = newState;

    const recurse = (children?: FileNode[]) => {
      if (!children) {return;}
      for (const c of children) {
        c.selected = newState;
        recurse(c.children);
      }
    };
    recurse(node.children);

    this._onDidChangeTreeData.fire(node);
  }

  public selectAll(): void {
    const recurse = (nodes: FileNode[]) => {
      for (const node of nodes) {
        node.selected = true;
        if (node.children) {
          recurse(node.children);
        }
      }
    };
    recurse(this.rootNodes);
    this._onDidChangeTreeData.fire(undefined);
  }

  public selectNone(): void {
    const recurse = (nodes: FileNode[]) => {
      for (const node of nodes) {
        node.selected = false;
        if (node.children) {
          recurse(node.children);
        }
      }
    };
    recurse(this.rootNodes);
    this._onDidChangeTreeData.fire(undefined);
  }

  public getSelectedFiles(): vscode.Uri[] {
    const output: vscode.Uri[] = [];

    const collect = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          collect(node.children);
        } else if (node.selected) {
          output.push(node.uri);
        }
      }
    };
    collect(this.rootNodes);
    return output;
  }
}
