import { cn } from "@/lib/utils";
import { AVATAR_COLORS } from "@/lib/theme";

const hashName = (name: string): number => {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
};

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => (p[0] ?? "").toUpperCase())
    .join("") || "?";
};

interface AvatarProps {
  name: string;
  className?: string;
}

const Avatar = ({ name, className }: AvatarProps) => {
  const color = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[#1A1A1A]",
        color,
        className
      )}
      title={name}
    >
      {initials(name)}
    </div>
  );
};

export default Avatar;
