import * as vscode from 'vscode';
import * as path from 'path';
import { documentCache } from './cache';

/**
 * Represents the context of a word hovered in the JSON file.
 */
export interface HoverContext {
    /** The type of token: function name or parameter name */
    type: 'function_name' | 'parameter_name';
    /** The actual word/value under cursor */
    word: string;
    /** The function name this token belongs to (needed to find {function_name}.json) */
    functionName: string;
    /** For parameter_name type, the parameter key name */
    parameterName?: string;
}

/**
 * Parse the JSON document and determine the context of the word at the given position.
 * 
 * This analyzes the JSON structure to determine if the hovered word is:
 * - A function_name value inside a turns array item
 * - A parameter key inside function_parameters or function_parameters_variations
 */
export function getHoverContext(
    document: vscode.TextDocument,
    position: vscode.Position
): HoverContext | undefined {
    const text = document.getText();

    // Cache parsed JSON by document URI + version (auto-invalidates on edit)
    const cacheKey = `${document.uri.toString()}@${document.version}`;
    let parsed: any = documentCache.get(cacheKey);
    if (parsed === undefined) {
        try {
            parsed = JSON.parse(text);
            documentCache.set(cacheKey, parsed);
        } catch {
            return undefined;
        }
    }

    if (!parsed || !Array.isArray(parsed.turns)) {
        return undefined;
    }

    // Get the word at the current position
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_\-\.]+/);
    if (!wordRange) {
        return undefined;
    }
    const word = document.getText(wordRange);

    // We need to figure out where in the JSON structure the cursor is.
    // Strategy: use offset-based analysis to find which turn and which field the cursor is in.
    const offset = document.offsetAt(position);

    // Find the context by analyzing the text around the cursor position
    const context = analyzeJsonContext(text, offset, word, parsed);
    return context;
}

/**
 * Analyze the JSON text to determine the context at a given offset.
 */
function analyzeJsonContext(
    text: string,
    offset: number,
    word: string,
    parsed: any
): HoverContext | undefined {
    // Iterate through turns[].functions[] to find the matching context

    const turns = parsed.turns;

    for (const turn of turns) {
        // Each turn has a "functions" array containing function objects
        const functions = turn.functions;
        if (!Array.isArray(functions)) {
            continue;
        }

        for (const func of functions) {
            const functionName = func.function_name;
            if (!functionName) {
                continue;
            }

            // Check if the word matches the function name (as a value)
            if (word === functionName || word === normalizeWord(functionName)) {
                // Verify the cursor is near a "function_name" key in the text
                if (isWordAtFunctionNameValue(text, offset, functionName)) {
                    return {
                        type: 'function_name',
                        word: word,
                        functionName: functionName,
                    };
                }
            }

            // Check if the word matches a parameter key
            const allParamKeys = collectAllParameterKeys(func);
            if (allParamKeys.has(word)) {
                // Verify the cursor is indeed at a parameter key position
                if (isWordAtParameterKey(text, offset, word)) {
                    return {
                        type: 'parameter_name',
                        word: word,
                        functionName: functionName,
                        parameterName: word,
                    };
                }
            }
        }
    }

    // Fallback: try to find function name from the surrounding context
    const surroundingFunctionName = findSurroundingFunctionName(text, offset);
    if (surroundingFunctionName) {
        // Check if word is a param key in context
        if (isWordAtParameterKey(text, offset, word)) {
            return {
                type: 'parameter_name',
                word: word,
                functionName: surroundingFunctionName,
                parameterName: word,
            };
        }

        // Check if word is the function name value
        if (word === surroundingFunctionName || word === normalizeWord(surroundingFunctionName)) {
            return {
                type: 'function_name',
                word: word,
                functionName: surroundingFunctionName,
            };
        }
    }

    return undefined;
}

/**
 * Normalize a word by removing special characters for comparison.
 */
function normalizeWord(word: string): string {
    return word.replace(/[^a-zA-Z0-9_\-\.]/g, '');
}

/**
 * Collect all parameter keys from a function object, including from function_parameters
 * and function_parameters_variations.
 */
function collectAllParameterKeys(func: any): Set<string> {
    const keys = new Set<string>();

    if (func.function_parameters && typeof func.function_parameters === 'object') {
        for (const key of Object.keys(func.function_parameters)) {
            keys.add(key);
        }
    }

    if (Array.isArray(func.function_parameters_variations)) {
        for (const variation of func.function_parameters_variations) {
            if (variation && typeof variation === 'object') {
                for (const key of Object.keys(variation)) {
                    keys.add(key);
                }
            }
        }
    }

    return keys;
}

/**
 * Check if the word at the given offset is a function_name value in the JSON text.
 */
function isWordAtFunctionNameValue(text: string, offset: number, functionName: string): boolean {
    // Look backwards from offset to find if we're inside a "function_name": "..." context
    const searchStart = Math.max(0, offset - 200);
    const searchEnd = Math.min(text.length, offset + functionName.length + 50);
    const region = text.substring(searchStart, searchEnd);
    const relativeOffset = offset - searchStart;

    // Check if "function_name" key is nearby and we're in its value
    const pattern = /"function_name"\s*:\s*"/;
    const match = pattern.exec(region);
    if (match) {
        const valueStart = match.index + match[0].length;
        const valueEnd = region.indexOf('"', valueStart);
        if (relativeOffset >= valueStart && relativeOffset <= valueEnd) {
            return true;
        }
    }

    return false;
}

/**
 * Check if the word at the given offset is a parameter key (a JSON object key
 * inside function_parameters or function_parameters_variations).
 */
function isWordAtParameterKey(text: string, offset: number, word: string): boolean {
    // A parameter key in JSON looks like: "word" : 
    // Check if the character after the word+quote is followed by ':'
    const searchStart = Math.max(0, offset - 5);
    const searchEnd = Math.min(text.length, offset + word.length + 20);
    const region = text.substring(searchStart, searchEnd);

    // Pattern: the word should be a key (followed by ":")
    const keyPattern = new RegExp(`"${escapeRegExp(word)}"\\s*:`);
    if (keyPattern.test(region)) {
        // Also verify we're inside a function_parameters or function_parameters_variations block
        // by searching backwards for these keys
        const textBefore = text.substring(Math.max(0, offset - 1000), offset);
        if (textBefore.includes('"function_parameters"') || textBefore.includes('"function_parameters_variations"')) {
            return true;
        }
    }

    return false;
}

/**
 * Find the function_name value from the surrounding JSON context at a given offset.
 * Searches backwards in the text to find the nearest "function_name": "..." pair.
 */
function findSurroundingFunctionName(text: string, offset: number): string | undefined {
    // Search backwards from offset to find the nearest "function_name": "value"
    const textBefore = text.substring(Math.max(0, offset - 5000), offset);
    const pattern = /"function_name"\s*:\s*"([^"]+)"/g;
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(textBefore)) !== null) {
        lastMatch = match;
    }

    if (lastMatch) {
        return lastMatch[1];
    }

    return undefined;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
