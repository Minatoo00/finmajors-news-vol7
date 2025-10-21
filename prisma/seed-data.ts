export interface InstitutionSeed {
  code: string;
  nameJp: string;
  nameEn: string;
}

export interface PersonSeed {
  institutionCode: string;
  slug: string;
  nameJp: string;
  nameEn: string;
  role: string;
  active?: boolean;
}

export interface AliasSeed {
  personSlug: string;
  texts: string[];
}

export const institutions: InstitutionSeed[] = [
  { code: 'FRB', nameJp: '米連邦準備制度理事会', nameEn: 'Federal Reserve Board' },
  { code: 'ECB', nameJp: '欧州中央銀行', nameEn: 'European Central Bank' },
  { code: 'BOJ', nameJp: '日本銀行', nameEn: 'Bank of Japan' },
  { code: 'BoE', nameJp: 'イングランド銀行', nameEn: 'Bank of England' },
  { code: 'SNB', nameJp: 'スイス国立銀行', nameEn: 'Swiss National Bank' },
];

export const persons: PersonSeed[] = [
  { institutionCode: 'FRB', slug: 'jerome-h-powell', nameJp: 'ジェローム・パウエル', nameEn: 'Jerome H. Powell', role: '議長' },
  { institutionCode: 'FRB', slug: 'philip-n-jefferson', nameJp: 'フィリップ・ジェファーソン', nameEn: 'Philip N. Jefferson', role: '副議長' },
  { institutionCode: 'FRB', slug: 'michael-s-barr', nameJp: 'マイケル・バー', nameEn: 'Michael S. Barr', role: '副議長（銀行監督担当）' },
  { institutionCode: 'FRB', slug: 'michelle-w-bowman', nameJp: 'ミシェル・ボウマン', nameEn: 'Michelle W. Bowman', role: '理事' },
  { institutionCode: 'FRB', slug: 'christopher-j-waller', nameJp: 'クリストファー・ウォーラー', nameEn: 'Christopher J. Waller', role: '理事' },
  { institutionCode: 'FRB', slug: 'lisa-d-cook', nameJp: 'リサ・クック', nameEn: 'Lisa D. Cook', role: '理事' },
  { institutionCode: 'FRB', slug: 'adriana-d-kugler', nameJp: 'アドリアナ・クーグラー', nameEn: 'Adriana D. Kugler', role: '理事' },
  { institutionCode: 'ECB', slug: 'christine-lagarde', nameJp: 'クリスティーヌ・ラガルド', nameEn: 'Christine Lagarde', role: '総裁' },
  { institutionCode: 'ECB', slug: 'luis-de-guindos', nameJp: 'ルイス・デ・ギンドス', nameEn: 'Luis de Guindos', role: '副総裁' },
  { institutionCode: 'ECB', slug: 'philip-r-lane', nameJp: 'フィリップ・レーン', nameEn: 'Philip R. Lane', role: '理事' },
  { institutionCode: 'ECB', slug: 'isabel-schnabel', nameJp: 'イザベル・シュナーベル', nameEn: 'Isabel Schnabel', role: '理事' },
  { institutionCode: 'ECB', slug: 'piero-cipollone', nameJp: 'ピエロ・チポローネ', nameEn: 'Piero Cipollone', role: '理事' },
  { institutionCode: 'ECB', slug: 'frank-elderson', nameJp: 'フランク・エルダーソン', nameEn: 'Frank Elderson', role: '理事' },
  { institutionCode: 'BOJ', slug: 'kazuo-ueda', nameJp: '植田 和男', nameEn: 'Kazuo Ueda', role: '総裁' },
  { institutionCode: 'BOJ', slug: 'ryozo-himino', nameJp: '氷見野 良三', nameEn: 'Ryozo Himino', role: '副総裁' },
  { institutionCode: 'BOJ', slug: 'shinichi-uchida', nameJp: '内田 真一', nameEn: 'Shinichi Uchida', role: '副総裁' },
  { institutionCode: 'BOJ', slug: 'asahi-noguchi', nameJp: '野口 旭', nameEn: 'Asahi Noguchi', role: '審議委員' },
  { institutionCode: 'BOJ', slug: 'junko-nakagawa', nameJp: '中川 順子', nameEn: 'Junko Nakagawa', role: '審議委員' },
  { institutionCode: 'BOJ', slug: 'hajime-takata', nameJp: '高田 創', nameEn: 'Hajime Takata', role: '審議委員' },
  { institutionCode: 'BOJ', slug: 'naoki-tamura', nameJp: '田村 直樹', nameEn: 'Naoki Tamura', role: '審議委員' },
  { institutionCode: 'BOJ', slug: 'junko-koeda', nameJp: '小枝 淳子', nameEn: 'Junko Koeda', role: '審議委員' },
  { institutionCode: 'BOJ', slug: 'kazuyuki-masu', nameJp: '増 和幸', nameEn: 'Kazuyuki Masu', role: '審議委員' },
  { institutionCode: 'BoE', slug: 'andrew-bailey', nameJp: 'アンドリュー・ベイリー', nameEn: 'Andrew Bailey', role: '総裁' },
  { institutionCode: 'BoE', slug: 'sarah-breeden', nameJp: 'サラ・ブリーデン', nameEn: 'Sarah Breeden', role: '副総裁' },
  { institutionCode: 'BoE', slug: 'ben-broadbent', nameJp: 'ベン・ブロードベント', nameEn: 'Ben Broadbent', role: '副総裁' },
  { institutionCode: 'BoE', slug: 'dave-ramsden', nameJp: 'デイブ・ラムスデン', nameEn: 'Dave Ramsden', role: '副総裁' },
  { institutionCode: 'BoE', slug: 'huw-pill', nameJp: 'ヒュー・ピル', nameEn: 'Huw Pill', role: 'チーフエコノミスト' },
  { institutionCode: 'BoE', slug: 'jonathan-haskel', nameJp: 'ジョナサン・ハスケル', nameEn: 'Jonathan Haskel', role: 'MPC外部委員' },
  { institutionCode: 'BoE', slug: 'catherine-l-mann', nameJp: 'キャサリン・マン', nameEn: 'Catherine L. Mann', role: 'MPC外部委員' },
  { institutionCode: 'BoE', slug: 'megan-greene', nameJp: 'メーガン・グリーン', nameEn: 'Megan Greene', role: 'MPC外部委員' },
  { institutionCode: 'BoE', slug: 'clare-lombardelli', nameJp: 'クレア・ロンバルデッリ', nameEn: 'Clare Lombardelli', role: 'MPC外部委員' },
  { institutionCode: 'SNB', slug: 'martin-schlegel', nameJp: 'マーティン・シュレーゲル', nameEn: 'Martin Schlegel', role: '総裁' },
  { institutionCode: 'SNB', slug: 'antoine-martin', nameJp: 'アントワーヌ・マルタン', nameEn: 'Antoine Martin', role: '副総裁' },
  { institutionCode: 'SNB', slug: 'petra-tschudin', nameJp: 'ペトラ・チュディン', nameEn: 'Petra Tschudin', role: '理事' },
];

