# Get Function Information — VS Code Extension

Provides **Hover IntelliSense** and **Ctrl+Click Go-to-Definition** for function names and parameter names inside JSON files with a `turns` structure.

## Features

- **Hover**: Move your mouse over a `function_name` value or parameter key → see detailed info in a hover widget.
- **Ctrl+Click**: Ctrl+Click on a function name or parameter → opens the `{function_name}.json` definition file and navigates to the relevant section.
- **`$ref` resolution**: If a parameter has a `$ref` field, the extension follows the reference and displays all resolved information.

## How It Works

1. Open a JSON file containing a `turns` array with `function_name`, `function_parameters`, etc.
2. The extension automatically searches **parent directories** of the current file until it finds one ending with `Agent` (e.g., `SearchAgent`).
3. It reads `{function_name}.json` from that Agent directory to provide:
   - **Function info**: `function_name`, `function_search_description`, `reasoning_instructions`
   - **Parameter info**: `description`, `type`, and resolved `$ref` data

## JSON File Structure

### Working JSON file (the file you open):
```json
{
    "turns": [
        {
            "function_name": "searchWeb",
            "function_parameters": {
                "query": "example search",
                "limit": 10
            },
            "function_parameters_variations": [
                { "query": "alternate search" }
            ]
        }
    ]
}
```

### Function definition file (`searchWeb.json` in the Agent directory):
```json
{
    "function_name": "searchWeb",
    "function_search_description": "Searches the web for results",
    "reasoning_instructions": "Use this to find online information",
    "function_parameters": {
        "properties": {
            "query": {
                "description": "The search query string",
                "type": "string"
            },
            "limit": {
                "description": "Maximum number of results",
                "type": "integer"
            }
        }
    }
}
```

## Development

```bash
npm install
npm run compile
```

Press **F5** in VS Code to launch the Extension Development Host and test the extension.
