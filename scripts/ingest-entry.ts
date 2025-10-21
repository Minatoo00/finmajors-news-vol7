import { main } from './ingest';

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'ingest.run.failure',
      meta: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }),
  );
  process.exitCode = 1;
});
