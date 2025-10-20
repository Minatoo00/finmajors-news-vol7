# 技術設計書

## アーキテクチャ概要

Next.js 15 App Router構成をベースとしたモノレポで、フロントエンド(UI)とAPI、バックグラウンドジョブ(ニュース収集)を同一プロジェクト内で実装する。APIは`app/api/*`配下のRoute Handlersで提供し、Prismaを通じてPostgreSQL(Railway)へアクセスする。ニュース収集ジョブはNode.js実行エントリ(`pnpm ingest:run`)として実装し、内部Cron起動(`ENABLE_INTERNAL_CRON=true`)とRailway Cron双方から同一のジョブ関数を呼び出す。要約生成はOpenAI APIを利用し、HTTPクライアント(undici)＋レート制御ロジックを共通化する。ログは構造化JSONで標準出力へ出し、Railwayログ/監視と連携する。

## 主要コンポーネント

### コンポーネント1：IngestScheduler

* 責務：内部Cron(開発用)のスケジューリングとRailway実行エントリからのジョブ起動を統一する。
* 入力：環境変数`ENABLE_INTERNAL_CRON`, `INGEST_CRON`、起動時オプション。
* 出力：ニュース収集ジョブを実行するPromise、実行結果ログ。
* 依存関係：IngestJobRunner、cronスケジューラ(node-cron等)。

### コンポーネント2：IngestJobRunner

* 責務：人物辞書ロード、RSSクエリ構築、取得～要約～保存のフロー全体を管理する。
* 入力：Prisma Client、HTTPクライアント、OpenAIクライアント、設定値(タイムアウト・並列数)。
* 出力：ジョブ統計(新規/重複/エラー件数)、`ingest_job_run`レコード。
* 依存関係：PersonRepository、RssFetcher、ArticleProcessor、SummaryService、PersistenceService、Logger。

### コンポーネント3：RssFetcher

* 責務：Google News RSSを人物ごとの検索語で取得し、XML解析して記事候補を返す。
* 入力：検索クエリ(人物/機関連語)、HTTPクライアント、タイムアウト/リトライ設定。
* 出力：記事候補の配列({link, title, description, publishedAt, sourceDomain})。
* 依存関係：人物辞書、URL正規化ユーティリティ。

### コンポーネント4：ArticleProcessor

* 責務：本文抽出(HTML→テキスト)、人物マッチング(alias一致)、要約用ペイロード生成。
* 入力：記事候補、人物辞書、本文抽出ライブラリ(例えば`@extractus/article-extractor`想定)、正規化ルール。
* 出力：保存可能な正規化記事({normalizedUrl, persons[], content, metadata})。
* 依存関係：SummaryService、PersistenceService。

### コンポーネント5：SummaryService

* 責務：OpenAI APIを使った日本語要約生成とエラー制御。
* 入力：記事本文、メタデータ、OpenAI APIキー。
* 出力：要約テキスト、エラーステータス。
* 依存関係：OpenAI SDK or fetch、バックオフロジック、Logger。

### コンポーネント6：PersistenceService (Prisma repositories)

* 責務：`article` / `summary` / `article_person` / `ingest_job_run` 等の永続化、人物・エイリアス辞書読み込み。
* 入力：Prisma Client、保存対象データ。
* 出力：保存済みレコード、重複判定結果。
* 依存関係：PostgreSQL、トランザクション管理。

### コンポーネント7：PublicAPI Routes

* 責務：`GET /api/persons`、`GET /api/articles`、`GET /api/articles/[id]` の提供。
* 入力：HTTPリクエスト(query, params)、Prisma Client。
* 出力：JSONレスポンス(人物一覧、記事一覧＋カーソル、記事詳細)。
* 依存関係：Validationユーティリティ(Zod等)、Paginationユーティリティ。
* **返却仕様（追記）**

  * `GET /api/persons`

    * 返却項目：`slug`, `name_jp`, `name_en`, `institution`, `role`, `active`
  * `GET /api/articles?person=slug&from=ISO&to=ISO&media=domain&cursor=...`

    * 返却項目：`items`（`id`, `title`, `url`, `source_domain`, `published_at`, `persons[]`, `summary.text`）、`next_cursor`
  * `GET /api/articles/[id]`

    * 返却項目：要約テキストとメタデータ（**本文は返却しない**）

