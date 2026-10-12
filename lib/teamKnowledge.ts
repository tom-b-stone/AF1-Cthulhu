// Team knowledge for the Asset Uploader: who is who, how things are named,
// what alt text must look like. Editable in the app (/assets/knowledge),
// stored in KV; these are the seed values when the store is empty.
//
// Sources: audif1.com/en/team (Oct 2026) and an analysis of the 4,000 newest
// production media alt texts (avg 87 chars, 650 over 125, "Audi Revolut F1®
// Team" 2,747× vs 21× without ®, "Hulkenberg" 506× vs "Hülkenberg" 31×,
// "Audi R26" 418×, "Grand Prix" 607×, 15 em-dashes).

export type KnowledgeKind = "person" | "term" | "rule" | "pattern";

export type KnowledgeEntry = {
  id: string;
  kind: KnowledgeKind;
  name: string; // the official EN form
  de?: string; // the official DE form, if different
  aliases?: string[]; // what people type / what the camera notes say
  role?: string; // for persons
  cue?: string; // visual cue for recognising them (helmet, suit, position)
  note?: string; // free text, shown to Claude
  active: boolean;
};

export const SEED_KNOWLEDGE: KnowledgeEntry[] = [
  // ---- team naming, set in stone
  { id: "team", kind: "term", name: "Audi Revolut F1® Team", de: "Audi Revolut F1® Team", aliases: ["Audi F1 Team", "AF1 Team", "Audi Revolut F1 Team", "Audi-F1", "ARF1T"], note: "Always with the ® after F1. Never shortened. Same in German.", active: true },
  { id: "car", kind: "term", name: "Audi R26", aliases: ["R26", "the car", "the R26"], note: "The 2026 car. 'Audi R26' on first mention in an alt text, 'R26' after. Never 'A26' or 'R-26'.", active: true },
  { id: "f1", kind: "term", name: "F1®", aliases: ["F1", "Formula 1", "Formula One"], note: "F1® and Formula 1® carry the mark. 'Grand Prix' written out; 'GP' only inside file names.", active: true },
  { id: "revolut", kind: "term", name: "Revolut", note: "Partner; on the site 'the official Audi Revolut F1® Team money app'. 'Revolut' alone when it means the partner, never 'Revolute'.", active: true },
  { id: "apex", kind: "term", name: "Revolut Apex Card", de: "Revolut Apex Card", aliases: ["Apex card", "Apex Card", "Revolut Apex", "the Apex", "Audi Apex Card", "Revolut card"], note: "The card product, always this way: 'Revolut Apex Card', capital A and C, with 'Revolut' in front. Same in German. Site wording: 'The Revolut Apex Card.' and the alt text 'Audi Revolut F1® Team Revolut Apex Card'.", active: true },
  { id: "adidas", kind: "term", name: "adidas", note: "Lowercase a, always. Pattern in use: 'adidas x Audi Revolut F1® Team …'.", active: true },
  { id: "ddp", kind: "term", name: "Audi Driver Development Programme", aliases: ["DDP", "Driver Development Programme"], note: "British spelling 'Programme'.", active: true },

  // ---- people (official page order)
  { id: "hul", kind: "person", name: "Nico Hulkenberg", de: "Nico Hülkenberg", aliases: ["HUL", "Nico", "Hülkenberg", "Hulk"], role: "Driver", cue: "Driver, taller of the two; name on the cockpit side. English alt text without umlaut, German with.", active: true },
  { id: "bor", kind: "person", name: "Gabriel Bortoleto", aliases: ["BOR", "Gabi", "Gabriel"], role: "Driver", cue: "Driver, Brazilian; 'Gabi' only in social copy, never in alt text.", active: true },
  { id: "binotto", kind: "person", name: "Mattia Binotto", aliases: ["Binotto"], role: "CEO & Team Principal", active: true },
  { id: "mcnish", kind: "person", name: "Allan McNish", aliases: ["McNish", "Alan McNish"], role: "Racing Director", note: "Two l's: Allan.", active: true },
  { id: "key", kind: "person", name: "James Key", aliases: ["Key"], role: "Technical Director", active: true },
  { id: "aron", kind: "person", name: "Paul Aron", aliases: ["ARO", "Aron"], role: "Reserve driver", active: true },
  { id: "felbermayr", kind: "person", name: "Emma Felbermayr", role: "Audi Driver Development Programme", active: true },
  { id: "slater", kind: "person", name: "Freddie Slater", aliases: ["Eddie Slater"], role: "Audi Driver Development Programme, F3 driver", active: true },

  // ---- alt text rules
  { id: "r-len", kind: "rule", name: "Alt text under 125 characters", note: "Average in the CMS is 87; 650 of the newest 4,000 are too long. One sentence, no trailing period needed.", active: true },
  { id: "r-lang", kind: "rule", name: "Alt text in English", note: "The media alt field is not localised. German names stay as the person writes them in English (Hulkenberg).", active: true },
  { id: "r-pattern", kind: "pattern", name: "<subject> of the Audi Revolut F1® Team <action> at the <race> Grand Prix", note: "The dominant pattern in the CMS. Variants in use: 'Audi Revolut F1® Team driver Gabriel Bortoleto walking along the pit wall', 'Close-up of the Audi R26 …', 'Rear view of …', 'Black and white …'.", active: true },
  { id: "r-facts", kind: "rule", name: "Only what is in the picture", note: "No results, no positions, no invented places. If the location is not visible, say 'at the race track' or name the Grand Prix from the batch folder.", active: true },
  { id: "r-brand", kind: "rule", name: "Brand marks and spellings", note: "Audi Revolut F1® Team, F1®, Audi R26, adidas (lowercase), Allan McNish. No em-dash (—), no double spaces.", active: true },
  { id: "r-people", kind: "rule", name: "Name people only when sure", note: "Drivers by full name (Nico Hulkenberg, Gabriel Bortoleto). Mechanics, engineers, fans stay generic: 'a mechanic', 'team members', 'fans'. Children never named.", active: true },
  { id: "r-decor", kind: "rule", name: "Decorative images still get an alt", note: "Patterns, textures, wallpapers: short factual alt ('Audi Revolut F1® Team wallpaper, Singapore 2026'). Never empty.", active: true },
];
