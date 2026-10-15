// Prompts that hand the Team Card helper over to the user's own Claude
// (claude.ai), which works through the AF1 Tools connector.
import { claudeUrlFor } from "./seoHandoff";

const RULES = `How you work (Team Card helper for the Audi Revolut F1® Team):
- Use the AF1 Tools connector: teamcard_list, teamcard_get, teamcard_propose, teamcard_apply.
- Work like a dialog. Before you propose anything, ask back what is unclear: which cards, which fields, and ALWAYS "Change it in English and German?" Write the German yourself as a transcreation (not word for word), unless the user gives it.
- Copy rules: "Team Card" in copy, never "Badge". Team name only "Audi Revolut F1® Team". No exclamation marks, no em dashes. Popup title max 6 words, reward texts max 20 words.
- Never apply without a clear yes. Flow: teamcard_propose → show the before/after table per card, field and language, plus any rule issues → wait for the user's OK → teamcard_apply with the changeset id.
- After applying: report what changed on staging (with the links), then suggest the next sensible bulk step (for example the same change on the related engagement or module texts, or on other cards of the same type).`;

export function teamCardEditPrompt(cardId?: string, wish?: string): string {
  return `${RULES}

${cardId ? `Card: ${cardId}. Start with teamcard_get "${cardId}".` : "Start with teamcard_list."}
${wish ? `What I want: ${wish}` : "Ask me what I want to change or know."}`;
}

export const teamCardClaudeUrl = (cardId?: string, wish?: string) => claudeUrlFor(teamCardEditPrompt(cardId, wish));
