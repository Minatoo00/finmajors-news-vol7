# Project Structure

## ルートディレクトリ構成
```
/
├── src/                   # アプリケーションソース（App Router）
│   └── app/
│       ├── layout.tsx     # 共通レイアウトとフォント設定
│       ├── page.tsx       # トップページ（Next.js テンプレート）
│       ├── globals.css    # Tailwind 4 ベースのグローバルスタイル
│       └── favicon.ico
├── public/                # 静的アセット（SVG アイコンなど）
├── docs/                  # ドキュメント（デザイン指針等）
│   └── design-system.md
├── .sdd/                  # 仕様駆動開発関連ファイル
│   ├── description.md
│   ├── README.md
│   ├── specs/
│   └── steering/          # ステアリング文書
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
└── postcss.config.mjs
```

## コード構成パターン
Next.js App Router のファイルベースルーティングに従い `src/app` 配下でページとレイアウトを定義。`layout.tsx` が全ページ共通の HTML 構造とフォント変数を適用し、`page.tsx` が `/` ルートの UI を提供する。スタイルは Tailwind CSS 4 のユーティリティクラスと CSS 変数で一元管理する。

## ファイル命名規則
- ルートおよびコンポーネント：`*.tsx`
- グローバルスタイル：`globals.css`
- 設定ファイル：`*.config.mjs` や `*.config.ts` 形式
- 静的アセット：`public/` 配下に用途に応じた拡張子で配置（SVG など）

## 主要な設計原則
- App Router のモジュール配置とサーバー / クライアントコンポーネント設計を前提に構成
- Tailwind CSS ユーティリティを中心としたスタイル管理で UI 実装を高速化
- TypeScript `strict` 設定により型安全性を確保し、ESLint で静的解析を徹底
