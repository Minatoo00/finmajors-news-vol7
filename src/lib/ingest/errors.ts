export interface IngestErrorOptions extends ErrorOptions {
  details?: Record<string, unknown>;
}

export class IngestError extends Error {
  readonly code: string;

  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, options: IngestErrorOptions = {}) {
    const { details, ...errorOptions } = options;
    super(message, errorOptions);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details ?? {};
  }
}

export class SummaryGenerationError extends IngestError {
  constructor(message: string, options: IngestErrorOptions = {}) {
    super('SUMMARY_GENERATION_FAILED', message, options);
  }
}

export class RssFetchError extends IngestError {
  constructor(message: string, options: IngestErrorOptions = {}) {
    super('RSS_FETCH_FAILED', message, options);
  }
}
