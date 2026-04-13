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
 * Activate the extension. Registers both a HoverProvider and a DefinitionProvider
 * for JSON files to provide function/parameter information.
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

    // Invalidate caches when JSON files are saved (e.g., function definition files edited)
    const saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId === 'json' || doc.languageId === 'jsonc') {
            functionFileCache.clear();
            refCache.clear();
            documentCache.clear();
        }
    });

    context.subscriptions.push(hoverProvider, definitionProvider, saveListener);
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
