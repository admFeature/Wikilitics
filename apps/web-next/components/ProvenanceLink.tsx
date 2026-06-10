import type { Provenance } from "@app/schema";

/**
 * Provenance DISCRÈTE : un petit lien vers la source ; licence + date de
 * collecte en infobulle (traçabilité conservée, sans bruit visuel).
 */
export function ProvenanceLink({ provenance }: { provenance: Provenance }) {
  const collected = formatDate(provenance.collectedAt);
  const title = `${provenance.licence}${collected ? ` · collecté le ${collected}` : ""}`;
  return (
    <a
      className="src"
      href={provenance.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
    >
      {provenance.source}
      <span aria-hidden>↗</span>
    </a>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
}
