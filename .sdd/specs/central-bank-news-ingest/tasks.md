# 実装タスクリスト

## セクション1：データモデル実装
- [ ] 1.1 必要な型定義・データ構造を作成する
  - Prisma スキーマに `institution`, `person`, `alias`, `article`, `article_person`, `summary`, `ingest_job_run` を定義し、マイグレーションを用意する
  - API/ジョブで利用する TypeScript 型（DTO・レスポンス型・環境変数設定型）とバリデーション（Zod 等）を整備する
- [ ] 1.2 データ永続化層を実装する
  - `src/lib/prisma.ts` シングルトン、`PersistenceService`（または Prisma リポジトリ群）を実装して CRUD/トランザクション処理を提供する
  - URL 正規化重複チェック、`ingest_job_run` 集計更新、人物辞書ロードを含む永続化ユーティリティを作成する

## セクション2：ビジネスロジック実装
- [ ] 2.1 IngestScheduler / IngestJobRunner のコア処理を実装する
  - Cron トリガ（Railway CLI / 内部 Cron）の共通起動口を整備し、design.md 処理フロー1–3（辞書ロード→RSS 取得→重複排除）に対応する
  - 並列数・タイムアウト・リトライを環境変数から読み込み、構造化ログ出力を実装する
- [ ] 2.2 RssFetcher・ArticleProcessor・SummaryService を実装する
  - design.md 処理フロー4–5に従い、本文抽出・人物マッチング・OpenAI 要約生成を行う
  - 要約失敗や本文抽出失敗のリトライ／スキップ処理を実装し、再実行時に再試行できるよう状態を管理する
- [ ] 2.3 エラーハンドリングを実装する
  - RSS/HTTP 失敗、OpenAI エラー、Prisma トランザクション失敗、認証失敗など design.md に列挙されたケースごとにリカバリ処理を組み込む
  - 構造化ログへエラー種別とスタック情報を出力し、ジョブ統計(`inserted`/`deduped`/`errors`)を更新する

## セクション3：インターフェース実装
- [ ] 3.1 UIコンポーネント/APIエンドポイントを作成する
  - 公開 API (`GET /api/persons`, `GET /api/articles`, `GET /api/articles/[id]`) と管理 API (`/api/admin/persons`) を Route Handler で実装する
  - 公開 UI（一覧・詳細）と管理 UI（人物/エイリアス CRUD、Basic 認証フロー）を App Router セグメントで構築する
- [ ] 3.2 入力バリデーションを実装する
  - API クエリ/ボディ検証、管理 UI フォーム検証、環境変数ロード時のスキーマバリデーションを追加する
- [ ] 3.3 出力フォーマットを実装する
  - 要件どおり JST 表示・カーソルベースページネーションを整備し、API レスポンスを要約メタデータ付き JSON として整形する
  - Public UI では Core Web Vitals 対策（Skeleton, Streaming 等）を取り入れる

## セクション4：統合とテスト
- [ ] 4.1 コンポーネントを統合する
  - Cron 起動から永続化・API/UI 表示までのデータフローを通し、サーバー/クライアントコンポーネント間の依存を調整する
  - Basic 認証ミドルウェアと IP 制限設定、環境変数ドキュメントを README に追記する
- [ ] 4.2 基本的な動作テストを実装する
  - Prisma モデルのテーブル間制約テスト、ジョブロジックのユニット/統合テスト（モック HTTP/AI）、API Route の E2E テストを追加する
  - 内部 Cron のスケジュール切り替えやリトライのユニットテストを整備する
- [ ] 4.3 要件の受入基準を満たすことを確認する
  - 非機能要件(タイムアウト・リトライ・構造化ログ・JST 表示等)をチェックリスト化し、デプロイ手順/バックアップ手順を README に反映する
