// BM25 (Okapi) en memoria: suficiente para un reglamento de unos pocos cientos de fragmentos.
export class Bm25Index {
  private tf: Map<string, number>[];
  private df = new Map<string, number>();
  private len: number[];
  private avgLen: number;

  constructor(
    docs: string[][],
    private k1 = 1.4,
    private b = 0.75
  ) {
    this.len = docs.map(d => d.length);
    this.avgLen = this.len.reduce((a, c) => a + c, 0) / Math.max(1, docs.length);
    this.tf = docs.map(tokens => {
      const m = new Map<string, number>();
      for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
      for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return m;
    });
  }

  search(query: string[], k: number): { index: number; score: number }[] {
    const n = this.tf.length;
    const scores = new Float64Array(n);
    for (const term of new Set(query)) {
      const df = this.df.get(term);
      if (!df) continue;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (let i = 0; i < n; i++) {
        const f = this.tf[i].get(term);
        if (!f) continue;
        scores[i] += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.len[i]) / this.avgLen));
      }
    }
    return Array.from(scores, (score, index) => ({ index, score }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
