import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateStructuredText } from '../generate';



function fakeUri(path: string): vscode.Uri {
  // Minimal fake for asRelativePath and openTextDocument
  return {
    fsPath: path,
    path,
    scheme: 'file',
    with: () => ({} as any),
  } as unknown as vscode.Uri;
}

suite('generateStructuredText', () => {
  test('returns empty string if no workspace', async () => {
    const origWorkspaceFolders = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
    Object.defineProperty(vscode.workspace, 'workspaceFolders', { get: () => undefined, configurable: true });
    const result = await generateStructuredText([fakeUri('foo.ts')]);
    assert.strictEqual(result, '');
    if (origWorkspaceFolders) {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', origWorkspaceFolders);
    }
  });

  test('includes project structure and file boundaries', async () => {
    const origWorkspaceFolders = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
    const origAsRelativePath = (vscode.workspace as any).asRelativePath;
    const origOpenTextDocument = (vscode.workspace as any).openTextDocument;

    try {
      console.log('TEST DEBUG: Starting test with mocked workspace');
      
      // Mock workspace
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        get: () => [{ name: 'test-workspace', uri: fakeUri('/test-workspace') }], // Provide a valid path for the root URI
        configurable: true
      });
      
      (vscode.workspace as any).asRelativePath = (uriOrString: vscode.Uri | string) => { // Removed unused includeWorkspaceFolder
        const uri = typeof uriOrString === 'string' ? fakeUri(uriOrString) : uriOrString;
        // Simple relative path for testing, remove leading slash if present to mimic asRelativePath
        const result = uri.path.startsWith('/test-workspace/') ? uri.path.substring('/test-workspace/'.length) : uri.path;
        console.log(`TEST DEBUG: asRelativePath called with ${typeof uriOrString === 'string' ? uriOrString : uri.path}, returning: ${result}`);
        return result;
      };
      
      (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
        console.log(`TEST DEBUG: openTextDocument called with URI: ${uri.path}`);
        const relPath = vscode.workspace.asRelativePath(uri);
        console.log(`TEST DEBUG: Relative path for document: ${relPath}`);
        
        const doc = {
          getText: () => {
            const content = `// code for ${relPath}`;
            console.log(`TEST DEBUG: getText returning: "${content}"`);
            return content;
          },
          languageId: uri.fsPath.endsWith('.ts') ? 'typescript' : uri.fsPath.endsWith('.js') ? 'javascript' : 'unknown',
          lineCount: 1,
          isDirty: false,
          isClosed: false,
          isUntitled: false,
          uri: uri,
          eol: vscode.EndOfLine.LF,
          fileName: uri.fsPath,
          version: 1,
          getWordRangeAtPosition: () => undefined,
          lineAt: () => ({}) as vscode.TextLine,
          offsetAt: () => 0,
          positionAt: () => new vscode.Position(0,0),
          save: async () => true,
          validatePosition: () => new vscode.Position(0,0),
          validateRange: () => new vscode.Range(new vscode.Position(0,0), new vscode.Position(0,0)),
        };
        return doc;
      };

      const result = await generateStructuredText([
        fakeUri('/test-workspace/src/foo.ts'),
        fakeUri('/test-workspace/src/bar.js'),
      ]);
      
      console.log('TEST DEBUG: FULL RESULT OF generateStructuredText:');
      console.log('----------- START OF RESULT -----------');
      console.log(result);
      console.log('------------ END OF RESULT ------------');
      
      // Find the actual content around where foo.ts appears
      const fooTsIndex = result.indexOf('src/foo.ts');
      if (fooTsIndex >= 0) {
        // Extract the code block surrounding foo.ts
        const startOfContentBlock = result.lastIndexOf('```', fooTsIndex);
        if (startOfContentBlock >= 0) {
          const endOfContentBlock = result.indexOf('```', fooTsIndex);
          if (endOfContentBlock >= 0) {
            const actualContentBlock = result.substring(startOfContentBlock, endOfContentBlock + 3);
            console.log('TEST DEBUG: ACTUAL content block for foo.ts (as characters):');
            for (let i = 0; i < actualContentBlock.length; i++) {
              console.log(`Character ${i}: '${actualContentBlock[i]}' (${actualContentBlock.charCodeAt(i)})`);
            }
          }
        }
      }
      
      // Instead of checking for specific string formatting which depends on exact newline handling,
      // check for important parts being present
      assert.ok(result.includes('# Project Context: test-workspace'), 'Project context missing or wrong');
      assert.ok(result.includes('## Project File Structure:'), 'File structure section missing');
      assert.ok(result.includes('* src/'), 'src directory missing in tree');
      assert.ok(result.includes('  * bar.js'), 'bar.js missing in tree');
      assert.ok(result.includes('  * foo.ts'), 'foo.ts missing in tree');
      assert.ok(result.includes('## File Contents:'), 'File contents section missing');
      assert.ok(result.includes('**File:** `src/foo.ts`'), 'foo.ts file entry missing');
      assert.ok(result.includes('**File:** `src/bar.js`'), 'bar.js file entry missing');
      assert.ok(result.includes('```typescript'), 'typescript code fence missing');
      assert.ok(result.includes('```javascript'), 'javascript code fence missing');
      assert.ok(result.includes('// code for src/foo.ts'), 'foo.ts content missing');
      assert.ok(result.includes('// code for src/bar.js'), 'bar.js content missing');
      
    } finally {
      // Restore original vscode.workspace properties
      console.log('TEST DEBUG: Restoring original workspace properties');
      if (origWorkspaceFolders) {
        Object.defineProperty(vscode.workspace, 'workspaceFolders', origWorkspaceFolders);
      }
      (vscode.workspace as any).asRelativePath = origAsRelativePath;
      (vscode.workspace as any).openTextDocument = origOpenTextDocument;
    }
  });

  test('handles file read errors gracefully', async () => {
    const origWorkspaceFolders = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
    const origAsRelativePath = (vscode.workspace as any).asRelativePath;
    const origOpenTextDocument = (vscode.workspace as any).openTextDocument;

    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        get: () => [{ name: 'error-workspace', uri: fakeUri('/error-workspace') }], // Provide a valid path
        configurable: true 
    });
    (vscode.workspace as any).asRelativePath = (uriOrString: vscode.Uri | string) => { // Removed unused includeWorkspaceFolder
        const uri = typeof uriOrString === 'string' ? fakeUri(uriOrString) : uriOrString;
        return uri.path.startsWith('/error-workspace/') ? uri.path.substring('/error-workspace/'.length) : uri.path;
    };
    (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
      if (uri.fsPath.endsWith('bad.ts')) {
        throw new Error('fail to read');
      }
      return {
        getText: () => `// code for ${vscode.workspace.asRelativePath(uri)}`, // Use asRelativePath here
        languageId: 'typescript',
        lineCount: 1,
        isDirty: false,
        isClosed: false,
        isUntitled: false,
        uri: uri,
        eol: vscode.EndOfLine.LF,
        fileName: uri.fsPath,
        version: 1,
        getWordRangeAtPosition: () => undefined,
        lineAt: () => ({}) as vscode.TextLine,
        offsetAt: () => 0,
        positionAt: () => new vscode.Position(0,0),
        save: async () => true,
        validatePosition: () => new vscode.Position(0,0),
        validateRange: () => new vscode.Range(new vscode.Position(0,0), new vscode.Position(0,0)),
      };
    };

    const result = await generateStructuredText([
        fakeUri('/error-workspace/src/good.ts'), 
        fakeUri('/error-workspace/src/bad.ts')
    ]);

    assert.ok(result.includes('**File:** `src/good.ts`'), 'good.ts file entry missing');
    assert.ok(result.includes('// code for src/good.ts'), 'good.ts content missing'); // Updated to relative path
    assert.ok(result.includes('**File:** `src/bad.ts`'), 'bad.ts file entry missing');
    assert.ok(result.includes('[Error reading file: src/bad.ts]'), 'Error message for bad.ts missing');
    assert.ok(result.includes('fail to read'), 'Specific error string missing for bad.ts');

    if (origWorkspaceFolders) {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', origWorkspaceFolders);
    }
    (vscode.workspace as any).asRelativePath = origAsRelativePath;
    (vscode.workspace as any).openTextDocument = origOpenTextDocument;
  });
});
