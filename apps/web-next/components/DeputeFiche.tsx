"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDepute, fetchVotes, fetchDiscours } from "@/lib/api";
import { ErrorBox } from "@/components/ErrorBox";
import { PositionBadge } from "@/components/PositionBadge";
import { ProvenanceLink } from "@/components/ProvenanceLink";

/** Fiche d'une personnalité : identité + votes + discours. */
export function DeputeFiche({ uid, onBack }: { uid: string; onBack: () => void }) {
  const depute = useQuery({ queryKey: ["depute", uid], queryFn: () => fetchDepute(uid) });
  const votes = useQuery({ queryKey: ["votes", uid], queryFn: () => fetchVotes(uid, 8) });
  const discours = useQuery({ queryKey: ["discours", uid], queryFn: () => fetchDiscours(uid, 6) });

  return (
    <article className="fiche">
      <button type="button" className="backlink" onClick={onBack}>
        <span aria-hidden>←</span> Recherche
      </button>

      {depute.isLoading && (
        <div className="fiche__header" aria-hidden>
          <span className="skeleton" style={{ height: 22, width: "45%", display: "block", marginBottom: 12 }} />
          <span className="skeleton" style={{ height: 14, width: "60%", display: "block" }} />
        </div>
      )}
      {depute.isError && <ErrorBox error={depute.error} />}

      {depute.data && (
        <header className="fiche__header">
          <h2 className="fiche__name">{depute.data.prenom} {depute.data.nom}</h2>
          <div className="fiche__meta">
            <span className="chip">{depute.data.groupe ?? depute.data.groupeAbbr ?? "Groupe non renseigné"}</span>
            {depute.data.membreGouvernement && (
              <span className="chip chip--accent">
                {depute.data.roleGouvernement ?? "Membre du Gouvernement"}
              </span>
            )}
            {depute.data.circonscription && (
              <span className="chip chip--muted">{depute.data.circonscription}</span>
            )}
            {depute.data.profession && (
              <span className="chip chip--muted">{depute.data.profession}</span>
            )}
            {depute.data.dateNaissance && (
              <span className="chip chip--muted">
                Naissance&nbsp;: {depute.data.dateNaissance}
                {depute.data.lieuNaissance ? ` à ${depute.data.lieuNaissance}` : ""}
              </span>
            )}
          </div>
          <ProvenanceLink provenance={depute.data.provenance} />
        </header>
      )}

      {depute.data?.declarationInteretsUrl && (
        <section className="transparence" aria-labelledby="transp-title">
          <h3 className="section-title" id="transp-title">Transparence</h3>
          <a
            className="decl-link"
            href={depute.data.declarationInteretsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Déclaration d&apos;intérêts (HATVP) <span aria-hidden>↗</span>
          </a>
          <p className="muted decl-note">
            Lien vers la déclaration officielle d&apos;intérêts. Conformément à la
            loi, la situation patrimoniale n&apos;est jamais republiée.
          </p>
        </section>
      )}

      <section aria-labelledby="votes-title">
        <h3 className="section-title" id="votes-title">
          Derniers votes
          {votes.data && votes.data.length > 0 && <span className="count">{votes.data.length}</span>}
        </h3>

        {votes.isLoading && (
          <div className="votes" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="vote">
                <span className="skeleton" style={{ height: 24, width: 92, borderRadius: 999 }} />
                <span className="vote__body">
                  <span className="skeleton" style={{ height: 14, width: "80%", display: "block", marginBottom: 8 }} />
                  <span className="skeleton" style={{ height: 11, width: "40%", display: "block" }} />
                </span>
              </div>
            ))}
          </div>
        )}
        {votes.isError && <ErrorBox error={votes.error} />}
        {votes.data && votes.data.length === 0 && (
          <p className="muted">
            Aucun vote nominatif disponible pour cette personne via les sources
            actuelles (députés : open data Assemblée ; sénateurs et ministres non
            couverts pour les votes).
          </p>
        )}

        <ul className="votes">
          {votes.data?.map((v) => (
            <li key={v.scrutin.uid} className="vote">
              <PositionBadge position={v.position} />
              <div className="vote__body">
                <p className="vote__titre">{v.scrutin.titre}</p>
                <p className="vote__meta">
                  {v.scrutin.date ?? "date inconnue"}
                  {v.scrutin.resultat ? ` · ${v.scrutin.resultat}` : ""}
                </p>
                <ProvenanceLink provenance={v.provenance} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {discours.data && discours.data.length > 0 && (
        <section className="discours" aria-labelledby="disc-title">
          <h3 className="section-title" id="disc-title">
            Discours récents <span className="count">{discours.data.length}</span>
          </h3>
          <ul className="disc-list">
            {discours.data.map((d) => (
              <li key={d.url} className="disc-item">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="disc-link">
                  {d.titre}
                </a>
                <span className="disc-meta">
                  {d.date ?? ""} · <ProvenanceLink provenance={d.provenance} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
