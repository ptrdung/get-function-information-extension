import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolve a $ref path and return the referenced JSON object.
 * 
 * Supports paths like:
 *   ../../common-types/parameter2.json#/definitions/ABCXYZService
 * 
 * @param ref The $ref string
 * @param baseDir The base directory to resolve relative paths from (directory of the function JSON file)
 * @returns The resolved JSON object, or undefined if resolution fails
 */
export function resolveRef(ref: string, baseDir: string): any | undefined {
    try {
        // Split the ref into file path and JSON pointer
        const [filePart, pointerPart] = ref.split('#');

        if (!filePart) {
            return undefined;
        }

        // Resolve the file path relative to the base directory
        const resolvedFilePath = path.resolve(baseDir, filePart);

        if (!fs.existsSync(resolvedFilePath)) {
            return undefined;
        }

        // Read and parse the referenced file
        const fileContent = fs.readFileSync(resolvedFilePath, 'utf-8');
        let parsed: any;
        try {
            parsed = JSON.parse(fileContent);
        } catch {
            return undefined;
        }

        // If there's a JSON pointer, navigate to the specified path
        if (pointerPart) {
            return navigateJsonPointer(parsed, pointerPart);
        }

        return parsed;
    } catch {
        return undefined;
    }
}

/**
 * Navigate a JSON object using a JSON pointer path.
 * 
 * @param obj The JSON object to navigate
 * @param pointer The JSON pointer (e.g., /definitions/ABCXYZService)
 * @returns The value at the pointer location, or undefined if not found
 */
function navigateJsonPointer(obj: any, pointer: string): any | undefined {
    // Remove leading slash
    const parts = pointer.split('/').filter(p => p.length > 0);

    let current = obj;
    for (const part of parts) {
        // Decode JSON pointer escape sequences
        const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~');
        
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }

        current = current[decoded];
    }

    return current;
}

/**
 * Format a resolved $ref object into a readable markdown string.
 * Specifically extracts and displays "type" and "enum" fields.
 * The enum array is displayed as a numbered list for easy reading.
 * 
 * @param refData The resolved reference data
 * @param refPath The original $ref path (for display)
 * @returns Formatted markdown string
 */
export function formatRefData(refData: any, refPath: string): string {
    if (!refData || typeof refData !== 'object') {
        return '';
    }

    const lines: string[] = [];
    lines.push(`\n---\n`);
    lines.push(`**📎 Referenced from:** \`${refPath}\`\n`);

    // Show "type" if present
    if (refData.type) {
        lines.push(`**Type:** \`${refData.type}\`\n`);
    }

    // Show "enum" if present, formatted as a readable numbered list
    if (Array.isArray(refData.enum) && refData.enum.length > 0) {
        lines.push(`**Allowed values:**\n`);
        refData.enum.forEach((value: any, index: number) => {
            lines.push(`${index + 1}. \`${value}\``);
        });
        lines.push('');
    }

    return lines.join('\n');
}
