import type { VotePosition } from "@app/schema";

/** Pastille de position (conventions de l'hémicycle). */
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
