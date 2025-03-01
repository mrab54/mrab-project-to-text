import * as vscode from 'vscode';
import { ProjectFileProvider, FileNode } from './projectFileProvider';
import { generateStructuredText } from './generate';

/**
 * Activates the extension. Registers the TreeDataProvider and commands.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.debug('[Extension] Activating projectToText extension...');

  const treeDataProvider = new ProjectFileProvider();
  vscode.window.registerTreeDataProvider('projectToText', treeDataProvider);

  // Listen for config changes to reload globs
  vscode.workspace.onDidChangeConfiguration((evt) => {
    if (evt.affectsConfiguration('projectToText')) {
      treeDataProvider.loadConfig(); // Re-read includes/excludes, rebuild tree
      vscode.window.showInformationMessage('Project to Text config updated!');
    }
  });

  // Command: Toggle a single file/folder
  context.subscriptions.push(
    vscode.commands.registerCommand('projectToText.toggleFile', (node: FileNode) => {
      treeDataProvider.toggleFile(node);
    })
  );

  // Command: Select All
  context.subscriptions.push(
    vscode.commands.registerCommand('projectToText.selectAll', () => {
      treeDataProvider.selectAll();
    })
  );

  // Command: Select None
  context.subscriptions.push(
    vscode.commands.registerCommand('projectToText.selectNone', () => {
      treeDataProvider.selectNone();
    })
  );

  // Command: Refresh (reload config + rebuild tree)
  context.subscriptions.push(
    vscode.commands.registerCommand('projectToText.refresh', () => {
      treeDataProvider.loadConfig();
    })
  );

  // Command: Generate (show selected files)
  context.subscriptions.push(
    vscode.commands.registerCommand('projectToText.generate', async () => {
      const filesToInclude = treeDataProvider.getSelectedFiles();
      if (filesToInclude.length === 0) {
        vscode.window.showWarningMessage('No files selected for Project to Text.');
        return;
      }
      try {
        const outputText = await generateStructuredText(filesToInclude);
        const doc = await vscode.workspace.openTextDocument({
          content: outputText,
          language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc, { preview: false });
        console.debug('[Extension] Generated structured text successfully.');
      } catch (error) {
        console.error('[Extension] Error generating structured text:', error);
        vscode.window.showErrorMessage('Error generating project text. Check console for details.');
      }
    })
  );

  // Command: Generate Quick
  context.subscriptions.push(
    vscode.commands.registerCommand('projectToText.generateQuick', async () => {
      console.debug('[Extension] Running Quick Generate...');
      const config = vscode.workspace.getConfiguration('projectToText');
      const includeGlobs = config.get<string[]>('include') ?? ['**/*'];
      const excludeGlobs = config.get<string[]>('exclude') ?? [
        '**/node_modules/**',
        '**/.git/**'
      ];

      try {
        // We do simple join() for multiple globs. If you have multiple patterns, 
        // use brace expansion or call findFiles multiple times.
        const uris = await vscode.workspace.findFiles(
          includeGlobs.join(','),
          excludeGlobs.join(',')
        );

        const items = uris.map((uri) => ({
          label: vscode.workspace.asRelativePath(uri),
          uri,
          picked: true,
        }));

        const selection = await vscode.window.showQuickPick(items, {
          canPickMany: true,
          title: 'Select files to include',
          placeHolder: 'Choose files for Project to Text output',
        });
        if (!selection) {
          console.debug('[Extension] Quick Generate canceled by user.');
          return;
        }

        const chosenUris = selection.map((item) => item.uri);
        const outputText = await generateStructuredText(chosenUris);
        const doc = await vscode.workspace.openTextDocument({
          content: outputText,
          language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc);
        console.debug('[Extension] Quick Generate completed successfully.');
      } catch (error) {
        console.error('[Extension] Quick Generate error:', error);
        vscode.window.showErrorMessage('Quick Generate failed. See console for details.');
      }
    })
  );

  console.debug('[Extension] projectToText extension activated.');
}

export function deactivate(): void {
  console.debug('[Extension] projectToText deactivated.');
}
