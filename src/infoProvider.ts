import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { findAgentDirectory, findFunctionFile } from './agentFinder';
import { resolveRef, formatRefData } from './refResolver';
import { functionFileCache } from './cache';

/**
 * Information about a function, extracted from {function_name}.json
 */
export interface FunctionInfo {
    functionName?: string;
    functionSearchDescription?: string;
    reasoningInstructions?: string;
}

/**
 * Information about a parameter, extracted from {function_name}.json
 */
export interface ParameterInfo {
    name: string;
    description?: string;
    type?: string;
    ref?: string;
    refData?: any;
    /** All other properties of this parameter */
    otherProperties?: Record<string, any>;
}

/**
 * Get function information from the {function_name}.json file.
 * 
 * @param currentFilePath Path of the currently open JSON file
 * @param functionName The function name to look up
 * @returns FunctionInfo or undefined if not found
 */
export function getFunctionInfo(currentFilePath: string, functionName: string): FunctionInfo | undefined {
    const agentDir = findAgentDirectory(currentFilePath);
    if (!agentDir) {
        return undefined;
    }

    const functionFilePath = findFunctionFile(agentDir, functionName);
    if (!functionFilePath) {
        return undefined;
    }

    try {
        // Use cache to avoid re-reading from disk
        let parsed = functionFileCache.get(functionFilePath);
        if (parsed === undefined) {
            const content = fs.readFileSync(functionFilePath, 'utf-8');
            parsed = JSON.parse(content);
            functionFileCache.set(functionFilePath, parsed);
        }

        const info: FunctionInfo = {};

        if (parsed.function_name) {
            info.functionName = parsed.function_name;
        }
        if (parsed.function_search_description) {
            info.functionSearchDescription = parsed.function_search_description;
        }
        if (parsed.reasoning_instructions) {
            info.reasoningInstructions = parsed.reasoning_instructions;
        }

        // Return undefined if we found no info at all
        if (!info.functionName && !info.functionSearchDescription && !info.reasoningInstructions) {
            return undefined;
        }

        return info;
    } catch {
        return undefined;
    }
}

/**
 * Get parameter information from the {function_name}.json file.
 * 
 * @param currentFilePath Path of the currently open JSON file
 * @param functionName The function name this parameter belongs to
 * @param parameterName The parameter name to look up
 * @returns ParameterInfo or undefined if not found
 */
export function getParameterInfo(
    currentFilePath: string,
    functionName: string,
    parameterName: string
): ParameterInfo | undefined {
    const agentDir = findAgentDirectory(currentFilePath);
    if (!agentDir) {
        return undefined;
    }

    const functionFilePath = findFunctionFile(agentDir, functionName);
    if (!functionFilePath) {
        return undefined;
    }

    try {
        // Use cache to avoid re-reading from disk
        let parsed = functionFileCache.get(functionFilePath);
        if (parsed === undefined) {
            const content = fs.readFileSync(functionFilePath, 'utf-8');
            parsed = JSON.parse(content);
            functionFileCache.set(functionFilePath, parsed);
        }

        // Navigate to function_parameters.properties.{parameterName}
        const properties = parsed?.function_parameters?.properties;
        if (!properties || !properties[parameterName]) {
            return undefined;
        }

        const paramDef = properties[parameterName];
        const info: ParameterInfo = {
            name: parameterName,
        };

        if (paramDef.description) {
            info.description = paramDef.description;
        }
        if (paramDef.type) {
            info.type = paramDef.type;
        }

        // Collect other properties
        const knownKeys = new Set(['description', 'type', '$ref']);
        const otherProps: Record<string, any> = {};
        for (const [key, value] of Object.entries(paramDef)) {
            if (!knownKeys.has(key)) {
                otherProps[key] = value;
            }
        }
        if (Object.keys(otherProps).length > 0) {
            info.otherProperties = otherProps;
        }

        // Handle $ref
        if (paramDef['$ref']) {
            info.ref = paramDef['$ref'];
            const functionFileDir = path.dirname(functionFilePath);
            const refData = resolveRef(paramDef['$ref'], functionFileDir);
            if (refData) {
                info.refData = refData;
            }
        }

        return info;
    } catch {
        return undefined;
    }
}

/**
 * Format function info as a Markdown hover string.
 */
export function formatFunctionInfoMarkdown(info: FunctionInfo): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown(`### 🔧 Function Information\n\n`);

    if (info.functionName) {
        md.appendMarkdown(`**Function Name:** \`${info.functionName}\`\n\n`);
    }

    if (info.functionSearchDescription) {
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`**📋 Search Description:**\n\n`);
        md.appendMarkdown(`${info.functionSearchDescription}\n\n`);
    }

    if (info.reasoningInstructions) {
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`**🧠 Reasoning Instructions:**\n\n`);
        md.appendMarkdown(`${info.reasoningInstructions}\n\n`);
    }

    return md;
}

/**
 * Format parameter info as a Markdown hover string.
 */
export function formatParameterInfoMarkdown(info: ParameterInfo): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown(`### 📌 Parameter: \`${info.name}\`\n\n`);

    if (info.description) {
        md.appendMarkdown(`**Description:** ${info.description}\n\n`);
    }

    if (info.type) {
        md.appendMarkdown(`**Type:** \`${info.type}\`\n\n`);
    }

    // Show $ref resolved data (type + enum)
    if (info.ref && info.refData) {
        const refFormatted = formatRefData(info.refData, info.ref);
        md.appendMarkdown(refFormatted);
    } else if (info.ref) {
        md.appendMarkdown(`\n---\n\n`);
        md.appendMarkdown(`**📎 \`$ref\`:** \`${info.ref}\`\n\n`);
        md.appendMarkdown(`*(Could not resolve reference)*\n\n`);
    }

    return md;
}
