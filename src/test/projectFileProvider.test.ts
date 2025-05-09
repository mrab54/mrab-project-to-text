
import * as assert from 'assert';
import * as vscode from 'vscode';
import { ProjectFileProvider, FileNode } from '../projectFileProvider';

suite('ProjectFileProvider', () => {
  let provider: ProjectFileProvider;

  setup(() => {
    provider = new ProjectFileProvider();
    (vscode.workspace as any).getConfiguration = () => ({
      get: (key: string) => {
        if (key === 'include') {return ['src/**/*.ts', 'src/**/*.js'];}
        if (key === 'exclude') {return ['**/node_modules/**'];}
        return undefined;
      },
    });
    // Use Object.defineProperty to override workspaceFolders getter
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      configurable: true,
      get: () => [{ uri: vscode.Uri.file(process.cwd()) }],
    });
  });

  test('handles edge case: toggling a file node with no children', async () => {
    (vscode.workspace as any).findFiles = async () => [
      { fsPath: 'src/leaf.ts', path: 'src/leaf.ts', scheme: 'file', with: () => ({}) },
    ];
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    // Pure mock: manually build the tree
    (provider as any).rootNodes = [
      {
        label: 'src',
        children: [
          { label: 'leaf.ts', selected: false, children: undefined },
        ],
        selected: false,
      },
    ];
    const leaf = (provider as any).rootNodes[0].children[0];
    provider.toggleFile(leaf);
    assert.strictEqual(leaf.selected, true);
    provider.toggleFile(leaf);
    assert.strictEqual(leaf.selected, false);
  });

  test('handles edge case: toggling a directory node with no children', async () => {
    (vscode.workspace as any).findFiles = async () => [];
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    // Add a directory node manually
    const dir = new FileNode({ fsPath: 'src/empty', path: 'src/empty', scheme: 'file', with: () => ({}) } as any, 'empty', vscode.TreeItemCollapsibleState.Collapsed, false);
    dir.children = [];
    (provider as any).rootNodes.push(dir);
    provider.toggleFile(dir);
    assert.strictEqual(dir.selected, true);
    provider.toggleFile(dir);
    assert.strictEqual(dir.selected, false);
  });

  test('handles error in getSelectedFiles (malformed tree)', async () => {
    (vscode.workspace as any).findFiles = async () => [
      { fsPath: 'src/a.ts', path: 'src/a.ts', scheme: 'file', with: () => ({}) },
    ];
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    // Corrupt the tree
    (provider as any).rootNodes[0].children = null;
    // Should not throw
    const selected = provider.getSelectedFiles();
    assert.ok(Array.isArray(selected));
  });

  test('selectAll/selectNone on empty tree does not throw', async () => {
    (vscode.workspace as any).findFiles = async () => [];
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    assert.doesNotThrow(() => provider.selectAll());
    assert.doesNotThrow(() => provider.selectNone());
    assert.deepStrictEqual((provider as any).rootNodes, []);
  });

  test('toggleFile on leaf node only toggles itself', async () => {
    // Pure mock: manually build the tree
    (provider as any).rootNodes = [
      {
        label: 'src',
        children: [
          { label: 'a.ts', selected: false, children: undefined },
        ],
        selected: false,
      },
    ];
    const root = (provider as any).rootNodes[0];
    provider.toggleFile(root.children[0]);
    assert.strictEqual(root.children[0].selected, true);
    provider.toggleFile(root.children[0]);
    assert.strictEqual(root.children[0].selected, false);
  });

  test('toggleFile on directory with mixed children toggles all', async () => {
    // Pure mock: manually build the tree
    (provider as any).rootNodes = [
      {
        label: 'src',
        children: [
          { label: 'a.ts', selected: false, children: undefined },
          {
            label: 'b',
            selected: false,
            children: [
              { label: 'b1.js', selected: true, children: undefined },
              { label: 'b2.js', selected: false, children: undefined },
            ],
          },
        ],
        selected: false,
      },
    ];
    const root = (provider as any).rootNodes[0];
    provider.selectNone();
    // Select b1.js only
    root.children[1].children[0].selected = true;
    // Toggle 'b' directory
    provider.toggleFile(root.children[1]);
    assert.strictEqual(root.children[1].selected, true);
    assert.strictEqual(root.children[1].children[0].selected, true);
    assert.strictEqual(root.children[1].children[1].selected, true);
  });

  test('getSelectedFiles returns correct files for deeply nested structure', async () => {
    (vscode.workspace as any).findFiles = async () => [
      { fsPath: 'src/a/b/c/d/e/file.ts', path: 'src/a/b/c/d/e/file.ts', scheme: 'file', with: () => ({}) },
    ];
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    provider.selectAll();
    const selected = provider.getSelectedFiles().map((u: any) => u.fsPath);
    assert.deepStrictEqual(selected, ['src/a/b/c/d/e/file.ts']);
  });

  test('handles duplicate file names in different folders', async () => {
    (vscode.workspace as any).findFiles = async () => [
      { fsPath: 'src/a/file.ts', path: 'src/a/file.ts', scheme: 'file', with: () => ({}) },
      { fsPath: 'src/b/file.ts', path: 'src/b/file.ts', scheme: 'file', with: () => ({}) },
    ];
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    provider.selectAll();
    const selected = provider.getSelectedFiles().map((u: any) => u.fsPath);
    assert.deepStrictEqual(selected.sort(), ['src/a/file.ts', 'src/b/file.ts']);
  });

  test('empty include/exclude globs selects all files', async () => {
    (vscode.workspace as any).getConfiguration = () => ({
      get: (key: string) => {
        if (key === 'include') {return [];}
        if (key === 'exclude') {return [];}
        return undefined;
      },
    });
    (vscode.workspace as any).findFiles = async () => [
      { fsPath: 'src/a.ts', path: 'src/a.ts', scheme: 'file', with: () => ({}) },
      { fsPath: 'src/b/b1.js', path: 'src/b/b1.js', scheme: 'file', with: () => ({}) },
    ];
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    provider.loadConfig();
    await (provider as any).buildFileTree();
    provider.selectAll();
    const selected = provider.getSelectedFiles().map((u: any) => u.fsPath);
    assert.deepStrictEqual(selected.sort(), ['src/a.ts', 'src/b/b1.js']);
  });

  test('handles error in setContextValueAsync gracefully', async () => {
    // Patch FileNode to throw in setContextValueAsync
    const orig = (FileNode.prototype as any).setContextValueAsync;
    (FileNode.prototype as any).setContextValueAsync = async function() { throw new Error('fail'); };
    (vscode.workspace as any).findFiles = async () => [
      { fsPath: 'src/a.ts', path: 'src/a.ts', scheme: 'file', with: () => ({}) },
    ];
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    // Should not throw
    (FileNode.prototype as any).setContextValueAsync = orig;
  });

  test('getSelectedFiles returns empty if none selected', async () => {
    (vscode.workspace as any).findFiles = async () => [
      { fsPath: 'src/a.ts', path: 'src/a.ts', scheme: 'file', with: () => ({}) },
    ];
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    provider.selectNone();
    const selected = provider.getSelectedFiles();
    assert.deepStrictEqual(selected, []);
  });
});