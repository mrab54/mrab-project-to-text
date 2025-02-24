import * as vscode from "vscode";
import { generateStructuredText } from "./generate";

export function activate(context: vscode.ExtensionContext) {
  // Read config file (project-to-text.json) if it exists
  // const config = getProjectConfig(); // (function defined later)
  const config = vscode.workspace.getConfiguration("projectToText");
  const includeGlobs = config.get<string[]>("include") ?? ["**/*"];
  const excludeGlobs = config.get<string[]>("exclude") ?? [
    "**/node_modules/**",
    "**/.git/**",
  ];

  // Use these patterns in your file-finding logic...
  // For example:
  // const uris = await vscode.workspace.findFiles(
  //   includeGlobs.join(','),
  //   excludeGlobs.join(',')
  // );

  // 2. Register event to re-load config if it changes (optional)
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("projectToText")) {
      // Re-read the updated config
      const newConfig = vscode.workspace.getConfiguration("projectToText");
      const newInclude = newConfig.get<string[]>("include");
      const newExclude = newConfig.get<string[]>("exclude");
      // Possibly rebuild your tree or refresh your extension state
      vscode.window.showInformationMessage("Project to Text config updated!");
    }
  });

  // Create and register TreeDataProvider for the file selection view
  const treeDataProvider = new ProjectFileProvider(includeGlobs, excludeGlobs);
  vscode.window.registerTreeDataProvider("projectToTextView", treeDataProvider);
  // The 'projectToTextView' ID is defined in package.json under contributes.views

  // Register a command to toggle file selection (when a tree item is clicked)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "projectToText.toggleFile",
      (node: FileNode) => {
        treeDataProvider.toggleFile(node);
      }
    )
  );
  // Register command for generating output (from command palette or from a button in the UI)
  context.subscriptions.push(
    vscode.commands.registerCommand("projectToText.generate", async () => {
      // Use currently selected files from the tree provider, or all included by default
      const filesToInclude = treeDataProvider.getSelectedFiles();
      const outputText = await generateStructuredText(filesToInclude);
      // Open the output in a new unsaved document
      const doc = await vscode.workspace.openTextDocument({
        content: outputText,
        language: "plaintext",
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    })
  );
  context.subscriptions.push(
    // (This approach is optional, if we want a command to manually pick files each time)
    vscode.commands.registerCommand("projectToText.generateQuick", async () => {
      // list all files (using same include/exclude logic)
      const files = await vscode.workspace.findFiles(
        "**/*",
        "**/node_modules/**"
      );
      const items = files.map((uri) => {
        const rel = vscode.workspace.asRelativePath(uri);
        return { label: rel, uri: uri, picked: true }; // QuickPickItem with pre-selected
      });
      const selection = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        title: "Select files to include",
        placeHolder: "Choose files for Project to Text output",
      });
      if (!selection) return; // cancelled
      const chosenUris = selection
        .filter((item) => !!item)
        .map((item) => item.uri);
      const outputText = await generateStructuredText(chosenUris);
      const doc = await vscode.workspace.openTextDocument({
        content: outputText,
        language: "plaintext",
      });
      vscode.window.showTextDocument(doc);
    })
  );
}

////////////////////////////////
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
    this.resourceUri = uri; // so VS Code may show file icon
    this.tooltip = uri.fsPath;
    // Show a check or unchecked indicator in the label to denote selection
    this.description = this.selected ? "✓" : ""; // or prepend in label, as desired
    // If directory, use collapsibleState to show children.
    // If file, make collapsibleState = None.
    // We can also set contextValue to differentiate file vs folder for conditional commands.
  }
}

///////////////////////////////
class ProjectFileProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    FileNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootNodes: FileNode[] = [];
  // We might maintain a map of file path -> FileNode for quick lookup when toggling.
  private nodeIndex: { [path: string]: FileNode } = {};

  constructor(includeGlobs: string[], excludeGlobs: string[]) {
    // Immediately build the tree on construction
    this.buildFileTree(includeGlobs, excludeGlobs);
  }

  // Build the file tree structure from workspace files
  private async buildFileTree(includeGlobs: string[], excludeGlobs: string[]) {
    if (!vscode.workspace.workspaceFolders) return;
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri; // assuming single-root workspace
    // Find files according to include/exclude globs
    const fileUris = await vscode.workspace.findFiles(
      includeGlobs.join(","), // combine patterns (glob syntax supports comma-separated)
      excludeGlobs.join(",")
    );
    fileUris.sort(); // sort URIs alphabetically for stable tree order

    // Build a nested tree out of the file paths
    const dirMap = new Map<string, FileNode>(); // map folder path -> folder node
    this.rootNodes = [];
    this.nodeIndex = {};

    for (const uri of fileUris) {
      const relativePath = vscode.workspace.asRelativePath(uri);
      const segments = relativePath.split(/[\/\\]/); // support both separators
      let currentPath = "";
      let parentNodeArray = this.rootNodes;
      // Iterate through path segments to create nodes
      for (let i = 0; i < segments.length; i++) {
        const name = segments[i];
        currentPath = currentPath ? `${currentPath}/${name}` : name;
        const isFile = i === segments.length - 1;
        if (isFile) {
          // Create file node
          const fileNode = new FileNode(
            uri,
            name,
            vscode.TreeItemCollapsibleState.None,
            true
          );
          parentNodeArray.push(fileNode);
          this.nodeIndex[currentPath] = fileNode;
        } else {
          // Directory segment
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
          // Move parentNodeArray reference to this folder's children for next iteration
          parentNodeArray = (this.nodeIndex[currentPath] as FileNode).children!;
        }
      }
    }
    // Sort children of each directory node alphabetically (files vs folders can be mixed, but could sort by type if needed).
    const sortNodes = (nodes: FileNode[]) => {
      nodes.sort((a, b) => a.label.localeCompare(b.label));
      for (const node of nodes) {
        if (node.children) sortNodes(node.children);
      }
    };
    sortNodes(this.rootNodes);
    this._onDidChangeTreeData.fire(undefined); // refresh view
  }

  getChildren(element?: FileNode): FileNode[] {
    if (!element) {
      // root level
      return this.rootNodes;
    }
    return element.children || [];
  }

  getTreeItem(element: FileNode): vscode.TreeItem {
    // Build a new TreeItem instead of mutating the old one:
    const treeItem = new vscode.TreeItem(element.uri, element.collapsibleState);
    // If you want to override the label
    treeItem.label = element.selected
      ? `[✓] ${element.label}`
      : `[ ] ${element.label}`;
    treeItem.description = element.selected ? "✓" : "";
    treeItem.tooltip = element.tooltip;
    treeItem.resourceUri = element.resourceUri;
    return treeItem;
  }

  // Toggle selection state of a file or folder node
  toggleFile(node: FileNode) {
    const newState = !node.selected;
    node.selected = newState;
    // If a folder node is toggled, apply to all its descendants
    if (node.children) {
      const toggleChildren = (nodes: FileNode[]) => {
        for (const child of nodes) {
          child.selected = newState;
          if (child.children) toggleChildren(child.children);
        }
      };
      toggleChildren(node.children);
    }
    // Optionally, if a child file is deselected, you might also deselect its parent if no children remain selected (not strictly necessary).
    this._onDidChangeTreeData.fire(node); // refresh this node (and possibly its children)
  }

  // Get URIs of all currently selected files (to include in output)
  getSelectedFiles(): vscode.Uri[] {
    const selected: vscode.Uri[] = [];
    const collectSelected = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.children) {
          // directory node
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

export function deactivate() {}
