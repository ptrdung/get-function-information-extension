import * as vscode from 'vscode';
import { getHoverContext } from './jsonParser';
import {
    getFunctionInfo,
    getParameterInfo,
    formatFunctionInfoMarkdown,
    formatParameterInfoMarkdown,
} from './infoProvider';
import { functionFileCache, refCache, agentDirCache, documentCache } from './cache';

/**
 * Activate the extension. Registers HoverProvider, DefinitionProvider,
 * and a right-click context menu command for JSON files.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Get Function Information extension is now active');

    const jsonSelector: vscode.DocumentSelector = [
        { language: 'json', scheme: 'file' },
        { language: 'jsonc', scheme: 'file' },
    ];

    // Register HoverProvider — shows info on mouse hover
    const hoverProvider = vscode.languages.registerHoverProvider(jsonSelector, {
        provideHover(document, position, token) {
            return provideHoverInfo(document, position);
        },
    });

    // Register DefinitionProvider — Ctrl+Click shows peek/go-to definition
    const definitionProvider = vscode.languages.registerDefinitionProvider(jsonSelector, {
        provideDefinition(document, position, token) {
            return provideDefinitionInfo(document, position);
        },
    });

    // Register "Show Function Info" command — right-click context menu
    const showInfoCommand = vscode.commands.registerCommand(
        'get-function-information.showInfo',
        () => showInfoPanel(context)
    );

    // Invalidate caches when JSON files are saved
    const saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId === 'json' || doc.languageId === 'jsonc') {
            functionFileCache.clear();
            refCache.clear();
            documentCache.clear();
        }
    });

    context.subscriptions.push(hoverProvider, definitionProvider, showInfoCommand, saveListener);
}

/**
 * Show function/parameter info in a Webview panel.
 * Triggered by right-click → "Show Function Info" on selected text.
 */
function showInfoPanel(extContext: vscode.ExtensionContext): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor.');
        return;
    }

    const document = editor.document;
    const selection = editor.selection;

    // Use the selection start position for context detection
    const position = selection.start;
    const filePath = document.uri.fsPath;

    const hoverCtx = getHoverContext(document, position);
    if (!hoverCtx) {
        vscode.window.showInformationMessage('No function or parameter info found for the selected text.');
        return;
    }

    let markdownContent: vscode.MarkdownString | undefined;
    let title = '';

    if (hoverCtx.type === 'function_name') {
        const info = getFunctionInfo(filePath, hoverCtx.functionName);
        if (!info) {
            vscode.window.showInformationMessage(`No definition file found for function "${hoverCtx.functionName}".`);
            return;
        }
        markdownContent = formatFunctionInfoMarkdown(info);
        title = `🔧 ${hoverCtx.functionName}`;
    } else if (hoverCtx.type === 'parameter_name' && hoverCtx.parameterName) {
        const info = getParameterInfo(filePath, hoverCtx.functionName, hoverCtx.parameterName);
        if (!info) {
            vscode.window.showInformationMessage(`No info found for parameter "${hoverCtx.parameterName}".`);
            return;
        }
        markdownContent = formatParameterInfoMarkdown(info);
        title = `📌 ${hoverCtx.parameterName}`;
    }

    if (!markdownContent) {
        return;
    }

    // Create and show Webview panel
    const panel = vscode.window.createWebviewPanel(
        'functionInfo',
        title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: false }
    );

    panel.webview.html = getWebviewContent(title, markdownContent.value);
}

/**
 * Generate HTML content for the Webview panel.
 * Converts markdown-style content to styled HTML.
 */
