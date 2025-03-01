import * as fs from 'fs';
import * as path from 'path';

/**
 * Expands a brace pattern string into all matching strings.
 * For example, "src/{a,b}" becomes ["src/a", "src/b"].
 */
export function toBraceExpandedPattern(pattern: string): string[] {
  const results: string[] = [];
  // Simple implementation: handle one-level brace expansion {opt1,opt2}
  const braceMatch = pattern.match(/^(.*)\{([^}]+)\}(.*)$/);
  if (!braceMatch) {
    return [pattern];  // No braces, return pattern as-is
  }
  const [_, prefix, choices, suffix] = braceMatch;
  for (const choice of choices.split(',')) {
    results.push(`${prefix}${choice.trim()}${suffix}`);
  }
  // If no braces were found or multiple braces, further logic would be needed
  return results.length ? results : [pattern];
}

/** Checks whether the given path is a directory on disk. */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.lstat(filePath);
    return stat.isDirectory();
  } catch (error) {
    console.error(`Failed to check directory status for ${filePath}:`, error);
    return false;
  }
}

/**
 * Reads ignore patterns from a .gitignore file in the given root directory.
 * Returns an array of patterns (expanded for brace patterns), or an empty array if none.
 */
export function getIgnorePatterns(rootPath: string): string[] {
  if (!rootPath) return [];
  const ignoreFile = path.join(rootPath, '.gitignore');
  try {
    const content = fs.readFileSync(ignoreFile, 'utf-8');
    // Filter out empty lines and comments, trim spaces
    const patterns = content.split(/\r?\n/).map(line => line.trim())
                            .filter(line => line && !line.startsWith('#'));
    // Expand brace patterns in ignore rules (if any)
    return patterns.flatMap(pat => toBraceExpandedPattern(pat));
  } catch {
    // No .gitignore found or read error -> no ignore patterns
    return [];
  }
}