### コンポーネント8：PublicWebUI

* 責務：直近ニュース表示、フィルタUI、記事詳細表示。
* 入力：APIレスポンス、URLクエリ。
* 出力：Next.js App Routerページ(`src/app/(public)/news/page.tsx`等)。
* 依存関係：Tailwind CSSテーマ、サーバーアクション or Route Handler。

### コンポーネント9：Admin UI & API

* 責務：人物/エイリアス管理、Basic認証＋IP制限の適用。
* 入力：認証情報(Basicヘッダ)、Prisma Client、フォーム入力。
* 出力：CRUDレスポンス、管理画面。
* 依存関係：Middleware(認証), API Routes, フォームコンポーネント。

## データモデル

### institution

* `id`: bigint, PK, **NOT NULL**
* `code`: text, **UNIQUE, NOT NULL**（中央銀行コード）
* `name_jp`: text, **NOT NULL**（日本語名称）
* `name_en`: text, **NOT NULL**（英語名称）

### person

* `id`: bigint, PK, **NOT NULL**
* `institution_id`: bigint, FK→institution, **NOT NULL**
* `slug`: text, **UNIQUE, NOT NULL**（公開API用識別子）
* `name_jp`: text, **NOT NULL**
* `name_en`: text, **NOT NULL**
* `role`: text, **NOT NULL**
* `active`: boolean, **DEFAULT true**

### alias

* `id`: bigint, PK, **NOT NULL**
* `person_id`: bigint, FK→person, **NOT NULL**
* `text`: text, **NOT NULL**（別名・表記ゆれ）

### article

* `id`: bigint, PK, **NOT NULL**
* `url_original`: text, **NOT NULL**（取得元URL）
* `url_normalized`: text, **UNIQUE, NOT NULL**（重複排除キー）
* `source_domain`: text, **NOT NULL**（媒体ドメイン）
* `title`: text, **NOT NULL**（記事タイトル）
* `description`: text（RSS説明・任意）
* `published_at`: timestamptz（発行日時）
* `fetched_at`: timestamptz, **NOT NULL**（取得日時）
* `created_at`: timestamptz, **DEFAULT now()**

### article_person

* `article_id`: bigint, PKの一部, FK→article, **NOT NULL**
* `person_id`: bigint, PKの一部, FK→person, **NOT NULL**
* **PRIMARY KEY (article_id, person_id)**

### summary

* `id`: bigint, PK, **NOT NULL**
* `article_id`: bigint, **UNIQUE, FK→article, NOT NULL**
* `text`: text, **NOT NULL**（要約本文）
* `created_at`: timestamptz, **DEFAULT now()**

### ingest_job_run

* `id`: bigint, PK, **NOT NULL**
* `started_at`: timestamptz, **NOT NULL**
* `finished_at`: timestamptz
* `inserted`: int
* `deduped`: int
* `errors`: int

## 処理フロー

1. スケジューラが`IngestJobRunner`を呼び出し、`ingest_job_run`レコードを開始状態で作成する。
2. `PersonRepository`が人物・エイリアス辞書をロードし、**和名／英名／フルネーム／主要エイリアスはOR、機関連語はAND**で組み合わせた検索クエリセットを生成する。
3. `RssFetcher`がGoogle News RSSを取得し、URL正規化とフィルタリングを実施する。
4. `ArticleProcessor`が本文抽出し、人物マッチングで関連人物を紐付ける。
5. `SummaryService`がOpenAI APIで日本語要約を生成する(失敗時はエラーを記録)。
6. `PersistenceService`が記事・要約・関連人物をトランザクションで保存し、重複は`url_normalized`でスキップする。
7. 最終統計を集計し、構造化ログを出力、`ingest_job_run`を完了ステータスで更新する。
8. 公開APIとUIはPrisma経由で最新記事を取得し、サーバーコンポーネントでレンダリングする。管理UIはBasic認証ミドルウェアを経由してCRUD操作を行う。

## エラーハンドリング

