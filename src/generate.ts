import * as vscode from 'vscode';
import * as path from 'path'; // Import path module


/**
 * Generates a single text file that describes the project structure and embeds all selected code files.
 * The output is designed to be LLM-friendly: it includes a clear project tree, file boundaries, and file paths.
 * @param fileUris List of file URIs to include
 * @returns The concatenated, structured text
 */
export async function generateStructuredText(fileUris: vscode.Uri[]): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('No workspace folder is open. Cannot generate project context.');
    return '';
  }
  const workspaceFolder = workspaceFolders[0];
  const workspaceName = workspaceFolder.name;

  let outputText = `# Project Context: ${workspaceName}\\n\\n`;
  outputText += `## Project File Structure:\\n\\n`;
  outputText += `The following is a tree representation of the selected files and folders from the project:\\n\\n`;

  // 1. Build a hierarchical project tree
  const sortedUris = [...fileUris].sort((a, b) => {
    const relPathA = vscode.workspace.asRelativePath(a, false);
    const relPathB = vscode.workspace.asRelativePath(b, false);
    return relPathA.localeCompare(relPathB);
  });

  const projectTree = buildProjectTree(sortedUris, workspaceFolder.uri);
  outputText += convertTreeToMarkdown(projectTree);
  outputText += '\\n'; // Add a newline after the tree

  // 2. Embed each file's content
  outputText += `## File Contents:\\n\\n`;
  outputText += "Below are the contents of the selected files. Each file's content is enclosed in a language-specific fenced code block, preceded by its full path.\\n\\n";

  for (const uri of sortedUris) {
    const relPath = vscode.workspace.asRelativePath(uri, false);
    const lang = getLanguageIdFromUri(uri);
    outputText += `--- --- ---\\n**File:** \`${relPath}\`\\n`;
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      let content = doc.getText().replace(/\\r\\n/g, '\\n').replace(/[ \\t]+$/gm, '');
      // Ensure content ends with a newline for cleaner diffs and LLM processing
      if (content && !content.endsWith('\\n')) {
        content += '\\n';
      }
      outputText += `\`\`\`${lang}\\n${content}\n\`\`\`\\n`; // Removed one newline after the code block
    } catch (error: any) {
      console.error(`[generateStructuredText] Error reading file ${uri.fsPath}:`, error);
      vscode.window.showErrorMessage(`Error reading file: ${relPath} - ${error.message}`);
      outputText += `\`\`\`\\n[Error reading file: ${relPath}]\\n${error.message || error}\\n\`\`\`\\n\\n`;
    }
  }

  return outputText;
}

// Helper function to get language ID from URI
function getLanguageIdFromUri(uri: vscode.Uri): string {
  const filePath = uri.fsPath;
  const extension = path.extname(filePath).substring(1).toLowerCase(); // Use path.extname and ensure lowercase
  const langMap: { [key: string]: string } = {
    ts: 'typescript',
    js: 'javascript',
    tsx: 'typescriptreact',
    jsx: 'javascriptreact',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    rs: 'rust',
    md: 'markdown',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shellscript',
    bash: 'shellscript',
    zsh: 'shellscript',
    ps1: 'powershell',
    bat: 'bat',
    vue: 'vue',
    svelte: 'svelte',
    graphql: 'graphql',
    sql: 'sql',
    dockerfile: 'dockerfile',
    tf: 'terraform',
    hcl: 'terraform',
  };
  return langMap[extension] || extension || ''; // Fallback to extension itself or empty string
}

interface ProjectTreeNode {
  name: string;
  uri: vscode.Uri;
  children: ProjectTreeNode[];
  isFile: boolean;
}

function buildProjectTree(files: vscode.Uri[], rootUri: vscode.Uri): ProjectTreeNode[] {
  const root: ProjectTreeNode = { name: path.basename(rootUri.fsPath) || 'Project Root', uri: rootUri, children: [], isFile: false };

  for (const fileUri of files) {
    const relativePathFromRoot = vscode.workspace.asRelativePath(fileUri, false);
    const segments = relativePathFromRoot.split(/[\\\\\\/]/); // Use regex to split by / or \
    let currentNode = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) { continue; } // Skip empty segments, e.g., from "foo//bar"

      let childNode = currentNode.children.find(child => child.name === segment);

      if (!childNode) {
        const isLastSegment = i === segments.length - 1;
        const childPathSoFar = segments.slice(0, i + 1).join('/'); // Join with / for URI construction
        const childUri = vscode.Uri.joinPath(rootUri, childPathSoFar);

        childNode = {
          name: segment,
          uri: childUri,
          children: [],
          isFile: isLastSegment
        };
        currentNode.children.push(childNode);
      }
      currentNode = childNode;
    }
  }
  function sortChildrenRecursive(node: ProjectTreeNode) {
    node.children.sort((a, b) => {
      if (a.isFile && !b.isFile) { return 1; }
      if (!a.isFile && b.isFile) { return -1; }
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildrenRecursive);
  }
  sortChildrenRecursive(root);
  return root.children;
}

function convertTreeToMarkdown(nodes: ProjectTreeNode[], indentLevel = 0): string {
  let md = '';
  const indent = '  '.repeat(indentLevel);
  for (const node of nodes) {
    const suffix = node.isFile ? '' : '/';
    md += `${indent}* ${node.name}${suffix}\\n`;
    if (node.children.length > 0) {
      md += convertTreeToMarkdown(node.children, indentLevel + 1);
    }
  }
  return md;
}
