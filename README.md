# Finmajors News Vol7

中央銀行要人発言のニュースを収集・要約し、公開 UI / 管理 UI / 公開 API / 管理 API を提供する Next.js 15 アプリケーションです。ニュース収集ジョブには Prisma と OpenAI API を利用し、Railway へのデプロイを前提としています。

## 主な構成
- 公開 UI (`/news`, `/news/[id]`): 中央銀行ニュースの一覧・詳細表示、フィルタ、カーソルページネーション
- 管理 UI (`/admin/persons`): 人物辞書の閲覧・登録・更新。Basic 認証と IP 制限を必須化
- 公開 API (`GET /api/persons`, `GET /api/articles`, `GET /api/articles/{id}`, `POST /api/resolve`): ニュースと人物情報を JSON で提供し、Google News の短縮リンクを正規のニュース URL に展開
- 管理 API (`GET/POST/PUT /api/admin/persons`): 管理 UI および内部ツール向けの辞書更新 API
- ニュース収集ジョブ: RSS 取得→本文抽出→要人言及チェック→OpenAI 要約→Prisma 保存→ジョブ統計記録

## 前提条件
- Node.js 20 以上 (推奨: 20 LTS)
- npm (同梱の 10.x 以上)
- Railway のマネージド PostgreSQL（PostgreSQL 15 以上）
- OpenAI API キー
- Railway アカウント（本番運用想定）

## セットアップ手順
1. 依存ライブラリをインストールします。
   ```bash
   npm install
   ```
2. Playwright の Chromium バイナリをインストールします（`POST /api/resolve` でヘッドレスブラウザを使用します）。
   ```bash
   npx playwright install chromium
   ```
3. プロジェクトルートに `.env` を用意し、後述の環境変数を設定します。
4. Prisma マイグレーションを適用します。
   ```bash
   npx prisma migrate deploy
   ```
5. 初期データ（機関・人物・エイリアス）を投入します。
   ```bash
   npx prisma db seed
   ```
6. 開発サーバーを起動します。
   ```bash
   npm run dev
   ```

## 環境変数
| 変数 | 必須 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `NODE_ENV` | いいえ | `development` | 実行モード。`production` で最適化設定、`test` でテスト専用設定を利用 |
| `DATABASE_URL` | はい | なし | Prisma が接続する PostgreSQL URL |
| `DIRECT_DATABASE_URL` | いいえ | なし | Prisma の direct 接続 URL（トランザクション高速化が必要な場合に設定） |
| `OPENAI_API_KEY` | はい | なし | OpenAI API 認証キー |
| `OPENAI_MODEL` | いいえ | `gpt-4o-mini` | 要約生成に使用するモデル ID |
| `ENABLE_INTERNAL_CRON` | いいえ | `false` | アプリ内でニュース収集ジョブを定期実行するかどうか（ローカル開発向け） |
| `INGEST_CRON` | いいえ | `5 * * * *` | 内部 Cron のスケジュール（分 時 日 月 曜） |
| `INGEST_CONCURRENCY` | いいえ | `5` | 人物ごとの RSS 取得並列数上限（1–10） |
| `INGEST_RETRY_LIMIT` | いいえ | `2` | RSS 取得時のリトライ回数上限（0–5） |
| `INGEST_TIMEOUT_MS` | いいえ | `10000` | RSS 取得と本文抽出のタイムアウト（ミリ秒） |
| `INGEST_JOB_TIMEOUT_MS` | いいえ | `480000` | 収集ジョブ全体のタイムアウト（ミリ秒） |
| `INGEST_MAX_ARTICLES_PER_PERSON` | いいえ | `8` | 一人の要人あたり保存する記事の上限（1–100） |
| `BASIC_AUTH_USER` | はい | なし | 管理 UI / 管理 API の Basic 認証ユーザー名 |
| `BASIC_AUTH_PASS` | はい | なし | 管理 UI / 管理 API の Basic 認証パスワード |
| `ALLOWED_ADMIN_IPS` | いいえ | `[]` | 管理 UI / 管理 API を許可する IP のカンマ区切りリスト（空なら制限なし） |

## よく使うコマンド
| コマンド | 説明 |
| --- | --- |
| `npm run dev` | 開発サーバー (Next.js + Turbopack) を起動 |
| `npm run build` / `npm start` | 本番ビルド生成／本番サーバー起動 |
| `npm run lint` | ESLint (flat config) で静的解析 |
| `npm test` | Node.js 標準テストランナー + ts-node でユニット/統合テスト実行 |
| `npm run ingest:run` | 収集ジョブを単発実行（Railway Cron から呼び出す想定） |

