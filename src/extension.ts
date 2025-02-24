import * as vscode from "vscode";
import { generateStructuredText } from "./generate";

class FileNode extends vscode.TreeItem {
  public children: FileNode[] | undefined;
  public selected: boolean;

  constructor(
    public readonly uri: vscode.Uri,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    selected: boolean = true
  ) {
    super(label, collapsibleState);
    this.selected = selected;
    this.resourceUri = uri;
    this.tooltip = uri.fsPath;
    this.description = this.selected ? "✓" : "";
    // Set contextValue asynchronously (see below)
    this.setContextValue();
  }

  // Asynchronous method to set the contextValue
  private async setContextValue() {
    this.contextValue = (await isDirectory(this.uri)) ? "directory" : "file";
  }
}

// Use async/await for isDirectory
async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.type === vscode.FileType.Directory;
  } catch {
    return false;
  }
}

class ProjectFileProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    FileNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootNodes: FileNode[] = [];
  private nodeIndex: { [path: string]: FileNode } = {};
  private includeGlobs: string[] = [];
  private excludeGlobs: string[] = [];

  constructor() {
    this.loadConfig(); // Load config initially
  }

  private loadConfig() {
    const config = vscode.workspace.getConfiguration("projectToText");
    this.includeGlobs = config.get<string[]>("include") ?? ["**/*"];
    this.excludeGlobs = config.get<string[]>("exclude") ?? [
      "**/node_modules/**",
      "**/.git/**",
    ];
    this.buildFileTree(); // Rebuild tree when config changes
  }
  // Refresh file tree
  public async refresh(): Promise<void> {
    await this.buildFileTree();
    // The _onDidChangeTreeData event should be fired *after* the tree is built
  }

  private async buildFileTree() {
    if (!vscode.workspace.workspaceFolders) {
      this.rootNodes = [];
      this.nodeIndex = {};
      this._onDidChangeTreeData.fire(undefined); // Refresh even if no workspace folders
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;
    const fileUris = await vscode.workspace.findFiles(
      this.includeGlobs.join(","),
      this.excludeGlobs.join(",")
    );
    fileUris.sort((a, b) => a.fsPath.localeCompare(b.fsPath));

    this.rootNodes = [];
    this.nodeIndex = {};
    const dirMap = new Map<string, FileNode>();

    // ***  Use Promise.all to handle asynchronous setContextValue calls
    await Promise.all(
      fileUris.map(async (uri) => {
        const relativePath = vscode.workspace.asRelativePath(uri);
        const segments = relativePath.split(/[\/\\]/);
        let currentPath = "";
        let parentNodeArray = this.rootNodes;

        for (let i = 0; i < segments.length; i++) {
          const name = segments[i];
          currentPath = currentPath ? `${currentPath}/${name}` : name;
          const isFile = i === segments.length - 1;

          if (isFile) {
            const fileNode = new FileNode(
              uri,
              name,
              vscode.TreeItemCollapsibleState.None,
              true
            );
            parentNodeArray.push(fileNode);
            this.nodeIndex[currentPath] = fileNode;
            // We don't need to await setContextValue here; it's handled by Promise.all
          } else {
            if (!this.nodeIndex[currentPath]) {
              const folderNode = new FileNode(
                vscode.Uri.joinPath(workspaceRoot, currentPath),
                name,
                vscode.TreeItemCollapsibleState.Collapsed,
                true
              );
              folderNode.children = [];
              parentNodeArray.push(folderNode);
              this.nodeIndex[currentPath] = folderNode;
            }
            parentNodeArray = (this.nodeIndex[currentPath] as FileNode)
              .children!;
          }
        }
      })
    ); // Close Promise.all here

    this.sortNodes(this.rootNodes); // Sort after building
    this._onDidChangeTreeData.fire(undefined); // Fire *after* Promise.all completes
  }

  private sortNodes(nodes: FileNode[]) {
    nodes.sort((a, b) => {
      if (
        a.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed &&
        b.collapsibleState !== vscode.TreeItemCollapsibleState.Collapsed
      ) {
        return -1; // Directories first
      } else if (
        a.collapsibleState !== vscode.TreeItemCollapsibleState.Collapsed &&
        b.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed
      ) {
        return 1; // Files after directories
      }
      return a.label.localeCompare(b.label); // Then alphabetical
    });
    for (const node of nodes) {
      if (node.children) {
        this.sortNodes(node.children);
      }
    }
  }

  getChildren(element?: FileNode): FileNode[] {
    if (!element) {
      return this.rootNodes;
    }
    return element.children || [];
  }

  getTreeItem(element: FileNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.uri, element.collapsibleState);
    treeItem.label = element.selected
      ? `[✓] ${element.label}`
      : `[ ] ${element.label}`;
    treeItem.description = element.selected ? "✓" : "";
    treeItem.tooltip = element.tooltip;
    treeItem.resourceUri = element.resourceUri;
    treeItem.contextValue = element.contextValue; // Set contextValue for menu contributions

    return treeItem;
  }

  toggleFile(node: FileNode) {
    const newState = !node.selected;
    node.selected = newState;

    const toggleChildren = (nodes: FileNode[]) => {
      for (const child of nodes) {
        child.selected = newState;
        if (child.children) {
          toggleChildren(child.children);
        }
      }
    };

    if (node.children) {
      toggleChildren(node.children);
    }
    this._onDidChangeTreeData.fire(node);
  }

  getSelectedFiles(): vscode.Uri[] {
    const selected: vscode.Uri[] = [];
    const collectSelected = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.children) {
          collectSelected(node.children);
        } else if (node.selected) {
          selected.push(node.uri);
        }
      }
    };
    collectSelected(this.rootNodes);
    return selected;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const treeDataProvider = new ProjectFileProvider();
  vscode.window.registerTreeDataProvider("projectToText", treeDataProvider); // Corrected view ID

  // Configuration change listener
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("projectToText")) {
      treeDataProvider.refresh(); // Use the refresh method
      vscode.window.showInformationMessage("Project to Text config updated!");
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectToText.toggleFile",
      (node: FileNode) => {
        treeDataProvider.toggleFile(node);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("projectToText.generate", async () => {
      const filesToInclude = treeDataProvider.getSelectedFiles();
      if (filesToInclude.length === 0) {
        vscode.window.showWarningMessage(
          "No files selected for Project to Text."
        );
        return;
      }
      const outputText = await generateStructuredText(filesToInclude);
      const doc = await vscode.workspace.openTextDocument({
        content: outputText,
        language: "plaintext",
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    })
  );
  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("projectToText.refresh", () => {
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("projectToText.generateQuick", async () => {
      const config = vscode.workspace.getConfiguration("projectToText");
      const includeGlobs = config.get<string[]>("include") ?? ["**/*"];
      const excludeGlobs = config.get<string[]>("exclude") ?? [
        "**/node_modules/**",
        "**/.git/**",
      ];
      const files = await vscode.workspace.findFiles(
        includeGlobs.join(","),
        excludeGlobs.join(",")
      );

      const items = files.map((uri) => {
        const rel = vscode.workspace.asRelativePath(uri);
        return { label: rel, uri: uri, picked: true };
      });

      const selection = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        title: "Select files to include",
        placeHolder: "Choose files for Project to Text output",
      });

      if (!selection) {
        return;
      }

      const chosenUris = selection.map((item) => item.uri);
      const outputText = await generateStructuredText(chosenUris);
      const doc = await vscode.workspace.openTextDocument({
        content: outputText,
        language: "plaintext",
      });
      vscode.window.showTextDocument(doc);
    })
  );
}

export function deactivate() {}
