# 要件定義書

## 機能概要

主要中央銀行（BOJ／BoE／ECB／FRB／SNB）の要人発言に関するニュースを毎時収集し、正規化・要約した上で公開サイトと運用者向け管理UIを通じて提供する。自動化された収集パイプラインと、閲覧者／運用者の双方が利用できる Web インターフェースを整備する。
**収集ソース方針**：安定な取得経路を優先（RSS/公式フィード等）。当面は Google News RSS を使用（拡張可能性あり）。

## ユーザーストーリー

* 金融ニュースを追いたい利用者として、最新の要人発言ニュースと要約を確認したい。なぜなら、素早く市場動向を把握したいから。
* 運用担当者として、人物辞書（人物・エイリアス）を管理したい。なぜなら、収集と要約の精度を維持したいから。

## 機能要件

### 要件1：ニュース収集ジョブ

* Railway Cron または内部 Cron のスケジュールに従い、人物辞書をもとに Google News RSS を検索・収集し、記事本文抽出と要約生成を行う。
* 受入基準：

  * [ ] `ENABLE_INTERNAL_CRON=true` か Railway Cron トリガーのいずれかで毎時 05 分にジョブが開始されること。
  * [ ] **ローカル検証用スケジューリング**：`ENABLE_INTERNAL_CRON=true` の場合のみ内部Cronを起動できること。`INGEST_CRON="5 * * * *"` のように環境変数でスケジュール式を指定できること。**ジョブ本体は関数化**され、内部Cron／Railway Cron の双方から同一ロジックを呼び出せること。
    本番では `ENABLE_INTERNAL_CRON=false` とし、Railway のスケジューラから `pnpm ingest:run` を毎時05分に実行できること。
  * [ ] 10 秒タイムアウト・最大 2 回リトライ・同時 5 接続を守り、失敗時の再試行が行われること。
  * [ ] 処理完了時に新規件数・重複件数・エラー件数がログに出力されること。

### 要件2：データ永続化と要約管理

* Prisma 経由で定義された `institution` / `person` / `alias` / `article` / `article_person` / `summary` / `ingest_job_run` テーブルに取得結果を保存し、記事ごとに 1 件の日本語要約を紐付ける。
* 受入基準：

  * [ ] `url_normalized` によって重複記事が排除されること。
  * [ ] 要約が OpenAI API を用いて生成され、`summary` テーブルに格納されること。
  * [ ] `ingest_job_run` にジョブの開始・終了時刻と件数が保存されること。

### 要件3：公開 Web UI

* Next.js 15 App Router を用いた公開ページで、直近 24〜48 時間のニュース一覧と記事詳細を提供する。
* 受入基準：

  * [ ] 一覧ページでタイトル・媒体ドメイン・発行時刻・要約を表示し、人物・期間・媒体でのフィルタが行えること。
  * [ ] サーバーサイドでカーソルベースのページネーションが実装されていること。
  * [ ] 詳細ページに本文を表示せず、要約とメタデータのみを掲載すること。

### 要件4：管理 UI と API

* Basic 認証と IP 制限付きの管理 UI／API で人物辞書を CRUD できるようにする。
* 受入基準：

  * [ ] 管理 UI が人物とエイリアスの参照・追加・更新・無効化を提供すること。
  * [ ] 管理 API が `GET/POST/PUT /api/admin/persons` を実装し、CRUD 操作を反映すること。
  * [ ] 認証情報は環境変数（`BASIC_AUTH_USER` / `BASIC_AUTH_PASS`）で管理されること。

### **要件5：公開 API（読み取り）**

* 受入基準：

  * [ ] `GET /api/persons` を提供し、`slug, name_jp, name_en, institution, role, active` を返却できること。
  * [ ] `GET /api/articles?person=slug&from=ISO&to=ISO&media=domain&cursor=...` を提供し、
    `items（id, title, url, source_domain, published_at, persons[], summary.text）, next_cursor` を返却できること。
  * [ ] `GET /api/articles/{id}` を提供し、要約テキストとメタデータ（本文は返却しない）を返却できること。

## 非機能要件

* **パフォーマンス**：ニュース一覧は Core Web Vitals を意識し、LCP 2.5 秒以内・CLS 最小化・INP 改善のための即時フィードバックを確保する。
* **セキュリティ**：API キーやベーシック認証情報を環境変数管理し、管理 UI/API には IP 制限を適用する。robots.txt を遵守するクロールのみ実施する。
* **信頼性（修正）**：HTTP タイムアウト 10 秒・最大リトライ 2 回・ジョブ全体タイムアウト 8 分・同時 5 接続を遵守する。
* **可観測性（修正）**：新規取得・重複スキップ・エラー件数を**構造化して標準出力に出力**する。
* **時刻ポリシー**：DB は UTC 保存、UI は JST 表示とする。
* **バックアップ**：Railway スナップショットに加え、**週 1 回 `pg_dump`** を実施する。
* **技術スタック**：Next.js 15（App Router, TypeScript）／Node.js 20／PostgreSQL（Railway）／Prisma／Railway Cron。
* **デプロイ・運用**：初期は CI/CD なし。ローカルで build し、Railway ダッシュボードまたは CLI から手動デプロイを行う。README に**環境変数・手動デプロイ手順・Cron 設定・週1回バックアップ（pg_dump）**を記載する。