## アーキテクチャ概要
- フロントエンド: Next.js App Router。公開 UI は Suspense + Skeleton で LCP を最適化。管理 UI は Server Action で Prisma を操作。
- API: App Router の Route Handler。公開 API はキャッシュフレンドリーな JSON を返却、管理 API は Basic 認証と IP 制限を middleware で適用。
- バックエンドサービス: Prisma を介して PostgreSQL に永続化。人物辞書・記事・要約・ジョブ統計を保持。
- ニュース収集: `IngestJobRunner` が人物辞書を読み込み、RSS 取得→本文抽出→要約生成→重複判定→保存までを実行。

## ニュース収集ジョブの運用
- 実行方法
  - ローカル: `.env` で `ENABLE_INTERNAL_CRON=true` を設定すると `INGEST_CRON` に従いアプリ内 Cron が動きます。
  - 本番: `ENABLE_INTERNAL_CRON=false` のまま、Railway の Cron で `npm run ingest:run` を呼び出してください。
- 頻度変更
  - 内部 Cron: `.env` の `INGEST_CRON`（5 フィールド記法）を書き換えます。
  - Railway Cron: ダッシュボードでスケジュールを変更し、必要に応じて `INGEST_CRON` と合わせます。
- 処理内容
  - RSS 取得は `INGEST_CONCURRENCY` と `INGEST_TIMEOUT_MS` で制御し、失敗時は `INGEST_RETRY_LIMIT` 回まで再試行。
  - 本文抽出後、要人言及のしきい値を満たす記事のみを対象に OpenAI で要約 (`OPENAI_MODEL`) を生成。
  - `content_hash` により重複排除し、統計は `ingest_job_run` テーブルに記録 (`inserted` / `deduped` / `errors`)。

## テスト
- `npm test`: Node.js 20 以降の標準テストランナー (`node --test`) と ts-node を併用。
- カバレッジ範囲
  - API レイヤー (公開 / 管理)
  - フロントコンポーネント（公開 UI / 管理 UI）
  - ニュース収集ロジック（記事処理・スケジューラ・サマリー生成）
  - Prisma スキーマ整合性と永続化サービス

## デプロイ (Railway 想定)
1. Railway のマネージド PostgreSQL インスタンスを作成し、接続情報を `DATABASE_URL` と `DIRECT_DATABASE_URL` として Secrets に設定。
2. OpenAI キー・Basic 認証・ジョブ関連の環境変数を Secrets として登録。
3. `npm run build` を CI/CD で実行し、生成されたアプリを Railway にデプロイ（同じビルドステップで `npx playwright install chromium` を実行し、ヘッドレスブラウザを用意）。
4. Cron タスクを作成し、例として「毎時 5 分」に `npm run ingest:run` を呼び出す。
5. デプロイ後に `npx prisma migrate deploy` と `npx prisma db seed` を one-off で実行し、スキーマと辞書を同期。

## バックアップと運用
- Railway の「バックアップ」機能またはスケジュールされた `pg_dump` を最低でも週次で実行し、安全なストレージに保存してください。
- 重大なマイグレーション実施前には手動で `pg_dump` を取得し、ロールバック手段を確保します。
- 収集ジョブ失敗時は構造化ログ（`ingest.job.failed`, `ingest.summary.*` など）を参照し、再実行前に原因を特定します。

## ディレクトリ構成 (抜粋)
```
src/
  app/                 Next.js App Router のページと API
  components/          公開 UI・管理 UI コンポーネント
  lib/                 API 層、環境変数、ニュース収集ロジック
  middleware.ts        管理 UI/API の認証・IP 制御
prisma/                Prisma スキーマとシードスクリプト
tests/                 node:test ベースのテスト一式
docs/design-system.md  UI/UX ガイドライン
scripts/               収集ジョブ CLI のエントリポイント
```

## メンテナンスメモ
- OpenAI モデルを変更する場合は `OPENAI_MODEL` を更新し、要約品質を確認してください。
- Prisma のマイグレーションは本番前に `npx prisma migrate deploy` で適用漏れをチェックし、失敗時に備えてバックアップを取得します。
- 依存関係更新時は `npm run lint` と `npm test` を必ず実行し、破壊的変更がないか確認します。
