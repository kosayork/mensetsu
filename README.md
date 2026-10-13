# 専修大学 面接対策

専修大学ネットワーク情報学部の総合型選抜に向けた、非公式の面接練習ツールです。質問・回答例は `dist/data/questions.json` で管理します。現在は8カテゴリ・50問の質問データを収録しています。

## GitHubと公開

ソース管理：<https://github.com/kosayork/mensetsu>

公開先（デプロイ完了後）：<https://kosayork.github.io/mensetsu/>

初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定します。

`main` にプッシュすると `.github/workflows/deploy-pages.yml` がテストを実行し、成功した場合に `dist` の内容をGitHub Pagesへ公開します。ビルドやnpm installは不要です。デプロイの結果はリポジトリの **Actions** で確認できます。初回の設定後にワークフローを手動実行する場合は、**Actions → Test and deploy GitHub Pages → Run workflow** を選びます。

GitHub PagesのプロジェクトURL `/mensetsu/` に対応するよう、アプリのCSS・JavaScript・JSONは相対パスで読み込みます。GitHub Pages上の進捗はローカルの進捗とは別に保存されます。

通常の更新手順：

```sh
git pull --ff-only
# dist/data/questions.json などを編集する
node --experimental-default-type=module --test tests/core.test.mjs
git add dist README.md tests .github .gitignore
git commit -m "Update interview questions"
git push origin main
```

このリポジトリは公開リポジトリです。質問の回答記録など、学習者本人の個人情報はGitに追加せず、ブラウザ内に保存してください。

## 起動

依存パッケージ・ビルド処理は不要です。このディレクトリで次を実行します。

```sh
python3 -m http.server 4173 --directory dist
```

ブラウザで `http://localhost:4173` を開いてください。JSONを `fetch` で取得するため、HTMLファイルの直接ダブルクリックではなくHTTPサーバー経由で開きます。

## 機能

- 8カテゴリ・50問のカテゴリ別一覧、重要度A/B/Cの表示
- カテゴリ・重要度・キーワードの組み合わせによる絞り込み
- 質問ごとのアコーディオン、回答例の独立した表示・非表示
- 回答のポイント、想定される追加質問
- 未着手・練習中・回答できるの選択と自動保存
- 全質問を母数とした進捗表示（回答できる / 全質問数）
- 「今日の練習をはじめる」から、未完了の重要度Aの質問を優先して表示
- スマートフォン対応、キーボード操作、保存失敗・読込失敗・検索結果なしの表示

## データの差し替え・追加

`dist/data/questions.json` のみを編集してください。質問数・カテゴリ数・各カテゴリの件数・進捗の母数はデータから自動で算出します。

```json
{
  "schemaVersion": 1,
  "isDummy": true,
  "categories": [
    { "id": "motivation", "name": "志望理由" }
  ],
  "questions": [
    {
      "id": "q001",
      "categoryId": "motivation",
      "importance": "A",
      "question": "専修大学を志望した理由を教えてください。",
      "exampleAnswer": "回答例をここに記入します。",
      "points": ["結論から話す", "具体的な経験を添える"],
      "followUps": ["そのきっかけを詳しく教えてください。"]
    }
  ]
}
```

実際のデータに置き換えたら `isDummy` を `false` にするとダミーデータのバッジと注意文が非表示になります。

**質問IDは変更しないでください。** 学習履歴は `id` をキーに保存します。本文・回答・重要度・カテゴリ・表示順の変更で履歴は消えません。新しい質問には未使用のID（例：`q051`）を付け、既存IDを別の質問に再利用しないでください。カテゴリも安定したIDを使用します。表示番号Q01等は配列の順序から算出します。

`categoryId` は `categories` に存在するID、`importance` は `A` / `B` / `C`、ポイントと追加質問は文字列の配列です。不正なデータやIDの重複は読込時に検出します。

## 保存と拡張

- `dist/js/data.js`：JSON読込・検証・絞り込み・学習状態の定義
- `dist/js/storage.js`：LocalStorageの永続化と進捗集計
- `dist/js/app.js`：画面描画と操作
- `dist/css/styles.css`：スマホを含む画面サイズごとのスタイル

LocalStorageのキーは `senshu-interview:learning:v1`、形式は次のとおりです。

```json
{
  "version": 1,
  "questions": {
    "q001": { "status": "ready", "updatedAt": "2026-10-13T00:00:00.000Z" }
  }
}
```

状態は `unseen` / `practicing` / `ready` です。質問データから一時的に除かれたIDの履歴も保存を継続し、現存する質問だけを進捗集計に含めます。レコードの既存フィールドを保持して更新するため、今後 `answerText` などの回答記録フィールドを追加できます。ランダム出題もJSONの質問を選び、既存の描画と保存処理を使う形で拡張できます。これらの追加機能は現段階では未実装です。

学習履歴は使用した端末・ブラウザ・URLのオリジンごとに保存されます。別端末への同期はありません。ブラウザのサイトデータを消すと履歴も消えます。LocalStorageが使えない場合は画面内で状態を保持し、保存失敗を通知します。

## 確認

Node.jsがある環境では、次のコマンドでデータ検証・絞り込み・履歴保持・進捗の確認を実行できます。

```sh
node --experimental-default-type=module --test tests/core.test.mjs
```
