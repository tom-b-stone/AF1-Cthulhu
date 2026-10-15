// Team Card fields: pure data shared by the browser (wizard, previews) and
// the server (records, staging push, connector).
export type Loc = "en" | "de";
export type DocKind = "badge" | "engagement" | "module";

export type FieldDef = {
  key: string;
  label: string;
  step: string;
  doc: DocKind;
  path: (string | number)[];
  localized: boolean;
  kind: "text" | "textarea" | "select" | "boolean";
  options?: string[];
  maxWords?: number;
  help?: string;
};

// in journey order: where the fan meets the card → task → reveal → collected → collection → reward
export const STEPS = ["Module", "Engagement", "Reveal", "Collected", "Collection", "Reward", "Settings"] as const;

export const FIELDS: FieldDef[] = [
  { key: "publicTitle", label: "Public title", step: "Collected", doc: "badge", path: ["publicTitle"], localized: true, kind: "text", help: "Name of the card in the collection" },
  { key: "description", label: "Card description", step: "Collection", doc: "badge", path: ["description"], localized: true, kind: "textarea", help: "One line, does not repeat the title" },
  { key: "badgePopupTitle", label: "Popup title", step: "Collected", doc: "badge", path: ["badgePopupTitle"], localized: true, kind: "text", maxWords: 6 },
  { key: "revealTitle", label: "Reveal title", step: "Reveal", doc: "badge", path: ["loggedOutRevealTitle"], localized: true, kind: "text" },
  { key: "revealDescription", label: "Reveal description", step: "Reveal", doc: "badge", path: ["loggedOutRevealDescription"], localized: true, kind: "textarea" },
  { key: "revealButton", label: "Reveal button label", step: "Reveal", doc: "badge", path: ["loggedOutRevealButtonLabel"], localized: true, kind: "text" },
  { key: "rewardDescription", label: "Reward description", step: "Collected", doc: "badge", path: ["rewardDescription"], localized: true, kind: "textarea", maxWords: 20, help: "Shown once the card is collected" },
  { key: "rewardTeaser", label: "Reward teaser", step: "Collection", doc: "badge", path: ["rewardTeaserDescription"], localized: true, kind: "textarea", maxWords: 20, help: "Shown in the collection while not earned" },
  { key: "ctaLabel", label: "CTA label", step: "Collection", doc: "badge", path: ["unearnedBadgeCTA", 0, "label"], localized: true, kind: "text" },
  { key: "ctaA11y", label: "CTA accessibility label", step: "Collection", doc: "badge", path: ["unearnedBadgeCTA", 0, "a11yLabel"], localized: true, kind: "text" },
  { key: "ctaVariant", label: "CTA variant", step: "Collection", doc: "badge", path: ["unearnedBadgeCTA", 0, "appearance", "variant"], localized: false, kind: "select", options: ["primary", "secondary", "tertiary", "quaternary"] },
  { key: "ctaSize", label: "CTA size", step: "Collection", doc: "badge", path: ["unearnedBadgeCTA", 0, "appearance", "size"], localized: false, kind: "select", options: ["sm", "md", "lg"] },
  { key: "engTitle", label: "Engagement title (CMS)", step: "Engagement", doc: "engagement", path: ["title"], localized: true, kind: "text", help: "Name | TC-0xx" },
  { key: "question", label: "Question", step: "Engagement", doc: "engagement", path: ["questions", 0, "text"], localized: true, kind: "textarea" },
  { key: "overlayTitle", label: "Login overlay title", step: "Engagement", doc: "engagement", path: ["overlayTitle"], localized: true, kind: "text" },
  { key: "overlaySubtitle", label: "Login overlay subtitle", step: "Engagement", doc: "engagement", path: ["overlaySubtitle"], localized: true, kind: "textarea" },
  { key: "shareTitle", label: "Share title", step: "Engagement", doc: "engagement", path: ["shareTitle"], localized: true, kind: "text" },
  { key: "shareText", label: "Share text", step: "Engagement", doc: "engagement", path: ["shareText"], localized: true, kind: "textarea" },
  { key: "submitLabel", label: "Submit button", step: "Engagement", doc: "engagement", path: ["questionSubmitLabel"], localized: true, kind: "text" },
  { key: "postTitle", label: "After the answer: title", step: "Engagement", doc: "engagement", path: ["postSubmissionMessageTitle"], localized: true, kind: "text" },
  { key: "postMessage", label: "After the answer: message", step: "Engagement", doc: "engagement", path: ["postSubmissionMessage"], localized: true, kind: "textarea" },
  { key: "modCategory", label: "Module category", step: "Module", doc: "module", path: ["category"], localized: true, kind: "text" },
  { key: "modHeadline", label: "Module headline", step: "Module", doc: "module", path: ["headline"], localized: true, kind: "textarea" },
  { key: "modSubline", label: "Module subline", step: "Module", doc: "module", path: ["subline"], localized: true, kind: "text" },
  { key: "modCopy", label: "Module copy", step: "Module", doc: "module", path: ["copy"], localized: true, kind: "textarea" },
  { key: "modBackground", label: "Module background", step: "Module", doc: "module", path: ["backgroundColor"], localized: false, kind: "select", options: ["chalk", "grey-01", "graphite", "lava"] },
  { key: "disabled", label: "Disable this card", step: "Settings", doc: "badge", path: ["isDraft"], localized: false, kind: "boolean", help: "A disabled card loses the link to its engagement and module. Leave off." },
];

export const fieldByKey = (k: string) => FIELDS.find((f) => f.key === k);

export type LocValue = { en?: string; de?: string };
// ---- rules --------------------------------------------------------------
export function fieldIssues(f: FieldDef, loc: Loc | null, value: unknown, other?: string): string[] {
  const out: string[] = [];
  if (typeof value !== "string") return out;
  const v = value.trim();
  if (f.maxWords && v && v.split(/\s+/).length > f.maxWords) out.push(`${f.label}: ${v.split(/\s+/).length} words, max ${f.maxWords}`);
  if (/\bbadges?\b/i.test(v) && f.doc !== "engagement") out.push(`${f.label}: say "Team Card", not "Badge"`);
  if (/Audi Revolut F1 Team/.test(v)) out.push(`${f.label}: "Audi Revolut F1® Team" with ®`);
  if (/—/.test(v)) out.push(`${f.label}: no em dash`);
  if (/!/.test(v)) out.push(`${f.label}: no exclamation marks`);
  if (loc === "en" && v && other !== undefined && !other.trim()) out.push(`${f.label}: DE is empty`);
  return out;
}

