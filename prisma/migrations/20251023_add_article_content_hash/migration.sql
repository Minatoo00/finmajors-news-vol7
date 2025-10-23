ALTER TABLE "article"
ADD COLUMN "content_hash" VARCHAR(64);

CREATE UNIQUE INDEX "article_content_hash_key"
ON "article" ("content_hash")
WHERE "content_hash" IS NOT NULL;

