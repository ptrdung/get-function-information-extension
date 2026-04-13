import * as path from 'path';
import * as fs from 'fs';

/**
 * Find the Agent directory by traversing parent directories from the given file path.
 * Stops when it finds a directory whose name ends with "Agent" (e.g., SearchAgent).
 * 
 * @param filePath The path of the current JSON file
 * @returns The path to the Agent directory, or undefined if not found
 */
export function findAgentDirectory(filePath: string): string | undefined {
    let currentDir = path.dirname(filePath);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
        const dirName = path.basename(currentDir);
        if (dirName.endsWith('Agent')) {
            return currentDir;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            // Reached filesystem root
            break;
        }
        currentDir = parentDir;
    }

    // Check the root directory name too
    const rootDirName = path.basename(currentDir);
    if (rootDirName.endsWith('Agent')) {
        return currentDir;
    }

    return undefined;
}

/**
 * Find the function definition JSON file in the Agent directory.
 * 
 * @param agentDir The path to the Agent directory
 * @param functionName The name of the function to look up
 * @returns The full path to the function JSON file, or undefined if not found
 */
export function findFunctionFile(agentDir: string, functionName: string): string | undefined {
    const functionFilePath = path.join(agentDir, `${functionName}.json`);
    
    if (fs.existsSync(functionFilePath)) {
        return functionFilePath;
    }

    return undefined;
}
