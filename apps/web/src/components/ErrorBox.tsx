import { ApiError } from "../api.js";

/** Affiche une erreur LISIBLE — jamais d'écran muet. */
export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const detail = error instanceof ApiError ? error.detail : undefined;
  return (
    <div className="errorbox" role="alert">
      <strong>Une erreur est survenue.</strong>
      <p>{message}</p>
      {detail && <pre className="errorbox__detail">{detail}</pre>}
    </div>
  );
}
