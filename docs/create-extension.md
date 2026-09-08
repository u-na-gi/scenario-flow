📦 How to build the Deno Run CodeLens extension (VS Code Extension)

This extension shows a "▶ Run with Deno" CodeLens above any
`if (import.meta.main)` line in a TypeScript file. Clicking it runs the file
with `deno run`.

---

✅ Required tools

- Node.js
- `yo` and `generator-code` (VS Code extension template generator)
- `vsce` (for packaging the VS Code extension)

Install:

npm install -g yo generator-code vsce

---

🚀 Scaffold the project

Choices:

- Extension Type: New Extension (TypeScript)
- Extension Name: anything you like (e.g. deno-run-codelens)
- Press Enter to accept the defaults for everything else

---

📁 Move into the project

cd deno-run-codelens

---

🛠 Edit src/extension.ts as follows

// src/extension.ts import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
context.subscriptions.push( vscode.languages.registerCodeLensProvider( {
language: "typescript", scheme: "file" }, new ImportMetaMainCodeLensProvider() )
);

context.subscriptions.push(
vscode.commands.registerCommand("extension.runDenoMain", (fileUri: vscode.Uri)
=> { const terminal = vscode.window.createTerminal("Deno Run"); terminal.show();
terminal.sendText(`deno run --allow-all "${fileUri.fsPath}"`); }) ); }

class ImportMetaMainCodeLensProvider implements vscode.CodeLensProvider {
provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] { const
lenses: vscode.CodeLens[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);

      if (line.text.includes("if (import.meta.main)")) {
        const range = new vscode.Range(i, 0, i, line.text.length);
        lenses.push(
          new vscode.CodeLens(range, {
            title: "▶ Run with Deno",
            command: "extension.runDenoMain",
            arguments: [document.uri],
          })
        );
        break;
      }
    }

    return lenses;

} }

---

🧩 Add to package.json

"contributes": { "commands": [ { "command": "extension.runDenoMain", "title":
"Run this file with Deno" } ], "languages": [ { "id": "typescript",
"extensions": [".ts"] } ] }

---

🧪 Debugging during development

1. Run `npm install` to install the dependencies
2. Open the project in VS Code with `code .`
3. Press `F5` to launch the "Extension Development Host"
4. Open a `.ts` file that contains `if (import.meta.main)` and the "▶ Run with
   Deno" CodeLens appears

---

📦 Build the extension and install it into your own VS Code

1. Create the `.vsix` file (run inside the extension directory):

   vsce package

   → `your-extension-name-0.0.1.vsix` is generated

2. Install it (either way works)

   From the command line:

   code --install-extension your-extension-name-0.0.1.vsix

   Or from the GUI:

   - Drag and drop the `.vsix` file onto a VS Code window
   - Or choose "Extensions: Install from VSIX..." from the Command Palette

3. To update an existing installation:

   code --install-extension your-extension-name-0.0.1.vsix --force

---

✅ Usage example

// main.ts import { login } from "./login.ts";

if (import.meta.main) { await login.execute(); }

---

✅ Ideas for extending the extension

- Show a CodeLens on `function main()` as well
- Read `deno.json` to fill in `--allow-*` flags and the `importMap`
  automatically
- Offer a `Run with Deno (no permissions)` mode
- Integrate with `deno lint` / `fmt`
