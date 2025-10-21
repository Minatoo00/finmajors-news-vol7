const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');

test('Prisma schema file exists', () => {
  const exists = fs.existsSync(schemaPath);
  assert.ok(exists, 'prisma/schema.prisma が存在する必要があります');
});

test('Prisma schema defines required models', () => {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const requiredModels = [
    'Institution',
    'Person',
    'Alias',
    'Article',
    'ArticlePerson',
    'Summary',
    'IngestJobRun',
  ];

  for (const model of requiredModels) {
    const pattern = new RegExp(`model\\s+${model}\\s+\\{`, 'm');
    assert.match(
      schema,
      pattern,
      `Prisma schema に model ${model} の定義が必要です`,
    );
  }
});

test('Prisma schema configures datasource and generator', () => {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  assert.match(schema, /datasource\s+db\s+\{[\s\S]*?provider\s*=\s*"postgresql"/, 'PostgreSQL 用 datasource が必要です');
  assert.match(schema, /generator\s+client\s+\{[\s\S]*?provider\s*=\s*"prisma-client-js"/, 'Prisma Client generator が必要です');
});
