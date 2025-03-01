import * as vscode from 'vscode';
import { ProjectFileTreeProvider } from './treeProvider';
import { generateTreeOutput } from './generate';
import { getIgnorePatterns } from './utils';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const rootPath = workspaceFolders && workspaceFolders[0] ? workspaceFolders[0].uri.fsPath : '';
  
  // Initialize tree data provider for the project files
  const ignorePatterns = getIgnorePatterns(rootPath);
  const treeDataProvider = new ProjectFileTreeProvider(rootPath, ignorePatterns);
  vscode.window.registerTreeDataProvider('projectToText', treeDataProvider);

  // Command: Refresh the file tree view manually
  context.subscriptions.push(
    vscode.commands.registerCommand('fileTreeExplorer.refresh', () => {
      treeDataProvider.refresh();
      console.debug('fileTreeExplorer.refresh: Tree view manually refreshed');
    })
  );

  // Command: Generate the file tree text (e.g., copy to clipboard)
  context.subscriptions.push(
    vscode.commands.registerCommand('fileTreeExplorer.generateTree', async () => {
      if (!rootPath) {
        console.warn('Generate Tree command invoked with no workspace folder open.');
        vscode.window.showErrorMessage('No workspace is open. Please open a folder to generate its file tree.');
        return;
      }
      try {
        const treeText = await generateTreeOutput(rootPath, { format: 'ascii' });
        await vscode.env.clipboard.writeText(treeText);
        vscode.window.showInformationMessage('File tree has been copied to the clipboard.');
        console.debug('fileTreeExplorer.generateTree: File tree generated and copied to clipboard');
      } catch (error) {
        console.error('Error in generating file tree:', error);
        vscode.window.showErrorMessage('Failed to generate file tree. See console for details.');
      }
    })
  );

  // (Other extension commands or initialization can go here)

  console.debug('Extension "File Tree Explorer" activated');
}

export function deactivate(): void {
  // Clean up resources if any (not strictly needed as VS Code disposes subscriptions on unload)
}
