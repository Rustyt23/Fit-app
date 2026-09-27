import type { Member } from "@/lib/data";

type Props = {
  member: Pick<Member, "id" | "name" | "color" | "has_photo" | "photo_version">;
  size?: number;
  ring?: string;
  className?: string;
};

export function photoUrl(member: Props["member"]): string | null {
  return member.has_photo ? `/api/photo/${member.id}?v=${member.photo_version}` : null;
}

export default function Avatar({ member, size = 48, ring, className = "" }: Props) {
  const url = photoUrl(member);
  const initials = member.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: member.color,
        boxShadow: ring ? `0 0 0 3px #fff, 0 0 0 ${size > 60 ? 6 : 5}px ${ring}` : undefined,
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={member.name} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}
