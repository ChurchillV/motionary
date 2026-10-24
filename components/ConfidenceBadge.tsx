import { Info } from "./Icons";

/** high = nothing, medium = subtle note, low = amber "Unverified translation". */
export function ConfidenceBadge({ confidence }: { confidence: "low" | "medium" | "high" }) {
  if (confidence === "high") return null;
  if (confidence === "medium") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-2 shadow-soft">
        <Info /> Probably right
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-tint px-2.5 py-1.5 text-[12.5px] text-amber-ink">
      <Info /> Unverified translation
    </span>
  );
}
