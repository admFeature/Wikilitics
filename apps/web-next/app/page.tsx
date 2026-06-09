"use client";

import { useState } from "react";
import { ModeBanner } from "@/components/ModeBanner";
import { DeputeFiche } from "@/components/DeputeFiche";
import { SearchBox } from "@/components/SearchBox";

export default function Page() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="app">
      <header className="app__top">
        <span className="eyebrow">Données publiques · sourcées</span>
        <h1>Agrégateur de données politiques</h1>
        <p className="lede">
          Recherchez une personnalité, consultez ses faits publics, chacun
          rattaché à sa source officielle. Aucune opinion, aucun score.
        </p>
        <ModeBanner />
      </header>

      <main>
        <SearchBox onSelect={setSelected} />

        {selected ? (
          <DeputeFiche uid={selected} onBack={() => setSelected(null)} />
        ) : (
          <p className="hint">
            Commencez à taper un nom : les suggestions apparaissent au fil de la
            frappe. Astuce : <kbd className="kbd">⌘K</kbd> pour aller à la recherche.
          </p>
        )}
      </main>

      <footer className="app__footer">
        Données publiques restituées brutes. Conformité par source : les
        déclarations de situation patrimoniale HATVP ne sont jamais republiées.
      </footer>
    </div>
  );
}
