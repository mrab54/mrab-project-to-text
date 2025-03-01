import * as fs from 'fs';
import * as path from 'path';

interface GenerateOptions {
  format: 'ascii' | 'json';
  maxDepth?: number;
}

/**
 * Generates a representation of the file tree for the given directory.
 * Supports ASCII tree format or JSON format based on options.
 *
 * @param dirPath - Root directory path to generate the tree from.
 * @param options - Output format options (ascii or json), with optional max depth.
 * @returns A formatted string representing the file tree.
 */
export async function generateTreeOutput(dirPath: string, options: GenerateOptions = { format: 'ascii' }): Promise<string> {
  const { format, maxDepth } = options;
  const lines: string[] = [];
  
  /**
   * Recursively traverse the directory and accumulate tree lines.
   * @param currentPath - The directory path to process.
   * @param indent - The current indentation string for tree lines.
   * @param depth - Current depth of recursion.
   */
  async function traverse(currentPath: string, indent: string, depth: number): Promise<void> {
    if (maxDepth !== undefined && depth > maxDepth) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch (err) {
      console.error(`generateTreeOutput: Unable to read directory "${currentPath}":`, err);
      return;
    }
    // Sort entries alphabetically, directories first
    entries.sort((a, b) => {
      if (a.isDirectory() === b.isDirectory()) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory() ? -1 : 1;
    });
    const total = entries.length;
    for (let index = 0; index < total; index++) {
      const entry = entries[index];
      const isLast = index === total - 1;
      const connector = isLast ? '└── ' : '├── ';
      const newIndent = indent + (isLast ? '    ' : '│   ');
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        lines.push(`${indent}${connector}${entry.name}/`);
        await traverse(entryPath, newIndent, depth + 1);
      } else {
        lines.push(`${indent}${connector}${entry.name}`);
      }
    }
  }

  // Start traversal from the root directory
  await traverse(dirPath, '', 0);

  if (format === 'json') {
    // (Optional) Convert the collected structure to a JSON string.
    // For brevity, we assume ASCII format; a real implementation would build a nested object here.
    const treeObject = { directory: dirPath, files: lines };
    return JSON.stringify(treeObject, null, 2);
  }

  // Default or 'ascii': join lines with newlines to form the tree text
  return lines.join('\n');
}
