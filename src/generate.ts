import * as vscode from 'vscode';


/**
 * Generates a single text file that describes the project structure and embeds all selected code files.
 * The output is designed to be LLM-friendly: it includes a clear project tree, file boundaries, and file paths.
 * @param fileUris List of file URIs to include
 * @returns The concatenated, structured text
 */
export async function generateStructuredText(fileUris: vscode.Uri[]): Promise<string> {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    console.warn('[generateStructuredText] No workspace folders are open.');
    return '';
  }

  // 1. Build a hierarchical project tree (LLM-friendly, explicit markers)
  let treeText = '# Project Structure\n';
  const printedDirs = new Set<string>();
  const sortedPaths = fileUris.map((uri) => vscode.workspace.asRelativePath(uri)).sort();

  for (const relPath of sortedPaths) {
    const segments = relPath.split(/[\\/]/);
    let indent = '';
    let cumulativePath = '';
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      cumulativePath = cumulativePath ? `${cumulativePath}/${segment}` : segment;
      if (i < segments.length - 1) {
        if (!printedDirs.has(cumulativePath)) {
          treeText += `${indent}- folder: ${segment}/\n`;
          printedDirs.add(cumulativePath);
        }
        indent += '  ';
      } else {
        treeText += `${indent}- file: ${segment}\n`;
      }
    }
  }

  // 2. Embed each file's content with explicit file boundaries and metadata
  let combinedText = treeText + '\n';
  for (const uri of fileUris) {
    const relPath = vscode.workspace.asRelativePath(uri);
    combinedText += `# BEGIN FILE: ${relPath}\n`;
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      // Optionally, trim trailing whitespace and normalize line endings
      let content = doc.getText().replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
      // Optionally, add a code fence for LLMs
      const ext = relPath.split('.').pop()?.toLowerCase() || '';
      const lang = ext === 'ts' ? 'typescript' : ext === 'js' ? 'javascript' : '';
      if (lang) {
        combinedText += '```' + lang + '\n' + content + '\n```\n';
      } else {
        combinedText += content + '\n';
      }
    } catch (err) {
      console.error(`[generateStructuredText] Failed to read ${uri.fsPath}:`, err);
      combinedText += `((Could not read file content: ${err}))\n`;
    }
    combinedText += `# END FILE: ${relPath}\n\n`;
  }

  // 3. Add a summary section for LLMs (optional, but helpful)
  combinedText = '# PROJECT-TO-TEXT OUTPUT\n' +
    'This file contains the structure and contents of the selected project files.\n' +
    'Each file is delimited with clear markers.\n\n' +
    combinedText;

  return combinedText;
}
