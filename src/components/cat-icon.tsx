type CatIconProps = {
  mood?: "happy" | "think" | "sleep" | "celebrate" | "worried" | "cheer" | "sorry";
  size?: number;
  className?: string;
};

export function CatIcon({ mood = "happy", size = 40, className }: CatIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/cats/${mood}.png`}
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden="true"
      style={{ objectFit: "contain", flexShrink: 0 }}
    />
  );
}
