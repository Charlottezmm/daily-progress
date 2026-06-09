type CatIconProps = {
  mood?: "happy" | "think" | "sleep";
  size?: number;
  className?: string;
};

function Face({ mood }: { mood: NonNullable<CatIconProps["mood"]> }) {
  if (mood === "sleep") {
    return (
      <>
        <path d="M30,53 Q38,46 46,53" stroke="#1a1a2e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M54,53 Q62,46 70,53" stroke="#1a1a2e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </>
    );
  }

  return (
    <>
      <ellipse cx="38" cy="53" rx="7.5" ry="8.5" fill="white" />
      <ellipse cx="62" cy="53" rx="7.5" ry="8.5" fill="white" />
      <ellipse cx="38" cy="53" rx="6" ry="7" fill="#6CB8E6" />
      <ellipse cx="62" cy="53" rx="6" ry="7" fill="#6CB8E6" />
      <ellipse cx={mood === "think" ? "40" : "38"} cy="52.5" rx="3.2" ry="3.5" fill="#1a1a2e" />
      <ellipse cx={mood === "think" ? "64" : "62"} cy="52.5" rx="3.2" ry="3.5" fill="#1a1a2e" />
      <circle cx={mood === "think" ? "38" : "35.5"} cy="50" r="2" fill="white" opacity="0.9" />
      <circle cx={mood === "think" ? "62" : "59.5"} cy="50" r="2" fill="white" opacity="0.9" />
    </>
  );
}

export function CatIcon({ mood = "happy", size = 40, className }: CatIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M15,44 L22,4 L44,38" fill="#C8B8A4" />
      <path d="M19,40 L24,10 L40,36" fill="#E8B8C0" />
      <path d="M56,38 L78,4 L85,44" fill="#C8B8A4" />
      <path d="M60,36 L76,10 L81,40" fill="#E8B8C0" />
      <path d="M18,44 Q14,58 26,72 Q38,84 50,86 Q62,84 74,72 Q86,58 82,44 Q76,34 50,32 Q24,34 18,44Z" fill="#D4C4B0" />
      <path d="M28,42 Q34,36 50,34 Q66,36 72,42 Q76,52 72,60 Q64,68 50,70 Q36,68 28,60 Q24,52 28,42Z" fill="#8A7A68" opacity="0.45" />
      <path d="M32,44 L40,35 L50,44 L60,35 L68,44" stroke="#4A3C2E" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37,48 L50,40 L63,48" stroke="#4A3C2E" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <Face mood={mood} />
      <path d="M47,63 L50,67 L53,63Z" fill="#C08878" />
      <path d="M50,67 Q45,71 42,69" stroke="#7A6B58" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M50,67 Q55,71 58,69" stroke="#7A6B58" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="80" rx="20" ry="12" fill="#F5EDE3" />
      <line x1="4" y1="56" x2="30" y2="59" stroke="#D0C0A8" strokeWidth="0.8" />
      <line x1="2" y1="62" x2="29" y2="63" stroke="#D0C0A8" strokeWidth="0.8" />
      <line x1="70" y1="59" x2="96" y2="56" stroke="#D0C0A8" strokeWidth="0.8" />
      <line x1="71" y1="63" x2="98" y2="62" stroke="#D0C0A8" strokeWidth="0.8" />
    </svg>
  );
}