* HTTP取得失敗：リトライ上限まで指数バックオフで再試行し、失敗時は記事単位でエラーカウントに記録する。
* 要約生成失敗：OpenAI API例外を捕捉し、該当記事に要約未生成状態を記録。ジョブ結果にエラーとしてカウントする。
* DB重複：`url_normalized`の一意制約違反時は重複として分類し、挿入はスキップ。ジョブログにスキップ件数として記録。
* 管理API認証失敗：Basic認証やIP許可に失敗した場合はHTTP 401/403を返し、処理を中断する。
* Validationエラー：APIリクエストのパラメータ検証(Zod等)で不正値を検出し、HTTP 400とエラーコードを返却する。

## 既存コードとの統合

* 変更が必要なファイル：

  * `package.json`: `ingest:run`などジョブ実行用スクリプト追加、必要ライブラリ(Prisma, OpenAI, node-cron等)を依存に追加。
  * `src/app/layout.tsx`: メタデータやテーマ設定をFinmajors News用に更新。
  * `src/app/page.tsx`: デフォルトテンプレートからニュースUIトップへ差し替え。
  * `src/app/globals.css`: Tailwindテーマの調整やアクセシビリティ対応を追加。
* 新規作成ファイル：

  * `prisma/schema.prisma`: テーブル定義。
  * `src/lib/cron/scheduler.ts`: IngestScheduler実装。
  * `src/lib/ingest/job.ts`: IngestJobRunner本体。
  * `src/lib/ingest/rss-fetcher.ts`, `article-processor.ts`, `summary-service.ts`, `repositories.ts`: 各サブコンポーネント。
  * `src/lib/logger.ts`: 構造化ログ出力。
  * `src/app/api/persons/route.ts`, `src/app/api/articles/route.ts`, `src/app/api/articles/[id]/route.ts`: 公開API。
  * `src/app/(public)/news/page.tsx`, `src/app/(public)/news/[id]/page.tsx`: 公開UI。
  * `src/app/(admin)/admin/persons/page.tsx`, `src/app/api/admin/persons/route.ts`: 管理UI/API。
  * `middleware.ts`: 管理系ルートに対するBasic認証/IP制限。
  * `scripts/ingest.ts` または `src/app/api/cron/route.ts`: `pnpm ingest:run`のエントリーポイント。

---

## 付録A：機関シノニム JSON

**BEGIN_INSTITUTION_SYNONYMS_JSON**

```json
{
  "FRB": {
    "name_jp": "米連邦準備制度理事会",
    "name_en": "Federal Reserve Board",
    "synonyms": ["Fed", "Federal Reserve", "FRB"]
  },
  "ECB": {
    "name_jp": "欧州中央銀行",
    "name_en": "European Central Bank",
    "synonyms": ["ECB", "European Central Bank"]
  },
  "BOJ": {
    "name_jp": "日本銀行",
    "name_en": "Bank of Japan",
    "synonyms": ["BOJ", "Bank of Japan", "日銀", "日本銀行"]
  },
  "BoE": {
    "name_jp": "イングランド銀行",
    "name_en": "Bank of England",
    "synonyms": ["BoE", "Bank of England"]
  },
  "SNB": {
    "name_jp": "スイス国立銀行",
    "name_en": "Swiss National Bank",
    "synonyms": ["SNB", "Swiss National Bank"]
  }
}
```

**END_INSTITUTION_SYNONYMS_JSON**

---

## 付録B：人物シード JSON

**BEGIN_PERSONS_JSON**

