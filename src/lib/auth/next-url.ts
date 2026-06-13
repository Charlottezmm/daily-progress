export function safeRelativeNextPath(value: string | string[] | undefined, fallback = "/today") {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  try {
    const url = new URL(candidate, "https://pawplan.local");
    if (url.origin !== "https://pawplan.local") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
