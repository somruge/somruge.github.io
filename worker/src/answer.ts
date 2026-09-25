export type Answer =
  | { kind: "answer"; text: string; sections: string[] }
  | { kind: "refused" }
  | { kind: "not_on_page" };

const MAX_ANSWER_CHARS = 1200;

// Turns the model's reply into something the page can render as plain text (FR-33, BR-07):
// codes become kinds, section tags are kept only if they're on the allowlist, and a reply
// with no valid section tag is treated as out of scope.
export function parseAnswer(content: string, allowed: readonly string[]): Answer {
  const raw = content.trim();
  if (raw.startsWith("OUT_OF_SCOPE")) return { kind: "refused" };
  if (raw.startsWith("NOT_ON_PAGE")) return { kind: "not_on_page" };

  const sections = [...new Set([...raw.matchAll(/\[([a-z0-9-]+)\]/g)].map((m) => m[1]))].filter((s) =>
    allowed.includes(s)
  );
  const text = raw
    .replace(/\[[^\]\n]*\]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_ANSWER_CHARS);

  if (!sections.length || !text) return { kind: "refused" };
  return { kind: "answer", text, sections };
}
