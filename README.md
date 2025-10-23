# Finmajors News Vol7

中央銀行要人発言ニュースを収集・要約し、公開 UI / 管理 UI / 公開 API / 管理 API を提供する Next.js 15 アプリケーションです。ニュース収集ジョブは Prisma + OpenAI API を使用し、Railway にデプロイすることを前提としています。

## セットアップ

1. 依存ライブラリをインストールします。

   ```bash
   npm install
   ```

2. 必要な環境変数を `.env` などに設定します。

   | 変数 | 説明 |
   | --- | --- |
   | `DATABASE_URL` | PostgreSQL 接続文字列 |
   | `DIRECT_DATABASE_URL` | （任意）Prisma の direct URL |
   | `OPENAI_API_KEY` | OpenAI API キー |
   | `OPENAI_MODEL` | 使用する OpenAI モデル（既定: `gpt-4o-mini`） |
   | `ENABLE_INTERNAL_CRON` | ローカル開発用に内部 Cron を有効化する場合は `true` |
   | `INGEST_CRON` | 内部 Cron のスケジュール式（既定: `5 * * * *`） |
| `INGEST_CONCURRENCY` / `INGEST_RETRY_LIMIT` / `INGEST_TIMEOUT_MS` | 収集ジョブの並列数・リトライ・タイムアウト設定 |
| `INGEST_JOB_TIMEOUT_MS` | ジョブ全体のタイムアウト（ミリ秒） |
| `INGEST_MAX_ARTICLES_PER_PERSON` | 一人の要人あたり保存する記事数の上限（既定: 8件） |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | 管理 UI / 管理 API の Basic 認証情報 |
| `ALLOWED_ADMIN_IPS` | 管理 UI / API にアクセス可能な IP のカンマ区切りリスト（未設定の場合は制限なし） |

3. Prisma マイグレーションを適用します。

   ```bash
   npx prisma migrate deploy
   ```

4. マスターデータ（機関・人物・エイリアス）を投入します。

   ```bash
   npx prisma db seed
   ```

## 実行コマンド

| コマンド | 説明 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動（Turbopack） |
| `npm run build` / `npm start` | 本番ビルド／起動 |
| `npm run lint` | ESLint による静的解析 |
| `npm test` | node:test + ts-node でユニットテストを実行 |
| `npm run ingest:run` | 収集ジョブを単発実行（Railway Cron で呼び出す想定） |

## API エンドポイント概要

- `GET /api/persons`
  - 公開 API。アクティブな人物リスト (`slug`, 和名/英名, 役職, 所属) を返却します。

- `GET /api/articles`
  - 公開 API。人物・期間・媒体でフィルタ可能な記事一覧を返却します。
  - カーソルベースページネーション (`cursor` クエリ) 対応。レスポンスの `nextCursor` を次のリクエストに付与してください。

- `GET /api/articles/{id}`
  - 公開 API。記事詳細と要約・関連人物メタデータを返却します（本文は返さない）。

- `GET/POST/PUT /api/admin/persons`
  - 管理 API。Basic 認証 + IP 制限を通過したクライアントのみアクセス可能。
  - `POST` で人物作成、`PUT` で部分更新（エイリアスの差分適用を含む）。

レスポンスは JSON で、ID は文字列、日時は ISO 文字列（JST 表示はフロント側で `formatJstDateTime` を使用）です。

## 公開 UI

- `/news` — 直近ニュース一覧。人物/ドメイン/期間フィルタとカーソルページネーションを備え、要約と要人チップを表示します。
- `/news/[id]` — 記事詳細ページ。要約と関連人物メタ情報のみを掲載し、元記事リンクを提供します。
- Skeleton + Suspense で LCP を改善しています。

## 管理 UI

- `/admin/persons` — 人物辞書の閲覧・追加・更新を行う管理ページ。
  - Basic 認証 (`BASIC_AUTH_USER`/`BASIC_AUTH_PASS`) と `ALLOWED_ADMIN_IPS` のホワイトリストを middleware で強制。
  - サーバーアクション経由で Prisma を呼び出し、フォーム送信後は `revalidatePath` により最新情報を反映します。

## ニュース収集ジョブ

- 開発時：`ENABLE_INTERNAL_CRON=true` を設定すると、アプリ起動時に内部 Cron が `INGEST_CRON` のスケジュールで `IngestJobRunner` を実行します。
- 本番：`ENABLE_INTERNAL_CRON=false` とし、Railway Cron から `npm run ingest:run` を毎時05分に呼び出してください。
- 取得統計は `ingest_job_run` テーブルに保存され、構造化ログで `inserted` / `deduped` / `errors` を出力します。

## テスト

Node.js 20 以上で以下を実行します。

```bash
npm test
```

公開 API / 管理 API / UI コンポーネント / 収集ジョブのユニットテストを Node の組み込みテストランナーで実行します。

## デプロイメモ

- Railway へデプロイする際は、環境変数と Cron 設定、週次 `pg_dump` バックアップを README の手順どおりに設定してください。
- Basic 認証情報は Secrets、IP 制限は `ALLOWED_ADMIN_IPS` に設定します。