export const aliases: AliasSeed[] = [
  { personSlug: 'jerome-h-powell', texts: ['Jerome H. Powell', 'Jerome H Powell', 'Jerome Powell', 'ジェローム・パウエル', 'ジェローム パウエル', 'パウエル議長', 'FRB議長'] },
  { personSlug: 'philip-n-jefferson', texts: ['Philip N. Jefferson', 'Philip N Jefferson', 'Philip Jefferson', 'フィリップ・ジェファーソン', 'フィリップ ジェファーソン', 'ジェファーソン副議長'] },
  { personSlug: 'michael-s-barr', texts: ['Michael S. Barr', 'Michael S Barr', 'Michael Barr', 'マイケル・バー', 'マイケル バー', 'バー副議長'] },
  { personSlug: 'michelle-w-bowman', texts: ['Michelle W. Bowman', 'Michelle W Bowman', 'Michelle Bowman', 'ミシェル・ボウマン', 'ミシェル ボウマン', 'ボウマン理事'] },
  { personSlug: 'christopher-j-waller', texts: ['Christopher J. Waller', 'Christopher J Waller', 'Christopher Waller', 'クリストファー・ウォーラー', 'クリストファー ウォーラー', 'FRB理事'] },
  { personSlug: 'lisa-d-cook', texts: ['Lisa D. Cook', 'Lisa D Cook', 'Lisa Cook', 'リサ・クック', 'リサ クック', 'FRB理事'] },
  { personSlug: 'adriana-d-kugler', texts: ['Adriana D. Kugler', 'Adriana D Kugler', 'Adriana Kugler', 'アドリアナ・クーグラー', 'アドリアナ クーグラー', 'FRB理事'] },
  { personSlug: 'christine-lagarde', texts: ['Christine Lagarde', 'クリスティーヌ・ラガルド', 'クリスティーヌ ラガルド', 'ラガルド総裁', 'ECB総裁'] },
  { personSlug: 'luis-de-guindos', texts: ['Luis de Guindos', 'ルイス・デ・ギンドス', 'ルイス デ ギンドス', 'デ・ギンドス副総裁', 'ECB副総裁'] },
  { personSlug: 'philip-r-lane', texts: ['Philip R. Lane', 'Philip R Lane', 'Philip Lane', 'フィリップ・レーン', 'フィリップ レーン', 'レーン理事', 'ECB理事'] },
  { personSlug: 'isabel-schnabel', texts: ['Isabel Schnabel', 'イザベル・シュナーベル', 'イザベル シュナーベル', 'シュナーベル理事', 'ECB理事'] },
  { personSlug: 'piero-cipollone', texts: ['Piero Cipollone', 'ピエロ・チポローネ', 'ピエロ チポローネ', 'チポローネ理事', 'ECB理事'] },
  { personSlug: 'frank-elderson', texts: ['Frank Elderson', 'フランク・エルダーソン', 'フランク エルダーソン', 'エルダーソン理事', 'ECB理事'] },
  { personSlug: 'kazuo-ueda', texts: ['Kazuo Ueda', '植田和男', '植田 和男', '植田総裁', '日銀総裁', '日本銀行総裁'] },
  { personSlug: 'ryozo-himino', texts: ['Ryozo Himino', '氷見野良三', '氷見野 良三', '氷見野副総裁', '日銀副総裁', 'BOJ副総裁'] },
  { personSlug: 'shinichi-uchida', texts: ['Shinichi Uchida', '内田真一', '内田 真一', '内田副総裁', '日銀副総裁', 'BOJ副総裁'] },
  { personSlug: 'asahi-noguchi', texts: ['Asahi Noguchi', '野口旭', '野口 旭', '野口審議委員', '日銀審議委員', 'BOJ審議委員'] },
  { personSlug: 'junko-nakagawa', texts: ['Junko Nakagawa', '中川順子', '中川 順子', '中川審議委員', '日銀審議委員', 'BOJ審議委員'] },
  { personSlug: 'hajime-takata', texts: ['Hajime Takata', '高田創', '高田 創', '高田審議委員', '日銀審議委員', 'BOJ審議委員'] },
  { personSlug: 'naoki-tamura', texts: ['Naoki Tamura', '田村直樹', '田村 直樹', '田村審議委員', '日銀審議委員', 'BOJ審議委員'] },
  { personSlug: 'junko-koeda', texts: ['Junko Koeda', '小枝淳子', '小枝 淳子', '小枝審議委員', '日銀審議委員', 'BOJ審議委員'] },
  { personSlug: 'kazuyuki-masu', texts: ['Kazuyuki Masu', '増和幸', '増 和幸', '増審議委員', '日銀審議委員', 'BOJ審議委員'] },
  { personSlug: 'andrew-bailey', texts: ['Andrew Bailey', 'アンドリュー・ベイリー', 'アンドリュー ベイリー', 'ベイリー総裁', 'BoE総裁', '英中銀総裁'] },
  { personSlug: 'sarah-breeden', texts: ['Sarah Breeden', 'サラ・ブリーデン', 'サラ ブリーデン', 'ブリーデン副総裁', 'BoE副総裁', '金融安定担当副総裁'] },
  { personSlug: 'ben-broadbent', texts: ['Ben Broadbent', 'ベン・ブロードベント', 'ベン ブロードベント', 'ブロードベント副総裁', 'BoE副総裁', '金融政策担当副総裁'] },
  { personSlug: 'dave-ramsden', texts: ['Dave Ramsden', 'デイブ・ラムスデン', 'デイブ ラムスデン', 'ラムスデン副総裁', 'BoE副総裁', '市場・銀行担当副総裁'] },
  { personSlug: 'huw-pill', texts: ['Huw Pill', 'ヒュー・ピル', 'ヒュー ピル', 'ピル チーフエコノミスト', 'BoEチーフエコノミスト'] },
  { personSlug: 'jonathan-haskel', texts: ['Jonathan Haskel', 'ジョナサン・ハスケル', 'ジョナサン ハスケル', 'ハスケル外部委員', 'MPC外部委員'] },
  { personSlug: 'catherine-l-mann', texts: ['Catherine L. Mann', 'Catherine L Mann', 'Catherine Mann', 'キャサリン・マン', 'キャサリン マン', 'マン外部委員', 'MPC外部委員'] },
  { personSlug: 'megan-greene', texts: ['Megan Greene', 'メーガン・グリーン', 'メーガン グリーン', 'グリーン外部委員', 'MPC外部委員'] },
  { personSlug: 'clare-lombardelli', texts: ['Clare Lombardelli', 'クレア・ロンバルデッリ', 'クレア ロンバルデッリ', 'ロンバルデッリ外部委員', 'MPC外部委員'] },
  { personSlug: 'martin-schlegel', texts: ['Martin Schlegel', 'マーティン・シュレーゲル', 'マーティン シュレーゲル', 'シュレーゲル総裁', 'SNB総裁'] },
  { personSlug: 'antoine-martin', texts: ['Antoine Martin', 'アントワーヌ・マルタン', 'アントワーヌ マルタン', 'マルタン副総裁', 'SNB副総裁'] },
  { personSlug: 'petra-tschudin', texts: ['Petra Tschudin', 'ペトラ・チュディン', 'ペトラ チュディン', 'チュディン理事', 'SNB理事'] },
];

