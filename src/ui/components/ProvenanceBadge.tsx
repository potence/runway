import type { FactorEvidence, Provenance, ProvenanceKind } from '../../domain/types';

interface ProvenanceBadgeProps {
  kind: ProvenanceKind | FactorEvidence;
  basis?: string;
  labelOverride?: string;
}

const DEFAULT_BASIS: Record<ProvenanceKind | FactorEvidence, string> = {
  Observed: 'Direct POS export field after row cleaning.',
  Derived: 'Observed POS timestamps combined with owner-controlled Assumed offsets.',
  Modeled: 'Deterministic counterfactual simulation or baseline model output under stated assumptions.',
  Assumed: 'Explicit owner-controlled or default assumption; never inferred from POS data.',
  Learned: 'Derived from matched historical observations with support counts.',
  FlagOnly: 'Context flag only (1.00x neutral multiplier); no effect size estimated.',
};

export function ProvenanceBadge({ kind, basis, labelOverride }: ProvenanceBadgeProps) {
  const tooltip = basis || DEFAULT_BASIS[kind];
  const displayLabel =
    labelOverride ?? (kind === 'FlagOnly' ? 'Flag-only (1.00x)' : kind);

  return (
    <span className="prov-badge" title={tooltip}>
      {displayLabel}
    </span>
  );
}

export function ProvenanceFromObj({ provenance }: { provenance: Provenance }) {
  return <ProvenanceBadge kind={provenance.kind} basis={provenance.basis} />;
}
