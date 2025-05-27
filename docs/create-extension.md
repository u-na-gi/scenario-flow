📦 Deno Run CodeLens 拡張の作り方（VS Code Extension）

この拡張は、TypeScript ファイル内に `if (import.meta.main)` がある場合、その行の上に "▶ Run with Deno" という CodeLens を表示し、クリックするとそのファイルを `deno run` で実行します。

---

✅ 必要ツール

- Node.js
- `yo` と `generator-code`（VS Code 拡張テンプレートジェネレーター）
- `vsce`（VS Code 拡張のパッケージ化用）

インストール：

npm install -g yo generator-code vsce

---

🚀 初期化



選択肢:
- Extension Type: New Extension (TypeScript)
- Extension Name: 任意 (例: deno-run-codelens)
- その他は Enter で進めてOK

---

📁 プロジェクト移動

cd deno-run-codelens

---

🛠 src/extension.ts を以下のように編集

// src/extension.ts
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "typescript", scheme: "file" },
      new ImportMetaMainCodeLensProvider()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("extension.runDenoMain", (fileUri: vscode.Uri) => {
      const terminal = vscode.window.createTerminal("Deno Run");
      terminal.show();
      terminal.sendText(`deno run --allow-all "${fileUri.fsPath}"`);
    })
  );
}

class ImportMetaMainCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];

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
  }
}

---

🧩 package.json に追記

"contributes": {
  "commands": [
    {
      "command": "extension.runDenoMain",
      "title": "Run this file with Deno"
    }
  ],
  "languages": [
    {
      "id": "typescript",
      "extensions": [".ts"]
    }
  ]
}

---

🧪 開発中にデバッグ実行したい場合

1. `npm install` を実行して依存関係を入れる
2. VS Code で `code .` を実行して開く
3. `F5` を押すと「Extension Development Host」が立ち上がる
4. `if (import.meta.main)` を含む `.ts` ファイルを開くと "▶ Run with Deno" が表示される

---

📦 拡張をビルドして自分の VS Code にインストールする

1. `.vsix` ファイルの作成（拡張ディレクトリで実行）：

   vsce package

   → `your-extension-name-0.0.1.vsix` が生成される

2. インストール方法（どちらか）

   コマンドで：

   code --install-extension your-extension-name-0.0.1.vsix

   または GUI で：

   - `.vsix` ファイルを VS Code ウィンドウにドラッグ＆ドロップ
   - またはコマンドパレットで "Extensions: Install from VSIX..." を選択

3. アップデートしたい場合：

   code --install-extension your-extension-name-0.0.1.vsix --force

---

✅ 使用例

// main.ts
import { login } from "./login.ts";

if (import.meta.main) {
  await login.execute();
}

---

✅ 拡張の発展アイデア

- `function main()` にも CodeLens を出す
- `deno.json` を読み込んで `--allow-*` や `importMap` を自動補完
- `Run with Deno (no permissions)` モードも選べるようにする
- `deno lint` / `fmt` 連携