function getWebviewContent(title: string, markdownRaw: string): string {
    // Convert markdown to simple HTML
    let htmlBody = markdownRaw
        // Headers
        .replace(/### (.+)/g, '<h3>$1</h3>')
        .replace(/## (.+)/g, '<h2>$1</h2>')
        // Horizontal rules
        .replace(/---/g, '<hr/>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Code blocks
        .replace(/```json\n([\s\S]*?)```/g, '<pre class="code-block">$1</pre>')
        .replace(/```\n([\s\S]*?)```/g, '<pre class="code-block">$1</pre>')
        // Numbered lists (e.g., "1. `value`")
        .replace(/^(\d+)\. /gm, '<span class="list-num">$1.</span> ')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br/>');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground, #cccccc);
            background-color: var(--vscode-editor-background, #1e1e1e);
            padding: 16px 24px;
            line-height: 1.6;
            max-width: 800px;
        }
        h2, h3 {
            color: var(--vscode-foreground, #ffffff);
            margin-top: 8px;
            margin-bottom: 8px;
            border-bottom: 1px solid var(--vscode-widget-border, #333);
            padding-bottom: 6px;
        }
        hr {
            border: none;
            border-top: 1px solid var(--vscode-widget-border, #333);
            margin: 12px 0;
        }
        code {
            background: var(--vscode-textCodeBlock-background, #2d2d2d);
            color: var(--vscode-textPreformat-foreground, #d7ba7d);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
            font-size: 0.95em;
        }
        pre.code-block {
            background: var(--vscode-textCodeBlock-background, #2d2d2d);
            padding: 12px 16px;
            border-radius: 6px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-size: 0.9em;
            line-height: 1.5;
        }
        strong {
            color: var(--vscode-foreground, #e0e0e0);
        }
        p {
            margin: 6px 0;
        }
        .list-num {
            color: var(--vscode-textPreformat-foreground, #d7ba7d);
            font-weight: bold;
            margin-right: 4px;
        }
    </style>
</head>
<body>
    <p>${htmlBody}</p>
</body>
</html>`;
}

/**
 * Provide hover information for the word at the given position.
 */
function provideHoverInfo(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.Hover | undefined {
    const filePath = document.uri.fsPath;
    const context = getHoverContext(document, position);

    if (!context) {
        return undefined;
    }

    if (context.type === 'function_name') {
        const info = getFunctionInfo(filePath, context.functionName);
        if (!info) {
            return undefined;
        }
        const markdown = formatFunctionInfoMarkdown(info);
        return new vscode.Hover(markdown);
    }

    if (context.type === 'parameter_name' && context.parameterName) {
        const info = getParameterInfo(filePath, context.functionName, context.parameterName);
        if (!info) {
            return undefined;
        }
        const markdown = formatParameterInfoMarkdown(info);
        return new vscode.Hover(markdown);
    }

    return undefined;
}

/**
 * Provide definition location for Ctrl+Click.
 * Opens the {function_name}.json file and navigates to the relevant section.
 */
function provideDefinitionInfo(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.Location | undefined {
    const filePath = document.uri.fsPath;
    const context = getHoverContext(document, position);

    if (!context) {
        return undefined;
    }

    // Find the Agent directory and function file
    const { findAgentDirectory, findFunctionFile } = require('./agentFinder');
    const agentDir = findAgentDirectory(filePath);
    if (!agentDir) {
        return undefined;
    }

    const functionFilePath = findFunctionFile(agentDir, context.functionName);
    if (!functionFilePath) {
        return undefined;
    }

    const uri = vscode.Uri.file(functionFilePath);

    if (context.type === 'function_name') {
        // Navigate to the function_name field in the definition file
        try {
            const fs = require('fs');
            const content = fs.readFileSync(functionFilePath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('"function_name"')) {
                    return new vscode.Location(uri, new vscode.Position(i, 0));
                }
            }
        } catch {
            // Fall through to default position
        }
        return new vscode.Location(uri, new vscode.Position(0, 0));
    }

    if (context.type === 'parameter_name' && context.parameterName) {
        // Navigate to the parameter definition in the function file
        try {
            const fs = require('fs');
            const content = fs.readFileSync(functionFilePath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(`"${context.parameterName}"`)) {
                    return new vscode.Location(uri, new vscode.Position(i, 0));
                }
            }
        } catch {
            // Fall through to default position
        }
        return new vscode.Location(uri, new vscode.Position(0, 0));
    }

    return undefined;
}

/**
 * Deactivate the extension.
 */
export function deactivate() {}
