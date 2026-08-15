"use client";

interface AvatarProps {
  src: string | null | undefined;
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses: Record<string, string> = {
  xs: "w-6 h-6 text-[9px]",
  sm: "w-7 h-7 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-24 h-24 text-2xl",
};

const imgSizeClasses: Record<string, string> = {
  xs: "w-6 h-6",
  sm: "w-7 h-7",
  md: "w-8 h-8",
  lg: "w-10 h-10",
  xl: "w-24 h-24",
};

export function Avatar({ src, name, size = "md", className = "" }: AvatarProps) {
  const initials =
    (name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()) || "?";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${imgSizeClasses[size]} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-[#2563eb] flex items-center justify-center text-white font-semibold shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}
