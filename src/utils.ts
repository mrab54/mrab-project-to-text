import * as fs from 'fs';
import * as path from 'path';

/**
 * Recursively expands a brace pattern string into all matching strings.
 * For example, "src/{a,b}" becomes ["src/a", "src/b"].
 * Supports nested braces.
 * @param pattern The pattern to expand
 * @returns All expanded patterns
 */
export function toBraceExpandedPattern(pattern: string): string[] {
  // Find the first outermost {...}
  const match = /^(.*?)(\{([^{}]*)\})(.*)$/.exec(pattern);
  if (!match) {
    return [pattern];
  }
  const prefix = match[1];
  const choices = match[3];
  const suffix = match[4];
  const expanded: string[] = [];
  for (const choice of choices.split(',')) {
    const expandedParts = toBraceExpandedPattern(prefix + choice.trim() + suffix);
    for (const part of expandedParts) {
      if (!expanded.includes(part)) {
        expanded.push(part);
      }
    }
  }
  return expanded;
}

/**
 * Checks whether the given path is a directory on disk.
 * @param filePath Path to check
 * @returns True if directory, false otherwise
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.lstat(filePath);
    return stat.isDirectory();
  } catch (error) {
    // Don't log here, let caller handle errors if needed
    return false;
  }
}

/**
 * Reads ignore patterns from a .gitignore file in the given root directory.
 * Returns an array of patterns (expanded for brace patterns), or an empty array if none.
 * @param rootPath The root directory to look for .gitignore
 * @returns Promise of array of ignore patterns
 */
export async function getIgnorePatterns(rootPath: string): Promise<string[]> {
  if (!rootPath) {
    return [];
  }
  const ignoreFile = path.join(rootPath, '.gitignore');
  try {
    const content = await fs.promises.readFile(ignoreFile, 'utf-8');
    const patterns = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    return patterns.flatMap((pat) => toBraceExpandedPattern(pat));
  } catch {
    // No .gitignore found or read error -> no ignore patterns
    return [];
  }
}
