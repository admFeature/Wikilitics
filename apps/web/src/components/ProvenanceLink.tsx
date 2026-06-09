import type { Provenance } from "@app/schema";

/** Lien sortant vers la source officielle + mention de licence (traçabilité). */
export function ProvenanceLink({ provenance }: { provenance: Provenance }) {
  const collected = formatDate(provenance.collectedAt);
  return (
    <span className="provenance">
      <a href={provenance.sourceUrl} target="_blank" rel="noopener noreferrer">
        Source : {provenance.source}
      </a>
      <span className="provenance__meta">
        {provenance.licence}
        {collected ? ` · collecté le ${collected}` : ""}
      </span>
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
}
