import { useEffect, useRef, useState, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { search } from "../api.js";
import { useDebounce } from "../useDebounce.js";
import { ErrorBox } from "./ErrorBox.js";

/**
 * Barre de recherche en autocomplétion (combobox accessible).
 * États : repos / saisie / chargement (skeleton) / vide (explicite) / erreur.
 * Raccourci ⌘K (Ctrl+K) pour focus. Motion = état uniquement.
 */
export function SearchBox({ onSelect }: { onSelect: (uid: string) => void }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounced = useDebounce(term.trim(), 220);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Raccourci clavier ⌘K / Ctrl+K → focus (action clavier : pas d'animation).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const suggestions = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => search(debounced),
    enabled: debounced.length >= 2,
  });

  const items = suggestions.data ?? [];
  const showDropdown = open && debounced.length >= 2;
  const loadingFirst = suggestions.isFetching && items.length === 0;

  function choose(index: number) {
    const hit = items[index];
    if (!hit) return;
    setTerm(hit.label);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(hit.uid);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      choose(activeIndex);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="combobox" role="search">
      <label htmlFor="q" className="sr-only">Rechercher une personnalité</label>
      <div className="combobox__field">
        <span className="combobox__icon" aria-hidden>
          <SearchIcon />
        </span>
        <input
          id="q"
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder="Rechercher une personnalité…"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); setActiveIndex(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {suggestions.isFetching && debounced.length >= 2 ? (
          <span className="combobox__spinner" aria-label="Chargement" />
        ) : term === "" ? (
          <kbd className="kbd" aria-hidden>⌘K</kbd>
        ) : null}
      </div>

      {showDropdown && (
        <ul className="combobox__list" id={listId} role="listbox">
          {suggestions.isError && (
            <li className="combobox__msg"><ErrorBox error={suggestions.error} /></li>
          )}
          {loadingFirst &&
            [0, 1, 2].map((i) => (
              <li key={i} className="sk-row" aria-hidden>
                <span className="skeleton" style={{ height: 13, width: "55%" }} />
                <span className="skeleton" style={{ height: 11, width: "35%" }} />
              </li>
            ))}
          {!suggestions.isError && !suggestions.isFetching && items.length === 0 && (
            <li className="combobox__msg muted">
              Aucune personnalité ne correspond à « {debounced} ». Vérifiez l'orthographe.
            </li>
          )}
          {items.map((hit, i) => (
            <li
              key={hit.uid}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`combobox__opt${i === activeIndex ? " is-active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); choose(i); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="combobox__opt-text">
                <span className="combobox__label">{hit.label}</span>
                {hit.sublabel && <span className="combobox__sub">{hit.sublabel}</span>}
              </span>
              <span className="combobox__arrow" aria-hidden>→</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}
