// Safe to import from client components (no database access here).

export type Kind = "exercise" | "supplement" | "medicine" | "other";

export const KINDS: { value: Kind; label: string; emoji: string }[] = [
  { value: "exercise", label: "Exercise", emoji: "🏃" },
  { value: "supplement", label: "Supplement", emoji: "🥤" },
  { value: "medicine", label: "Medicine", emoji: "💊" },
  // The family's own types (Meditation, Water, Reading…): each item carries its own name and emoji.
  { value: "other", label: "Your own", emoji: "✨" },
];

/** The emoji to show for an item: its own for "Your own" types, else its type's. */
export function kindEmoji(kind: Kind, customEmoji?: string | null): string {
  return kind === "other" ? customEmoji || "✨" : KINDS.find((k) => k.value === kind)!.emoji;
}

export const AVATAR_COLORS = ["#f97316", "#10b981", "#6366f1", "#ec4899", "#0ea5e9", "#eab308", "#8b5cf6", "#14b8a6"];
