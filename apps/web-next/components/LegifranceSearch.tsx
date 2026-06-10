"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchLegifrance } from "@/lib/api";
import { useDebounce } from "@/lib/useDebounce";
import { ErrorBox } from "@/components/ErrorBox";

/** Recherche de textes de loi (Légifrance) — séparée de la recherche de personnes. */
export function LegifranceSearch() {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term.trim(), 350);

  const q = useQuery({
    queryKey: ["legifrance", debounced],
    queryFn: () => searchLegifrance(debounced),
    enabled: debounced.length >= 3,
  });

  return (
    <section className="lf" aria-labelledby="lf-title">
      <h3 className="section-title" id="lf-title">Textes de loi · Légifrance</h3>
      <div className="combobox__field">
        <input
          type="search"
          className="lf-input"
          placeholder="Rechercher une loi, un décret… (ex. : transition énergétique)"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoComplete="off"
        />
        {q.isFetching && debounced.length >= 3 && <span className="combobox__spinner" aria-label="Chargement" />}
      </div>

      {q.isError && <ErrorBox error={q.error} />}
      {q.data && q.data.length === 0 && debounced.length >= 3 && !q.isFetching && (
        <p className="muted lf-empty">Aucun texte trouvé pour « {debounced} ».</p>
      )}

      <ul className="lf-list">
        {q.data?.map((t) => (
          <li key={t.id} className="lf-item">
            <a href={t.url} target="_blank" rel="noopener noreferrer" className="lf-link">
              {t.titre}
            </a>
            <span className="lf-meta">
              {[t.nature, t.date, t.etat].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
