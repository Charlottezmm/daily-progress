const privateNamePatterns = [/程辉/g];

export function redactPrivateTitle(title: string) {
  return privateNamePatterns
    .reduce((current, pattern) => current.replace(pattern, ""), title)
    .replace(/\s{2,}/g, " ")
    .trim();
}
