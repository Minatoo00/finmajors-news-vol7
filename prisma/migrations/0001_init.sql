-- CreateTable
CREATE TABLE "institution" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name_jp" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,

    CONSTRAINT "institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" BIGSERIAL NOT NULL,
    "institution_id" BIGINT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_jp" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alias" (
    "id" BIGSERIAL NOT NULL,
    "person_id" BIGINT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article" (
    "id" BIGSERIAL NOT NULL,
    "url_original" TEXT NOT NULL,
    "url_normalized" TEXT NOT NULL,
    "source_domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_person" (
    "article_id" BIGINT NOT NULL,
    "person_id" BIGINT NOT NULL,

    CONSTRAINT "article_person_pkey" PRIMARY KEY ("article_id","person_id")
);

-- CreateTable
CREATE TABLE "summary" (
    "id" BIGSERIAL NOT NULL,
    "article_id" BIGINT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_job_run" (
    "id" BIGSERIAL NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "inserted" INTEGER DEFAULT 0,
    "deduped" INTEGER DEFAULT 0,
    "errors" INTEGER DEFAULT 0,

    CONSTRAINT "ingest_job_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institution_code_key" ON "institution"("code");

-- CreateIndex
CREATE UNIQUE INDEX "person_slug_key" ON "person"("slug");

-- CreateIndex
CREATE INDEX "person_institution_id_idx" ON "person"("institution_id");

-- CreateIndex
CREATE INDEX "alias_person_id_idx" ON "alias"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_url_normalized_key" ON "article"("url_normalized");

-- CreateIndex
CREATE INDEX "article_published_at_idx" ON "article"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "summary_article_id_key" ON "summary"("article_id");

-- CreateIndex
CREATE INDEX "ingest_job_run_started_at_idx" ON "ingest_job_run"("started_at");

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias" ADD CONSTRAINT "alias_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_person" ADD CONSTRAINT "article_person_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_person" ADD CONSTRAINT "article_person_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summary" ADD CONSTRAINT "summary_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

