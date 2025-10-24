import cron, { type ScheduledTask } from 'node-cron';
import type { IngestLogger, IngestResult } from './types';

const defaultLogger: IngestLogger = {
  info(message, meta) {
    console.log(
      JSON.stringify({
        level: 'info',
        message,
        ...formatMeta(meta),
      }),
    );
  },
  error(message, meta) {
    console.error(
      JSON.stringify({
        level: 'error',
        message,
        ...formatMeta(meta),
      }),
    );
  },
};

function formatMeta(meta?: Record<string, unknown>) {
  if (!meta) {
    return {};
  }
  return { meta };
}

type ScheduleFn = (
  expression: string,
  callback: () => void,
) => ScheduledTask;

interface IngestSchedulerOptions {
  enableInternalCron: boolean;
  cronExpression: string;
  jobRunner: () => Promise<IngestResult | void>;
  scheduleFn?: ScheduleFn;
  logger?: IngestLogger;
}

export class IngestScheduler {
  private readonly enableInternalCron: boolean;

  private readonly cronExpression: string;

  private readonly jobRunner: () => Promise<IngestResult | void>;

  private readonly scheduleFn: ScheduleFn;

  private readonly logger: IngestLogger;

  private task: ScheduledTask | null = null;

  constructor(options: IngestSchedulerOptions) {
    this.enableInternalCron = options.enableInternalCron;
    this.cronExpression = options.cronExpression;
    this.jobRunner = options.jobRunner;
    this.scheduleFn = options.scheduleFn ?? cron.schedule;
    this.logger = options.logger ?? defaultLogger;
  }

  start(): ScheduledTask | null {
    if (!this.enableInternalCron) {
      return null;
    }
    if (this.task) {
      return this.task;
    }
    this.task = this.scheduleFn(this.cronExpression, () => {
      void this.handleTrigger();
    });
    this.task.start();
    return this.task;
  }

  stop(): void {
    if (!this.task) {
      return;
    }
    this.task.stop();
    this.task = null;
  }

  async runOnce(): Promise<IngestResult | void> {
    return this.handleTrigger();
  }

  private async handleTrigger(): Promise<IngestResult | void> {
    try {
      const result = await this.jobRunner();
      if (result) {
        this.logger.info('ingest.run.complete', {
          jobId: result.jobId.toString(),
          inserted: result.stats.inserted,
          deduped: result.stats.deduped,
          errors: result.stats.errors,
          skipped: result.stats.skipped,
          fetched: result.stats.fetched,
        });
      }
      return result;
    } catch (error) {
      this.logger.error('ingest.run.failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