```json
[
  { "institution_code": "FRB", "slug": "jerome-h-powell", "name_jp": "ジェローム・パウエル", "name_en": "Jerome H. Powell", "role": "議長", "active": true },
  { "institution_code": "FRB", "slug": "philip-n-jefferson", "name_jp": "フィリップ・ジェファーソン", "name_en": "Philip N. Jefferson", "role": "副議長", "active": true },
  { "institution_code": "FRB", "slug": "michael-s-barr", "name_jp": "マイケル・バー", "name_en": "Michael S. Barr", "role": "副議長（銀行監督担当）", "active": true },
  { "institution_code": "FRB", "slug": "michelle-w-bowman", "name_jp": "ミシェル・ボウマン", "name_en": "Michelle W. Bowman", "role": "理事", "active": true },
  { "institution_code": "FRB", "slug": "christopher-j-waller", "name_jp": "クリストファー・ウォーラー", "name_en": "Christopher J. Waller", "role": "理事", "active": true },
  { "institution_code": "FRB", "slug": "lisa-d-cook", "name_jp": "リサ・クック", "name_en": "Lisa D. Cook", "role": "理事", "active": true },
  { "institution_code": "FRB", "slug": "adriana-d-kugler", "name_jp": "アドリアナ・クーグラー", "name_en": "Adriana D. Kugler", "role": "理事", "active": true },

  { "institution_code": "ECB", "slug": "christine-lagarde", "name_jp": "クリスティーヌ・ラガルド", "name_en": "Christine Lagarde", "role": "総裁", "active": true },
  { "institution_code": "ECB", "slug": "luis-de-guindos", "name_jp": "ルイス・デ・ギンドス", "name_en": "Luis de Guindos", "role": "副総裁", "active": true },
  { "institution_code": "ECB", "slug": "philip-r-lane", "name_jp": "フィリップ・レーン", "name_en": "Philip R. Lane", "role": "理事", "active": true },
  { "institution_code": "ECB", "slug": "isabel-schnabel", "name_jp": "イザベル・シュナーベル", "name_en": "Isabel Schnabel", "role": "理事", "active": true },
  { "institution_code": "ECB", "slug": "piero-cipollone", "name_jp": "ピエロ・チポローネ", "name_en": "Piero Cipollone", "role": "理事", "active": true },
  { "institution_code": "ECB", "slug": "frank-elderson", "name_jp": "フランク・エルダーソン", "name_en": "Frank Elderson", "role": "理事", "active": true },

  { "institution_code": "BOJ", "slug": "kazuo-ueda", "name_jp": "植田 和男", "name_en": "Kazuo Ueda", "role": "総裁", "active": true },
  { "institution_code": "BOJ", "slug": "ryozo-himino", "name_jp": "氷見野 良三", "name_en": "Ryozo Himino", "role": "副総裁", "active": true },
  { "institution_code": "BOJ", "slug": "shinichi-uchida", "name_jp": "内田 真一", "name_en": "Shinichi Uchida", "role": "副総裁", "active": true },
  { "institution_code": "BOJ", "slug": "asahi-noguchi", "name_jp": "野口 旭", "name_en": "Asahi Noguchi", "role": "審議委員", "active": true },
  { "institution_code": "BOJ", "slug": "junko-nakagawa", "name_jp": "中川 順子", "name_en": "Junko Nakagawa", "role": "審議委員", "active": true },
  { "institution_code": "BOJ", "slug": "hajime-takata", "name_jp": "高田 創", "name_en": "Hajime Takata", "role": "審議委員", "active": true },
  { "institution_code": "BOJ", "slug": "naoki-tamura", "name_jp": "田村 直樹", "name_en": "Naoki Tamura", "role": "審議委員", "active": true },
  { "institution_code": "BOJ", "slug": "junko-koeda", "name_jp": "小枝 淳子", "name_en": "Junko Koeda", "role": "審議委員", "active": true },
  { "institution_code": "BOJ", "slug": "kazuyuki-masu", "name_jp": "増 和幸", "name_en": "Kazuyuki Masu", "role": "審議委員", "active": true },

  { "institution_code": "BoE", "slug": "andrew-bailey", "name_jp": "アンドリュー・ベイリー", "name_en": "Andrew Bailey", "role": "総裁", "active": true },
  { "institution_code": "BoE", "slug": "sarah-breeden", "name_jp": "サラ・ブリーデン", "name_en": "Sarah Breeden", "role": "副総裁（金融安定担当）", "active": true },
  { "institution_code": "BoE", "slug": "ben-broadbent", "name_jp": "ベン・ブロードベント", "name_en": "Ben Broadbent", "role": "副総裁（金融政策担当）", "active": true },
  { "institution_code": "BoE", "slug": "dave-ramsden", "name_jp": "デイブ・ラムスデン", "name_en": "Dave Ramsden", "role": "副総裁（市場・銀行担当）", "active": true },
  { "institution_code": "BoE", "slug": "huw-pill", "name_jp": "ヒュー・ピル", "name_en": "Huw Pill", "role": "チーフエコノミスト", "active": true },
  { "institution_code": "BoE", "slug": "jonathan-haskel", "name_jp": "ジョナサン・ハスケル", "name_en": "Jonathan Haskel", "role": "外部委員", "active": true },
  { "institution_code": "BoE", "slug": "catherine-l-mann", "name_jp": "キャサリン・マン", "name_en": "Catherine L. Mann", "role": "外部委員", "active": true },
  { "institution_code": "BoE", "slug": "megan-greene", "name_jp": "メーガン・グリーン", "name_en": "Megan Greene", "role": "外部委員", "active": true },
  { "institution_code": "BoE", "slug": "clare-lombardelli", "name_jp": "クレア・ロンバルデッリ", "name_en": "Clare Lombardelli", "role": "外部委員", "active": true },

  { "institution_code": "SNB", "slug": "martin-schlegel", "name_jp": "マーティン・シュレーゲル", "name_en": "Martin Schlegel", "role": "総裁", "active": true },
  { "institution_code": "SNB", "slug": "antoine-martin", "name_jp": "アントワーヌ・マルタン", "name_en": "Antoine Martin", "role": "副総裁", "active": true },
  { "institution_code": "SNB", "slug": "petra-tschudin", "name_jp": "ペトラ・チュディン", "name_en": "Petra Tschudin", "role": "理事", "active": true }
]
```

