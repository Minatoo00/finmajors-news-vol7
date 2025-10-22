export interface Institution {
  id: bigint;
  code: string;
  nameJp: string;
  nameEn: string;
}

export interface Person {
  id: bigint;
  institutionId: bigint;
  slug: string;
  nameJp: string;
  nameEn: string;
  role: string;
  active: boolean;
}

export interface Alias {
  id: bigint;
  personId: bigint;
  text: string;
}

export interface ArticleSummary {
  id: bigint;
  articleId: bigint;
  text: string;
  createdAt: Date;
}

export interface Article {
  id: bigint;
  urlOriginal: string;
  urlNormalized: string;
  sourceDomain: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  publishedAt?: Date | null;
  fetchedAt: Date;
  createdAt: Date;
  summary?: ArticleSummary | null;
}

export interface ArticlePersonLink {
  articleId: bigint;
  personId: bigint;
}

export interface IngestJobRunStats {
  id: bigint;
  startedAt: Date;
  finishedAt?: Date | null;
  inserted: number;
  deduped: number;
  errors: number;
}
