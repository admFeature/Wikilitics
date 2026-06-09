"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAbout } from "@/lib/api";

/** Statut compact du mode courant (live / démo), détail en infobulle. */
export function ModeBanner() {
  const { data, isError } = useQuery({ queryKey: ["about"], queryFn: fetchAbout });

  if (isError || !data) {
    return (
      <div className="banner banner--demo" role="status">
        <span className="banner__dot" />
        <span className="banner__text">Serveur injoignable</span>
      </div>
    );
  }

  return (
    <div
      className={`banner ${data.live ? "banner--live" : "banner--demo"}`}
      role="status"
      title={data.note}
    >
      <span className="banner__dot" />
      <span className="banner__text">
        <strong>{data.live ? "Live" : "Démo"}</strong> · {data.base}
      </span>
    </div>
  );
}
