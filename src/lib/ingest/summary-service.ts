import { getEnv, type AppEnv } from '../env';
import type { IngestLogger, SummaryInput, SummaryService } from './types';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface SummaryServiceOptions {
  fetch?: FetchFn;
  logger?: IngestLogger;
  env?: AppEnv;
  maxRetries?: number;
  requestTimeoutMs?: number;
}

interface OpenAITextContent {
  text?: { value?: string | null | undefined } | string | null | undefined;
}

interface OpenAIOutputItem {
  content?: OpenAITextContent[] | null | undefined;
}

interface OpenAIResponsePayload {
  output?: OpenAIOutputItem[] | null | undefined;
  output_text?: string | null | undefined;
}

const defaultLogger: IngestLogger = {
  info() {},
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

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 12_000;

export class SummaryServiceImpl implements SummaryService {
  private readonly fetchImpl: FetchFn;

  private readonly logger: IngestLogger;

  private readonly env: AppEnv;

  private readonly maxRetries: number;

  private readonly requestTimeoutMs: number;

  constructor(options: SummaryServiceOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.logger = options.logger ?? defaultLogger;
    this.env = options.env ?? getEnv();
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generateSummary(input: SummaryInput): Promise<string | null> {
    const payload = this.buildRequestPayload(input);
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const result = await this.sendRequest(payload);
        if (result) {
          return result;
        }
      } catch (error) {
        this.logger.error('ingest.summary.error', {
          code: 'SUMMARY_REQUEST_ERROR',
          attempt,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      attempt += 1;
    }

    this.logger.error('ingest.summary.max-retries', {
      code: 'SUMMARY_MAX_RETRIES',
      attempts: attempt,
      url: input.url,
    });
    return null;
  }

  private buildRequestPayload(input: SummaryInput): unknown {
    const people = input.persons
      .map(
        (person) =>
          `${person.nameEn} (${person.nameJp}, ${person.institutionCode})`,
      )
      .join(', ');

    const instruction = [
      '以下の金融ニュース記事を 3 文以内の日本語で要約してください。',
      '要点を中心に、市場への影響が明確になるように書いてください。',
      '人物名と機関名は正確に記載し、推測は避けてください。',
      `対象人物: ${people}`,
      `記事タイトル: ${input.title}`,
      `記事URL: ${input.url}`,
      '本文: ',
      input.content,
    ].join('\n');

    return {
      model: this.env.OPENAI_MODEL,
      input: instruction,
      max_output_tokens: 300,
      temperature: 0.2,
    };
  }

  private async sendRequest(body: unknown): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs).unref?.();

    try {
      const response = await this.fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.error('ingest.summary.http-error', {
          code: 'SUMMARY_HTTP_ERROR',
          status: response.status,
        });
        return null;
      }

      const data = (await response.json()) as OpenAIResponsePayload;
      return this.extractText(data);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private extractText(data: OpenAIResponsePayload): string | null {
    const outputs = Array.isArray(data?.output) ? data.output : [];
    for (const output of outputs) {
      const contents = Array.isArray(output?.content) ? output.content : [];
      for (const content of contents) {
        const baseText = content?.text;
        if (typeof baseText === 'string') {
          const trimmed = baseText.trim();
          if (trimmed.length > 0) {
            return trimmed;
          }
          continue;
        }

        const nestedValue = baseText?.value;
        if (typeof nestedValue === 'string') {
          const trimmed = nestedValue.trim();
          if (trimmed.length > 0) {
            return trimmed;
          }
        }
      }
    }
    if (typeof data?.output_text === 'string' && data.output_text.trim().length > 0) {
      return data.output_text.trim();
    }
    return null;
  }
}
