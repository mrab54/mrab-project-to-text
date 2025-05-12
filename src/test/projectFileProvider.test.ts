import * as assert from 'assert';
import * as vscode from 'vscode';
import { ProjectFileProvider, FileNode } from '../projectFileProvider';
import * as sinon from 'sinon';
import * as path from 'path';

function mockUri(fsPath: string): vscode.Uri {
  const fullPath = path.isAbsolute(fsPath) ? fsPath : path.join(process.cwd(), 'mock-workspace', fsPath);
  return vscode.Uri.file(fullPath);
}

suite('ProjectFileProvider', () => {
  let provider: ProjectFileProvider;
  let statStub: sinon.SinonStub;
  let readDirectoryStub: sinon.SinonStub;
  let findFilesStub: sinon.SinonStub; // This will be our manually replaced stub
  let readFileStub: sinon.SinonStub;
  
  let originalFs: typeof vscode.workspace.fs;
  let originalWorkspaceFolders: typeof vscode.workspace.workspaceFolders;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
  let originalAsRelativePath: (target: vscode.Uri | string, includeWorkspaceFolder?: boolean | undefined) => string;
  let originalFindFiles: (include: vscode.GlobPattern, exclude?: vscode.GlobPattern | null, maxResults?: number, token?: vscode.CancellationToken) => Thenable<vscode.Uri[]>; 

  setup(async () => { // Make setup async
    // Store original vscode.workspace properties first
    originalFs = vscode.workspace.fs;
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    originalGetConfiguration = vscode.workspace.getConfiguration;
    originalAsRelativePath = vscode.workspace.asRelativePath;
    originalFindFiles = vscode.workspace.findFiles;

    // Mock getConfiguration
    (vscode.workspace as any).getConfiguration = () => ({
      get: (key: string) => {
        if (key === 'include') { return ['src/**/*.ts', 'src/**/*.js']; }
        if (key === 'exclude') { return ['**/node_modules/**']; }
        return undefined;
      },
    });

    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      configurable: true,
      get: () => [{ uri: vscode.Uri.file(path.join(process.cwd(), 'mock-workspace')) }], 
    });

    const mockFsMethods = {
      stat: sinon.stub(),
      readDirectory: sinon.stub(),
      readFile: sinon.stub(),
      writeFile: sinon.stub().resolves(undefined),
      delete: sinon.stub().resolves(undefined),
      rename: sinon.stub().resolves(undefined),
      copy: sinon.stub().resolves(undefined),
      createDirectory: sinon.stub().resolves(undefined),
    };
    // Use Object.defineProperty to mock vscode.workspace.fs
    Object.defineProperty(vscode.workspace, 'fs', {
        configurable: true,
        value: mockFsMethods,
    });

    statStub = mockFsMethods.stat;
    readDirectoryStub = mockFsMethods.readDirectory;
    readFileStub = mockFsMethods.readFile;

    const newFindFilesStub = sinon.stub();
    Object.defineProperty(vscode.workspace, 'findFiles', {
        configurable: true,
        value: newFindFilesStub
    });
    findFilesStub = newFindFilesStub; // Assign to the variable used in tests

    statStub.callsFake(async (uri: vscode.Uri) => {
      const fsPath = uri.fsPath;
      // Heuristic: if path has a common file extension or ends with specific test names.
      if (fsPath.match(/\.[^/.]+$/) || fsPath.endsWith('leaf') || fsPath.includes('.ts') || fsPath.includes('.js')) {
        return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 };
      }
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    });
    readDirectoryStub.resolves([]); // Default to empty directory
    readFileStub.resolves(new Uint8Array(Buffer.from(''))); // Default for readFile
    findFilesStub.resolves([]); // Default behavior for the new findFilesStub

    // Mock asRelativePath for consistent behavior in tests
    (vscode.workspace as any).asRelativePath = (targetUriOrPath: vscode.Uri | string, _includeWorkspaceFolder?: boolean) => {
      const targetPath = typeof targetUriOrPath === 'string' ? targetUriOrPath : targetUriOrPath.fsPath;
      const wsPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
      // Ensure paths are normalized for comparison, especially on Windows
      return path.relative(wsPath, targetPath).replace(/\\/g, '/');
    };

    // Instantiate the provider AFTER all mocks are set up
    provider = new ProjectFileProvider();
    // Await the initial tree build
    await (provider as any).buildFileTree(); 
  });

  teardown(() => {
    sinon.restore(); 
    
    Object.defineProperty(vscode.workspace, 'fs', {
        configurable: true,
        value: originalFs,
    });
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        configurable: true,
        value: originalWorkspaceFolders, 
    });
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
        configurable: true,
        value: originalGetConfiguration, 
    });
    Object.defineProperty(vscode.workspace, 'asRelativePath', {
        configurable: true,
        value: originalAsRelativePath,
    });
    Object.defineProperty(vscode.workspace, 'findFiles', {
        configurable: true,
        value: originalFindFiles,
    });
  });

  test('handles edge case: toggling a file node with no children', async () => {
    findFilesStub.callsFake(async (include: string, exclude?: string | null) => {
      // console.error(`[Test file node] findFiles: include='${include}', exclude='${exclude}'`);
      if (include === '{src/**/*.ts,src/**/*.js}' && exclude === '**/node_modules/**') {
        // This is for the initial selection state. Return empty so leaf.ts is not initially selected.
        return [];
      }
      if (include === '**/*') {
        // This is for discovering all files to build the tree structure.
        return [mockUri('src/leaf.ts')];
      }
      // console.error(`[Test file node] UNMATCHED findFiles call: include='${include}', exclude='${exclude}'`);
      return []; // Default to empty for any other unexpected calls
    });

    await (provider as any).buildFileTree(); 
    const srcDir = (provider as any).rootNodes.find((n:FileNode) => n.label === 'src');
    assert.ok(srcDir, "src directory not found");
    const leafNode = srcDir.children.find((n:FileNode) => n.label === 'leaf.ts');
    assert.ok(leafNode, 'Leaf node should exist');
    assert.strictEqual(leafNode.selected, false, "Leaf node selected state before first toggle is not false"); // Diagnostic assertion
    provider.toggleFile(leafNode);
    assert.strictEqual(leafNode.selected, true);
    provider.toggleFile(leafNode);
    assert.strictEqual(leafNode.selected, false);
  });

  test('handles edge case: toggling a directory node with no children', async () => {
    findFilesStub.callsFake(async (include: string, exclude?: string | null) => {
      // console.error(`[Test dir node] findFiles: include='${include}', exclude='${exclude}'`);
      if (include === '{src/**/*.ts,src/**/*.js}' && exclude === '**/node_modules/**') {
        // This is for the initial selection state. Return empty so 'empty' dir is not initially selected.
        return [];
      }
      if (include === '**/*') {
        // This is for discovering all files to build the tree structure.
        return [mockUri('src/empty')];
      }
      // console.error(`[Test dir node] UNMATCHED findFiles call: include='${include}', exclude='${exclude}'`);
      return []; // Default to empty for any other unexpected calls
    });

    statStub.withArgs(sinon.match((uri: vscode.Uri) => uri.fsPath.endsWith('src/empty'))).resolves({ type: vscode.FileType.Directory, ctime:0,mtime:0,size:0 });
    readDirectoryStub.withArgs(sinon.match((uri: vscode.Uri) => uri.fsPath.endsWith('src/empty'))).resolves([]);
    // Tree should be built by setup, but we might need to refresh if findFilesStub changes for a specific test
    await (provider as any).buildFileTree(); 
    const srcDir = (provider as any).rootNodes.find((n:FileNode) => n.label === 'src');
    assert.ok(srcDir, "src directory not found");
    const dirNode = srcDir.children.find((n:FileNode) => n.label === 'empty');
    assert.ok(dirNode, "Directory node 'empty' should exist");
    assert.strictEqual(dirNode.selected, false, "Directory node selected state before first toggle is not false"); // Diagnostic assertion
    provider.toggleFile(dirNode);
    assert.strictEqual(dirNode.selected, true);
    provider.toggleFile(dirNode);
    assert.strictEqual(dirNode.selected, false);
  });

  test('handles error in getSelectedFiles (malformed tree)', async () => {
    findFilesStub.resolves([mockUri('src/a.ts')]);
    await (provider as any).buildFileTree();
    // Ensure rootNodes[0] (e.g. 'src') exists before trying to corrupt its children
    const srcDir = (provider as any).rootNodes.find((n:FileNode) => n.label === 'src');
    assert.ok(srcDir, "src directory not found for tree corruption test");
    srcDir.children = null; // Corrupt the tree
    const selected = provider.getSelectedFiles();
    assert.ok(Array.isArray(selected));
    assert.strictEqual(selected.length, 0);
  });

  test('selectAll/selectNone on empty tree does not throw', async () => {
    findFilesStub.resolves([]);
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    assert.doesNotThrow(() => provider.selectAll());
    assert.doesNotThrow(() => provider.selectNone());
    assert.deepStrictEqual((provider as any).rootNodes, []);
  });

  test('toggleFile on leaf node only toggles itself', async () => {
    findFilesStub.resolves([mockUri('src/a.ts')]);
    statStub.withArgs(sinon.match((uri: vscode.Uri) => uri.fsPath.endsWith('src/a.ts'))).resolves({ type: vscode.FileType.File, ctime:0,mtime:0,size:0 });
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    const leafNode = (provider as any).rootNodes[0].children[0];
    assert.ok(leafNode, 'Leaf node should exist');
    provider.toggleFile(leafNode);
    assert.strictEqual(leafNode.selected, true);
    provider.toggleFile(leafNode);
    assert.strictEqual(leafNode.selected, false);
  });

  test('toggleFile on directory with mixed children toggles all', async () => {
    findFilesStub.resolves([
        mockUri('src/a.ts'),
        mockUri('src/b/b1.js'),
        mockUri('src/b/b2.js'),
    ]);
    statStub.withArgs(sinon.match((uri: vscode.Uri) => uri.fsPath.endsWith('src/b'))).resolves({ type: vscode.FileType.Directory, ctime:0,mtime:0,size:0 });
    readDirectoryStub.withArgs(sinon.match((uri: vscode.Uri) => uri.fsPath.endsWith('src/b'))).resolves([
        [ 'b1.js', vscode.FileType.File],
        [ 'b2.js', vscode.FileType.File],
    ] as [string, vscode.FileType][]);

    await (provider as any).buildFileTree();
    
    const srcDir = (provider as any).rootNodes.find((n:FileNode) => n.label === 'src');
    assert.ok(srcDir, "src directory not found in rootNodes");
    const dirB = srcDir.children.find((n:FileNode) => n.label === 'b');
    assert.ok(dirB, "Directory 'b' not found");
    assert.ok(dirB.children && dirB.children.length > 0, "Directory 'b' should have children");

    provider.selectNone(); // Ensure clean state
    const b1Node = dirB.children.find((n:FileNode) => n.label === 'b1.js');
    assert.ok(b1Node, "b1.js node not found");
    b1Node.selected = true; // Pre-select one child

    provider.toggleFile(dirB);
    assert.strictEqual(dirB.selected, true, "Directory b should be selected");
    assert.strictEqual(dirB.children.find((n:FileNode) => n.label === 'b1.js').selected, true, "b1.js should be selected");
    assert.strictEqual(dirB.children.find((n:FileNode) => n.label === 'b2.js').selected, true, "b2.js should be selected");
  });

  test('getSelectedFiles returns correct files for deeply nested structure', async () => {
    findFilesStub.resolves([mockUri('src/a/b/c/d/e/file.ts')]);
    // asRelativePath is mocked in setup
    await (provider as any).buildFileTree();
    provider.selectAll();
    const selectedUris = provider.getSelectedFiles();
    const wsPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const selectedPaths = selectedUris.map(u => path.relative(wsPath, u.fsPath).replace(/\\/g, '/'));
    assert.deepStrictEqual(selectedPaths.sort(), ['src/a/b/c/d/e/file.ts']);
  });

  test('handles duplicate file names in different folders', async () => {
    findFilesStub.resolves([
      mockUri('src/a/file.ts'),
      mockUri('src/b/file.ts'),
    ]);
    // asRelativePath is mocked in setup
    await (provider as any).buildFileTree();
    provider.selectAll();
    const selectedUris = provider.getSelectedFiles();
    const wsPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const selectedPaths = selectedUris.map(u => path.relative(wsPath, u.fsPath).replace(/\\/g, '/'));
    assert.deepStrictEqual(selectedPaths.sort(), ['src/a/file.ts', 'src/b/file.ts']);
  });

  test('empty include/exclude globs selects all files', async () => {
    const originalGetConfig = vscode.workspace.getConfiguration;
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
        configurable: true,
        value: () => ({
            get: (key: string) => {
              if (key === 'include') {return [];} // Empty include
              if (key === 'exclude') {return [];} // Empty exclude
              return undefined;
            },
          })
    });
    
    findFilesStub.resolves([
      mockUri('src/a.ts'),
      mockUri('src/b/b1.js'),
    ]);
    // asRelativePath is mocked in setup
    provider.loadConfig(); // Reload config with empty globs
    await (provider as any).buildFileTree();
    provider.selectAll();
    const selectedUris = provider.getSelectedFiles();
    const wsPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const selectedPaths = selectedUris.map(u => path.relative(wsPath, u.fsPath).replace(/\\/g, '/'));
    assert.deepStrictEqual(selectedPaths.sort(), ['src/a.ts', 'src/b/b1.js']);

    Object.defineProperty(vscode.workspace, 'getConfiguration', {
        configurable: true,
        value: originalGetConfig, // Restore original
    });
  });

  test('handles error in setContextValueAsync gracefully', async () => {
    statStub.withArgs(sinon.match((uri: vscode.Uri) => uri.fsPath.endsWith('src/a.ts'))).rejects(new Error('fail stat'));
    findFilesStub.resolves([mockUri('src/a.ts')]);
    
    await assert.doesNotReject(async () => {
        await (provider as any).buildFileTree();
    }, 'buildFileTree should not reject on stat error within setContextValueAsync');
    const rootSrc = (provider as any).rootNodes.find((n:FileNode) => n.label === 'src');
    assert.ok(rootSrc, "src directory should exist in rootNodes even with child error");
    if (rootSrc && rootSrc.children) {
        const nodeA = rootSrc.children.find((n:FileNode) => n.label === 'a.ts');
        assert.ok(nodeA, "a.ts node should exist even if stat failed");
    } else {
        assert.fail("src directory children not found or undefined");
    }
  });

  test('getSelectedFiles returns empty if none selected', async () => {
    findFilesStub.resolves([mockUri('src/a.ts')]);
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    await (provider as any).buildFileTree();
    provider.selectNone();
    const selected = provider.getSelectedFiles();
    assert.deepStrictEqual(selected, []);
  });
});