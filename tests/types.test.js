const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', 'src', 'lib');

test('Domain types are defined', () => {
  const domainPath = path.join(repoRoot, 'types', 'domain.ts');
  assert.ok(fs.existsSync(domainPath), 'src/lib/types/domain.ts が必要です');
  const content = fs.readFileSync(domainPath, 'utf8');
  for (const typeName of ['Institution', 'Person', 'Alias', 'Article', 'ArticleSummary', 'IngestJobRunStats']) {
    const pattern = new RegExp(`export\\s+(interface|type)\\s+${typeName}\\b`);
    assert.match(content, pattern, `${typeName} 型をエクスポートしてください`);
  }
});

test('API response DTOs are defined', () => {
  const apiPath = path.join(repoRoot, 'types', 'api.ts');
  assert.ok(fs.existsSync(apiPath), 'src/lib/types/api.ts が必要です');
  const content = fs.readFileSync(apiPath, 'utf8');
  for (const typeName of ['PersonsResponse', 'ArticlesListResponse', 'ArticleDetailResponse', 'ArticlesListQuery']) {
    const pattern = new RegExp(`export\\s+(interface|type)\\s+${typeName}\\b`);
    assert.match(content, pattern, `${typeName} 型をエクスポートしてください`);
  }
});

test('Environment schema is validated with Zod', () => {
  const envPath = path.join(repoRoot, 'env.ts');
  assert.ok(fs.existsSync(envPath), 'src/lib/env.ts が必要です');
  const content = fs.readFileSync(envPath, 'utf8');
  assert.match(content, /z\.object\(/, 'Zod のスキーマ定義が必要です');
  for (const key of ['DATABASE_URL', 'OPENAI_API_KEY', 'ENABLE_INTERNAL_CRON', 'INGEST_CRON']) {
    assert.match(content, new RegExp(key), `${key} を env スキーマに含めてください`);
  }
});
