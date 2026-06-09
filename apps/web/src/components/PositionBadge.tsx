import type { VotePosition } from "@app/schema";

/**
 * Pastille de position colorée selon les conventions de l'hémicycle :
 *  Pour = vert, Contre = rouge, Abstention = gris, Non votant = gris clair.
 */
const LABELS: Record<VotePosition, string> = {
  pour: "Pour",
  contre: "Contre",
  abstention: "Abstention",
  nonVotant: "Non votant",
};

export function PositionBadge({ position }: { position: VotePosition }) {
  return (
    <span className={`badge badge--${position}`} aria-label={`Position : ${LABELS[position]}`}>
      {LABELS[position]}
    </span>
  );
}
