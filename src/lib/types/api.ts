import type { Article, ArticleSummary, Person } from './domain';

export interface InstitutionInfo {
  code: string;
  nameJp: string;
  nameEn: string;
}

export interface PersonResponseItem {
  slug: string;
  nameJp: string;
  nameEn: string;
  institution: InstitutionInfo;
  role: string;
  active: boolean;
}

export interface PersonsResponse {
  items: PersonResponseItem[];
  updatedAt: string;
}

export interface ArticlesListQuery {
  person?: string;
  from?: string;
  to?: string;
  media?: string;
  cursor?: string;
  limit?: number;
}

export interface ArticleListPerson {
  slug: string;
  nameJp: string;
  nameEn: string;
  institution: InstitutionInfo;
}

export interface ArticleListItem {
  id: bigint;
  title: string;
  url: string;
  sourceDomain: string;
  imageUrl?: string | null;
  publishedAt?: string | null;
  summary: Pick<ArticleSummary, 'text'>;
  persons: ArticleListPerson[];
}

export interface ArticlesListResponse {
  items: ArticleListItem[];
  nextCursor?: string | null;
}

export interface ArticleSummaryDetail {
  text: string;
  createdAt?: string;
}

export interface ArticleDetailResponse {
  id: bigint;
  title: string;
  url: string;
  sourceDomain: string;
  imageUrl?: string | null;
  publishedAt?: string | null;
  summary: ArticleSummaryDetail | null;
  persons: PersonResponseItem[];
}

export interface IngestJobLogEntry {
  jobId: bigint;
  startedAt: string;
  finishedAt?: string | null;
  inserted: number;
  deduped: number;
  errors: number;
}

export type ArticleWithRelations = Article & {
  summary?: ArticleSummary | null;
  persons?: Person[];
};
