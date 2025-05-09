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
    const orig = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
    Object.defineProperty(vscode.workspace, 'workspaceFolders', { get: () => undefined, configurable: true });
    const result = await generateStructuredText([fakeUri('foo.ts')]);
    assert.strictEqual(result, '');
    if (orig) {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', orig);
    }
  });

  test('includes project structure and file boundaries', async () => {
    // Mock workspace
    const orig = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
    Object.defineProperty(vscode.workspace, 'workspaceFolders', { get: () => [{ uri: fakeUri('') }], configurable: true });
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => ({
      getText: () => '// code for ' + uri.fsPath,
    });
    const result = await generateStructuredText([
      fakeUri('src/foo.ts'),
      fakeUri('src/bar.js'),
    ]);
    assert.match(result, /# Project Structure/);
    assert.match(result, /- file: foo.ts/);
    assert.match(result, /- file: bar.js/);
    assert.match(result, /# BEGIN FILE: src\/foo.ts/);
    assert.match(result, /# END FILE: src\/foo.ts/);
    assert.match(result, /```typescript/);
    assert.match(result, /```javascript/);
    if (orig) {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', orig);
    }
  });

  test('handles file read errors gracefully', async () => {
    const orig = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
    Object.defineProperty(vscode.workspace, 'workspaceFolders', { get: () => [{ uri: fakeUri('') }], configurable: true });
    (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath;
    (vscode.workspace as any).openTextDocument = async () => {
      throw new Error('fail to read');
    };
    const result = await generateStructuredText([fakeUri('src/bad.ts')]);
    assert.match(result, /Could not read file content/);
    if (orig) {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', orig);
    }
  });
});
