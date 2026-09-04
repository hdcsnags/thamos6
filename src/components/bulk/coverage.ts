import { getSourceDisplayName } from '../../lib/threatIntel';
import type { BulkIPResult } from '../../types';

export interface BatchCoverage {
  /** Percentage of provider calls across the batch that returned without error. */
  coverage: number;
  providers: number;
  /** Display names of providers that errored for every IP in the batch. */
  fullyFailed: string[];
}

/** Coverage summary shared by the Evidence matrix and the Batch Report. Returns null when the batch predates per-source status. */
export function summarizeCoverage(results: BulkIPResult[]): BatchCoverage | null {
  const withStatus = results.filter(r => r.sourceStatus && Object.keys(r.sourceStatus).length > 0);
  if (withStatus.length === 0) return null;
  const providers = new Set<string>();
  const errors = new Map<string, number>();
  let ok = 0;
  let total = 0;
  for (const r of withStatus) {
    for (const [src, st] of Object.entries(r.sourceStatus!)) {
      providers.add(src);
      total++;
      if (st.ok) ok++;
      else errors.set(src, (errors.get(src) ?? 0) + 1);
    }
  }
  return {
    coverage: total ? Math.round((ok / total) * 100) : 0,
    providers: providers.size,
    fullyFailed: [...errors.entries()].filter(([, n]) => n === withStatus.length).map(([s]) => getSourceDisplayName(s)),
  };
}
