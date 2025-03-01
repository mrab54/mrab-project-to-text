import * as vscode from 'vscode';

export async function generateStructuredText(fileUris: vscode.Uri[]): Promise<string> {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    console.warn('[generateStructuredText] No workspace folders are open.');
    return '';
  }

  let treeText = 'Project Structure:\n';
  const printedDirs = new Set<string>();
  const sortedPaths = fileUris.map((uri) => vscode.workspace.asRelativePath(uri)).sort();

  // Build a hierarchical text listing
  for (const relPath of sortedPaths) {
    const segments = relPath.split(/[\\/]/);
    let indent = '';
    let cumulativePath = '';

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      cumulativePath = cumulativePath ? `${cumulativePath}/${segment}` : segment;

      if (i < segments.length - 1) {
        if (!printedDirs.has(cumulativePath)) {
          treeText += `${indent}${segment}/\n`;
          printedDirs.add(cumulativePath);
        }
        indent += '  ';
      } else {
        // file
        treeText += `${indent}${segment}\n`;
      }
    }
  }

  // Then embed each file's content
  let combinedText = treeText + '\n';
  for (const uri of fileUris) {
    const relPath = vscode.workspace.asRelativePath(uri);
    combinedText += `<file path="${relPath}">\n`;
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      combinedText += doc.getText() + '\n';
    } catch (err) {
      console.error(`[generateStructuredText] Failed to read ${uri.fsPath}:`, err);
      combinedText += `((Could not read file content: ${err}))\n`;
    }
    combinedText += `</file>\n\n`;
  }

  return combinedText;
}
