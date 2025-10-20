# 実装したい機能

## 概要
このアプリは、主要中央銀行（BOJ／BoE／ECB／FRB／SNB）の要人発言に関するニュースを自動収集・要約・公開するシステムです。
## 詳細
金融要人発言ニュース
最終更新: 2025-10-17 JST対象: 一般公開Web＋運用者向け管理UI（非公開）技術スタック: Next.js 15 (App Router, TypeScript) / Node.js 20 / PostgreSQL（Railway）/ Prisma / Railway Cron

1. 目的・スコープ（MVP）
* 主要中銀（BOJ / BoE / ECB / FRB / SNB）要人の発言関連ニュースを自動収集し、要約＋メタデータを公開する。
* 本文抽出（HTML→テキスト化）し、DB に保存。
* 安定な取得経路を優先（RSS/公式フィード等）。当面は Google News RSS を使用。（拡張可能性あり）
* 公開サイト（無認証）＋管理UI（Basic 認証＋IP 制限）。

2. 非機能・運用要件
* 収集頻度: Railway Cron により毎時 05 分起動。
* タイムアウト/リトライ: HTTP タイムアウト 10s、最大 2 回リトライ、ジョブ上限 8 分。
* 並列/負荷: 同時 5 接続。
* ログ: 新規件数／スキップ（重複）件数／エラー件数を構造化して標準出力に出力。
* 時刻: DB は UTC 保存、UI は JST 表示。
* 法務/コンプラ: robots.txt を遵守。
* バックアップ: Railway スナップショット＋週 1 回 pg_dump。

3. データ収集アーキテクチャ
3.1 ソース方針
* 一次ソース: Google News RSS（人物名と機関連語の OR/AND 検索）。
3.2 処理フロー（毎時）
1. 人物辞書ロード（person と alias）。
2. 検索語生成（和名／英名／フルネーム／主要エイリアスの OR、機関連語の AND）。
3. Google News RSS 取得。
4. URL 正規化＋重複排除（正規化 URL の UNIQUE）。
5. 本文抽出（要約用・揮発）。
6. 人物マッチ（辞書一致で 1 名以上の紐付け）。
7. 要約生成（短い日本語要約）。OpenAIのAPIを使用
8. 保存（article、summary、article_person）。
9. ジョブ集計ログ（新規／スキップ／エラー件数）。

4. データモデル
ORM: Prisma
4.1 テーブル
4.1.1 institution
カラム 型 制約 説明
id bigint PK NOT NULL 連番
code text UNIQUE, NOT NULL 機関コード（BOJ/BoE/ECB/FRB/SNB）
name_jp text NOT NULL 機関名（日本語）
name_en text NOT NULL 機関名（英語）
4.1.2 person
カラム 型 制約 説明
id bigint PK NOT NULL 人物
institution_id bigint FK→institution.id NOT NULL 所属
slug text UNIQUE, NOT NULL URL/API 用
name_jp text NOT NULL 氏名（日本語）
name_en text NOT NULL 氏名（英語）
role text NOT NULL 役職
active boolean DEFAULT true アクティブ
4.1.3 alias
カラム 型 制約 説明
id bigint PK NOT NULL エイリアス
person_id bigint FK→person.id NOT NULL 対象人物
text text NOT NULL 別名／表記ゆれ
4.1.4 article
カラム 型 制約 説明
id bigint PK NOT NULL 記事
url_original text NOT NULL 取得元 URL
url_normalized text UNIQUE, NOT NULL デデュープキー
source_domain text NOT NULL 媒体ドメイン
title text NOT NULL 記事タイトル
description text RSS 説明など
published_at timestamptz 発行日時（不明可）
fetched_at timestamptz NOT NULL 収集時刻
created_at timestamptz DEFAULT now() 作成
4.1.5 article_person
カラム 型 制約 説明
article_id bigint FK→article.id PK の一部 記事
person_id bigint FK→person.id PK の一部 人物
PRIMARY KEY (article_id, person_id)
4.1.6 summary
カラム 型 制約 説明
id bigint PK NOT NULL 要約
article_id bigint UNIQUE FK→article.id NOT NULL 対象記事
text text NOT NULL 短い日本語要約（1 段落〜数文）
created_at timestamptz DEFAULT now() 作成
4.1.7 ingest_job_run
カラム 型 制約 説明
id bigint PK NOT NULL ジョブ ID
started_at timestamptz NOT NULL 開始
finished_at timestamptz 終了
inserted int 新規件数
deduped int スキップ（重複）件数
errors int エラー件数
5. API 設計
5.1 公開 API（読み取り）
* GET /api/persons
* 返却: slug, name_jp, name_en, institution, role, active
* GET /api/articles?person=slug&from=ISO&to=ISO&media=domain&cursor=...
* 返却: items（id, title, url, source_domain, published_at, persons[], summary.text）、next_cursor
* GET /api/articles/{id}
* 返却: 要約テキストとメタ（本文は返却しない）
5.2 管理 API
* GET/POST/PUT /api/admin/persons（人物・alias の最小 CRUD）

6. フロントエンド
6.1 一般公開 UI（日本語）
* 新着一覧（直近 24–48h）。タイトル、媒体、発行時刻、短い要約。
* 一覧: 人物・期間（＋媒体） の簡易フィルタ、発行日降順、サーバーサイド cursor ページネーション。
* 詳細: 要約テキストとメタ（本文は表示しない）。
6.2 管理 UI
* 人物／エイリアス管理の最小 CRUD。
* 

7. スケジューリング
* Railway Cron で毎時 05 分起動 → Worker 実行。
* ジョブ全体タイムアウト 8 分。

7.x ローカル検証用スケジューリング""

開発時（ローカル）でも Railway Cron と同じ処理を検証できるように、**内部Cronのみ**実装する。

1. `.env` に `ENABLE_INTERNAL_CRON=true` がある場合のみ起動する。
2. `INGEST_CRON="5 * * * *"` のように環境変数でスケジュール式を設定できる。
3. **ジョブ本体は関数化**し、内部CronとRailway Cronの両方から同一ロジックを呼び出せるようにする。""

4. 本番では `ENABLE_INTERNAL_CRON=false` にして、Railwayのスケジューラ機能から `pnpm ingest:run` を毎時05分に実行する。

8. セキュリティ
* 公開閲覧: 無認証。
* 管理 UI/API: Basic 認証＋IP 許可リスト。
* 環境変数で機密を管理。

9. 環境変数
* DATABASE_URL
* OPENAI_API_KEY
* PUBLIC_BASE_URL
* BASIC_AUTH_USER, BASIC_AUTH_PASS
* 収集系:
* CRAWL_MAX_CONCURRENCY=5
* CRAWL_REQUEST_TIMEOUT_MS=10000
* CRAWL_RETRY_MAX=2
* JOB_GLOBAL_TIMEOUT_MS=480000
* ENABLE_INTERNAL_CRON=true # 開発: true, 本番: false
* INGEST_CRON="5 * * * *" # Cron式（開発時のみ使用）


10. デプロイ・運用
* 初期は CI/CD なし。ローカルで build → Railway ダッシュボード/CLI から手動デプロイ。
* README（運用手順メモ）
* 必須記載: 環境変数、手動デプロイ手順、Cron 設定、週 1 回バックアップ（pg_dump）。
