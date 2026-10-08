// Brand/SEO validation rules for audif1.com meta titles & descriptions,
// matching the audif1-seo-sync skill's brand-seo-pattern reference so the
// same checks apply whether an edit was made here or via the CMS console
// workflow.
export type SeoValidationResult = { errors: string[]; warnings: string[] };

const BAD_BRAND_PATTERNS: { re: RegExp; message: string }[] = [
  { re: /Audi Revolut F1® Teamng/i, message: 'Typo: "Teamng" should be "Team".' },
  { re: /Audi Revolut F1@ Team/i, message: 'Typo: "F1@" should be "F1®".' },
  { re: /Audi Revolut F1 Team\b/, message: 'Missing ® — should be "Audi Revolut F1® Team".' },
  { re: /\bAudi F1 Team\b/i, message: 'Use "Audi Revolut F1® Team", not "Audi F1 Team".' },
  { re: /\bAudi-F1\b/i, message: 'Use "Audi Revolut F1® Team", not "Audi-F1".' },
  { re: /\bAF1 Team\b/i, message: 'Use "Audi Revolut F1® Team", not "AF1 Team".' },
];

export function validateSeoField(kind: "title" | "description", value: string): SeoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!value.trim()) {
    warnings.push("Empty.");
    return { errors, warnings };
  }

  if (/—|&mdash;/.test(value)) {
    errors.push(
      "Contains an em-dash (—) — off-brand. Rewrite with a comma, period, colon, or (DE) an en-dash with spaces ( – )."
    );
  }
  if (/ {2,}/.test(value)) errors.push("Double space.");
  if (value !== value.trim()) errors.push("Leading or trailing whitespace.");
  if (/[.!?]{2,}/.test(value)) errors.push("Double punctuation.");

  for (const { re, message } of BAD_BRAND_PATTERNS) {
    if (re.test(value)) errors.push(message);
  }
  if (/\bF1\b(?!®)/.test(value) && !/Formula 1®/.test(value)) {
    warnings.push('Plain "F1" without ® — meta text should carry the registered mark.');
  }

  const len = value.length;
  if (kind === "title") {
    if (len > 60) errors.push(`Title is ${len} characters — over the 60-character limit.`);
    else if (len < 45) warnings.push(`Title is ${len} characters — under the 45–60 range.`);
    else if (len < 50)
      warnings.push(`Title is ${len} characters — under the usual 50–60 range (OK for legal/utility pages).`);
  } else {
    if (len > 160) errors.push(`Description is ${len} characters — over the 160-character hard limit.`);
    else if (len > 150) warnings.push(`Description is ${len} characters — over the usual 150-character target.`);
    else if (len < 100) warnings.push(`Description is ${len} characters — under the usual 100–150 range.`);
  }

  return { errors, warnings };
}