**END_PERSONS_JSON**

---

## 付録C：エイリアス上書き JSON

**BEGIN_ALIASES_OVERRIDE_JSON**

```json
[
  { "person_slug": "jerome-h-powell",
    "texts": ["Jerome H. Powell","Jerome H Powell","Jerome Powell","ジェローム・パウエル","ジェローム パウエル","パウエル議長","FRB議長"] },
  { "person_slug": "philip-n-jefferson",
    "texts": ["Philip N. Jefferson","Philip N Jefferson","Philip Jefferson","フィリップ・ジェファーソン","フィリップ ジェファーソン","ジェファーソン副議長","FRB副議長"] },
  { "person_slug": "michael-s-barr",
    "texts": ["Michael S. Barr","Michael S Barr","Michael Barr","マイケル・バー","マイケル バー","銀行監督担当副議長","副議長（銀行監督）","FRB副議長（銀行監督担当）"] },
  { "person_slug": "michelle-w-bowman",
    "texts": ["Michelle W. Bowman","Michelle W Bowman","Michelle Bowman","ミシェル・ボウマン","ミシェル ボウマン","FRB理事"] },
  { "person_slug": "christopher-j-waller",
    "texts": ["Christopher J. Waller","Christopher J Waller","Christopher Waller","クリストファー・ウォーラー","クリストファー ウォーラー","FRB理事"] },
  { "person_slug": "lisa-d-cook",
    "texts": ["Lisa D. Cook","Lisa D Cook","Lisa Cook","リサ・クック","リサ クック","FRB理事"] },
  { "person_slug": "adriana-d-kugler",
    "texts": ["Adriana D. Kugler","Adriana D Kugler","Adriana Kugler","アドリアナ・クーグラー","アドリアナ クーグラー","FRB理事"] },

  { "person_slug": "christine-lagarde",
    "texts": ["Christine Lagarde","クリスティーヌ・ラガルド","クリスティーヌ ラガルド","ラガルド総裁","ECB総裁"] },
  { "person_slug": "luis-de-guindos",
    "texts": ["Luis de Guindos","ルイス・デ・ギンドス","ルイス デ ギンドス","デ・ギンドス副総裁","ECB副総裁"] },
  { "person_slug": "philip-r-lane",
    "texts": ["Philip R. Lane","Philip R Lane","Philip Lane","フィリップ・レーン","フィリップ レーン","レーン理事","ECB理事"] },
  { "person_slug": "isabel-schnabel",
    "texts": ["Isabel Schnabel","イザベル・シュナーベル","イザベル シュナーベル","シュナーベル理事","ECB理事"] },
  { "person_slug": "piero-cipollone",
    "texts": ["Piero Cipollone","ピエロ・チポローネ","ピエロ チポローネ","チポローネ理事","ECB理事"] },
  { "person_slug": "frank-elderson",
    "texts": ["Frank Elderson","フランク・エルダーソン","フランク エルダーソン","エルダーソン理事","ECB理事"] },

  { "person_slug": "kazuo-ueda",
    "texts": ["Kazuo Ueda","植田和男","植田 和男","植田総裁","日銀総裁","日本銀行総裁"] },
  { "person_slug": "ryozo-himino",
    "texts": ["Ryozo Himino","氷見野良三","氷見野 良三","氷見野副総裁","日銀副総裁","BOJ副総裁"] },
  { "person_slug": "shinichi-uchida",
    "texts": ["Shinichi Uchida","内田真一","内田 真一","内田副総裁","日銀副総裁","BOJ副総裁"] },
  { "person_slug": "asahi-noguchi",
    "texts": ["Asahi Noguchi","野口旭","野口 旭","野口審議委員","日銀審議委員","BOJ審議委員"] },
  { "person_slug": "junko-nakagawa",
    "texts": ["Junko Nakagawa","中川順子","中川 順子","中川審議委員","日銀審議委員","BOJ審議委員"] },
  { "person_slug": "hajime-takata",
    "texts": ["Hajime Takata","高田創","高田 創","高田審議委員","日銀審議委員","BOJ審議委員"] },
  { "person_slug": "naoki-tamura",
    "texts": ["Naoki Tamura","田村直樹","田村 直樹","田村審議委員","日銀審議委員","BOJ審議委員"] },
  { "person_slug": "junko-koeda",
    "texts": ["Junko Koeda","小枝淳子","小枝 淳子","小枝審議委員","日銀審議委員","BOJ審議委員"] },
  { "person_slug": "kazuyuki-masu",
    "texts": ["Kazuyuki Masu","増和幸","増 和幸","増審議委員","日銀審議委員","BOJ審議委員"] },

  { "person_slug": "andrew-bailey",
    "texts": ["Andrew Bailey","アンドリュー・ベイリー","アンドリュー ベイリー","ベイリー総裁","BoE総裁","英中銀総裁"] },
  { "person_slug": "sarah-breeden",
    "texts": ["Sarah Breeden","サラ・ブリーデン","サラ ブリーデン","ブリーデン副総裁","BoE副総裁","金融安定担当副総裁"] },
  { "person_slug": "ben-broadbent",
    "texts": ["Ben Broadbent","ベン・ブロードベント","ベン ブロードベント","ブロードベント副総裁","BoE副総裁","金融政策担当副総裁"] },
  { "person_slug": "dave-ramsden",
    "texts": ["Dave Ramsden","デイブ・ラムスデン","デイブ ラムスデン","ラムスデン副総裁","BoE副総裁","市場・銀行担当副総裁"] },
  { "person_slug": "huw-pill",
    "texts": ["Huw Pill","ヒュー・ピル","ヒュー ピル","ピル チーフエコノミスト","BoEチーフエコノミスト"] },
  { "person_slug": "jonathan-haskel",
    "texts": ["Jonathan Haskel","ジョナサン・ハスケル","ジョナサン ハスケル","ハスケル外部委員","MPC外部委員"] },
  { "person_slug": "catherine-l-mann",
    "texts": ["Catherine L. Mann","Catherine L Mann","Catherine Mann","キャサリン・マン","キャサリン マン","マン外部委員","MPC外部委員"] },
  { "person_slug": "megan-greene",
    "texts": ["Megan Greene","メーガン・グリーン","メーガン グリーン","グリーン外部委員","MPC外部委員"] },
  { "person_slug": "clare-lombardelli",
    "texts": ["Clare Lombardelli","クレア・ロンバルデッリ","クレア ロンバルデッリ","ロンバルデッリ外部委員","MPC外部委員"] },

  { "person_slug": "martin-schlegel",
    "texts": ["Martin Schlegel","マーティン・シュレーゲル","マーティン シュレーゲル","シュレーゲル総裁","SNB総裁"] },
  { "person_slug": "antoine-martin",
    "texts": ["Antoine Martin","アントワーヌ・マルタン","アントワーヌ マルタン","マルタン副総裁","SNB副総裁"] },
  { "person_slug": "petra-tschudin",
    "texts": ["Petra Tschudin","ペトラ・チュディン","ペトラ チュディン","チュディン理事","SNB理事"] }
]
```

**END_ALIASES_OVERRIDE_JSON**
