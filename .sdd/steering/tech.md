# Technology Stack

## アーキテクチャ
Next.js 15 App Router を採用したシングルページアプリケーション構成。`src/app` 配下でレイアウトとページを定義し、`layout.tsx` が全体の HTML スケルトンと `next/font` によるフォント変数を適用する。

## 使用技術
### 言語とフレームワーク
- TypeScript ^5：`tsconfig.json` で `strict` を有効化した型安全な実装。
- Next.js 15.5.6：App Router と Turbopack を活用する React ベースのフレームワーク。
- React 19.1.0 / React DOM 19.1.0：UI レイヤーの基盤。
- Tailwind CSS ^4：`globals.css` で `@import "tailwindcss";` を適用したユーティリティファーストなスタイル基盤。

### 依存関係
- `@tailwindcss/postcss` + `postcss.config.mjs`：Tailwind 4 のビルドパイプライン。
- ESLint 9 系 + `eslint-config-next`：Next.js 向けの lint ルールと型サポート。
- `@types/node`, `@types/react`, `@types/react-dom`：TypeScript 用型定義。
- `next/font`（Geist / Geist Mono）：`layout.tsx` でのフォント変数指定。

## 開発環境
### 必要なツール
- Node.js（Next.js 15 の要件である v18.18 以降を推奨）
- npm もしくは互換パッケージマネージャー（`package-lock.json` を使用）

### よく使うコマンド
- 起動：`npm run dev`（Turbopack 開発サーバー）
- ビルド：`npm run build`（Turbopack ビルド）
- 本番起動：`npm start`
- Lint：`npm run lint`

## 環境変数
現時点で専用の環境変数や `.env` ファイルは定義されておらず、Next.js の標準設定のみが利用されている。
