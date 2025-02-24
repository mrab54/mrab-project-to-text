import * as vscode from "vscode";

async function generateStructuredText(fileUris: vscode.Uri[]): Promise<string> {
  if (!vscode.workspace.workspaceFolders) {
    return '';
  }
  const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;

  // 1. Generate file tree text (project structure)
  let treeText = 'Project Structure:\n';
  const printedDirs = new Set<string>();
  const sortedPaths = fileUris.map(uri => vscode.workspace.asRelativePath(uri)).sort();

  for (const relPath of sortedPaths) {
    const segments = relPath.split(/[\/\\]/);
    let indent = '';
    let cumulativePath = '';
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      cumulativePath = cumulativePath ? `${cumulativePath}/${segment}` : segment;
      if (i < segments.length - 1) {
        if (printedDirs.has(cumulativePath)) {
          indent += '  ';
          continue;
        }
        treeText += `${indent}${segment}/\n`;
        printedDirs.add(cumulativePath);
        indent += '  ';
      } else {
        treeText += `${indent}${segment}\n`;
      }
    }
  }

  // 2. Gather content of each file with delimiters
  let combinedText = treeText + '\n';
  for (const uri of fileUris) {
    const relPath = vscode.workspace.asRelativePath(uri);
    combinedText += `<file path="${relPath}">\n`;
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      combinedText += content + '\n';
    } catch (err) {
      combinedText += `((Could not read file content: ${err}))\n`;
    }
    combinedText += `</file>\n\n`;
  }

  return combinedText;
}

export { generateStructuredText };