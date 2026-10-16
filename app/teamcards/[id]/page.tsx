"use client";

// Guided edit of one Team Card, in two columns: the step's fields on the left,
// a live mobile preview on the right that renders the texts in the real
// audif1.com frontend (production CSS and module markup, see LivePreview).
// Typing on the left updates the preview; clicking a text in the preview
// selects its field. Ask-backs (German after English, rule issues) stay.
// Nothing is written before Review.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FIELDS, STEPS, fieldIssues, type FieldDef, type Loc, type LocValue } from "@/lib/teamCardFields";
import { LivePreview, type PreviewCard } from "../LivePreview";

type Values = Record<string, LocValue | string | boolean | undefined>;
type Card = {
  id: string;
  name: string;
  status: string;
  mechanic?: string;
  rewardType?: string;
  imageUrl?: string;
  engagementImageUrl?: string;
  badgeTypeLabel?: string;
  raceLabel?: string;
  values: Values;
  links: { badge: string; engagement?: string; page?: string };
  preview?: PreviewCard["preview"];
  log: { at: string; by: string; summary: string }[];
};
type DiffRow = { card: string; key: string; label: string; locale: Loc | null; before: unknown; after: unknown; issues: string[] };

const ALL = [...STEPS, "Review"] as const;
type Step = (typeof ALL)[number];

const TALK: Record<Step, string> = {
  Module: "Let's start where fans meet the card: the module on the page. Click any text in the preview and type. What makes them stop scrolling?",
  Engagement: "Now the task that unlocks the card. Write the question first, then flip through what fans see after answering, logged out and logged in, and what they share.",
  Reveal: "Fans who aren't logged in see the card right after the task. Give them a reason to log in.",
  Collected: "The moment of collecting. Short and proud: the popup title has six words at most, the line below twenty.",
  Collection: "In the profile the card waits until it's earned. Tell fans how to get it and where the button takes them. Switch to \"collected\" for the line they see afterwards.",
  Reward: "What does the card give besides itself? Raffle and voucher get their own fields once a card needs them.",
  Settings: "Last check before the review. The card stays active, otherwise it loses its link to the engagement and the module.",
  Review: "Here's everything you changed, checked against the rules. Have a look, then apply it to staging.",
};

const VIEWS: Record<Step, { key: string; label: string }[]> = {
  Module: [{ key: "module", label: "On the page" }],
  Engagement: [
    { key: "question", label: "The question" },
    { key: "overlay", label: "Answered, logged out" },
    { key: "post", label: "Answered, logged in" },
    { key: "share", label: "Shared" },
  ],
  Reveal: [{ key: "reveal", label: "Card popup, not logged in" }],
  Collected: [{ key: "collected", label: "Card popup, collected" }],
  Collection: [
    { key: "unearned", label: "Not collected yet" },
    { key: "earned", label: "Collected" },
    { key: "shelf", label: "In the collection" },
  ],
  Reward: [{ key: "reward", label: "Reward" }],
  Settings: [{ key: "module", label: "On the page" }],
  Review: [{ key: "module", label: "On the page" }],
};

// which preview screen shows a field (first match wins)
const VIEW_KEYS: Record<string, string[]> = {
  module: ["modCategory", "modHeadline", "modSubline", "modCopy", "modBackground", "question"],
  question: ["question", "submitLabel"],
  overlay: ["overlayTitle", "overlaySubtitle"],
  post: ["postTitle", "postMessage"],
  share: ["shareTitle", "shareText"],
  reveal: ["revealTitle", "revealDescription", "revealButton", "rewardTeaser"],
  collected: ["badgePopupTitle", "rewardDescription", "description"],
  unearned: ["publicTitle", "rewardTeaser", "ctaLabel", "description"],
  earned: ["publicTitle", "description", "rewardDescription"],
  shelf: ["publicTitle"],
};
const words = (v: string) => v.trim().split(/\s+/).filter(Boolean).length;

const get = (v: Values, f: FieldDef, l: Loc) => (f.localized ? ((v[f.key] as LocValue | undefined)?.[l] ?? "") : (v[f.key] as string | boolean | undefined));

export default function EditCard() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<Card | null>(null);
  const [vals, setVals] = useState<Values>({});
  const [step, setStep] = useState<Step>("Module");
  const [view, setView] = useState<string>("module");
  const [lang, setLang] = useState<Loc>("en");
  const [focus, setFocus] = useState<string | undefined>();
  const [keepDe, setKeepDe] = useState<Record<string, boolean>>({});
  const [ask, setAsk] = useState<string[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [review, setReview] = useState<{ rows: DiffRow[]; errors: string[] } | null>(null);
  const [result, setResult] = useState<{ pushed: string[]; errors: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/teamcards/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.card) {
          setCard(j.card);
          setVals(j.card.values);
        }
      });
  }, [id]);

  const changes = useMemo(() => {
    if (!card) return [] as { key: string; locale?: Loc; value: string | boolean }[];
    const out: { key: string; locale?: Loc; value: string | boolean }[] = [];
    for (const f of FIELDS) {
      if (f.localized) {
        for (const l of ["en", "de"] as Loc[]) if (get(vals, f, l) !== get(card.values, f, l)) out.push({ key: f.key, locale: l, value: String(get(vals, f, l)) });
      } else if (get(vals, f, "en") !== get(card.values, f, "en")) out.push({ key: f.key, value: get(vals, f, "en") as string | boolean });
    }
    return out;
  }, [vals, card]);

  // select a field; the preview follows to a screen that shows it
  const pick = useCallback(
    (k: string) => {
      setFocus(k);
      setView((cur) => {
        if (VIEW_KEYS[cur]?.includes(k)) return cur;
        const inStep = VIEWS[step].find((v) => VIEW_KEYS[v.key]?.includes(k));
        const any = Object.keys(VIEW_KEYS).find((v) => VIEW_KEYS[v].includes(k));
        return inStep?.key ?? any ?? cur;
      });
      setTimeout(() => document.getElementById(`f-${k}`)?.focus(), 0);
    },
    [step],
  );

  if (!card) return <div style={{ color: "var(--muted)" }}>Loading card…</div>;

  const fieldsOf = (s: Step) => FIELDS.filter((f) => f.step === s);
  const issuesOf = (f: FieldDef, l: Loc) => (f.localized ? fieldIssues(f, l, get(vals, f, l), l === "en" ? String(get(vals, f, "de")) : undefined) : fieldIssues(f, null, get(vals, f, "en")));
  const deMissing = (f: FieldDef) => f.localized && get(vals, f, "en") !== get(card.values, f, "en") && get(vals, f, "de") === get(card.values, f, "de") && !keepDe[f.key];
  const stepState = (s: Step) => {
    const fs = fieldsOf(s);
    const changed = changes.filter((c) => fs.some((f) => f.key === c.key)).length;
    const problems = fs.flatMap((f) => [...issuesOf(f, "en"), ...(f.localized ? issuesOf(f, "de").map((x) => `${x} (DE)`) : [])]).concat(fs.filter(deMissing).map((f) => `${f.label}: English changed, German not yet`));
    return { changed, problems };
  };

  const edit = (key: string, value: string | boolean, l: Loc = lang) => {
    const f = FIELDS.find((x) => x.key === key);
    if (!f) return;
    setVals((cur) => ({ ...cur, [key]: f.localized ? { ...((cur[key] as LocValue) ?? {}), [l]: String(value) } : value }));
  };

  const go = (s: Step) => {
    setStep(s);
    setView(VIEWS[s][0]?.key ?? "");
    setAsk(null);
    setFocus(undefined);
    if (s === "Review") void runPreview();
  };
  const next = (force = false) => {
    const { problems } = stepState(step);
    if (problems.length && !force) {
      setAsk(problems);
      return;
    }
    go(ALL[Math.min(ALL.indexOf(step) + 1, ALL.length - 1)]);
  };

  async function runPreview() {
    setBusy("Checking your changes…");
    setResult(null);
    const j = await fetch(`/api/teamcards/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", changes }) }).then((r) => r.json());
    setReview(j.rows ? j : { rows: [], errors: [j.error ?? "failed"] });
    setBusy(null);
  }
  async function apply() {
    setBusy("Writing to staging…");
    const j = await fetch(`/api/teamcards/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", changes }) }).then((r) => r.json());
    window.dispatchEvent(new Event("af1:changed"));
    setResult({ pushed: j.pushed ?? [], errors: j.errors ?? (j.error ? [j.error] : []) });
    if (j.card) {
      setCard(j.card);
      setVals(j.card.values);
    }
    setReview(null);
    setBusy(null);
  }

  const st = stepState(step);
  const fs = fieldsOf(step);
  const focusField = FIELDS.find((f) => f.key === focus);

  const previewCard: PreviewCard = { imageUrl: card.imageUrl, engagementImageUrl: card.engagementImageUrl, badgeTypeLabel: card.badgeTypeLabel, raceLabel: card.raceLabel, rewardType: card.rewardType, preview: card.preview };
  const views = VIEWS[step];

  const fieldEditor = (f: FieldDef) => {
    const v = get(vals, f, f.localized ? lang : "en");
    const iss = issuesOf(f, f.localized ? lang : "en");
    const changed = changes.some((c) => c.key === f.key);
    const inPreview = Object.values(VIEW_KEYS).some((ks) => ks.includes(f.key));
    return (
      <div key={f.key} style={{ display: "grid", gap: 5, padding: "10px 12px", borderRadius: 10, border: `1px solid ${focus === f.key ? "var(--accent)" : "var(--border)"}`, background: focus === f.key ? "rgba(227,62,26,0.05)" : "transparent" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <label htmlFor={`f-${f.key}`} style={{ fontSize: 13, fontWeight: 600, cursor: inPreview ? "pointer" : undefined }} onClick={() => pick(f.key)}>
            {f.label}
            {changed && <span style={{ color: "var(--accent)", fontWeight: 400 }}> · changed</span>}
          </label>
          <span style={{ fontSize: 11, color: f.maxWords && typeof v === "string" && words(v) > f.maxWords ? "#e06c5b" : "var(--muted)" }}>
            {f.maxWords && typeof v === "string" ? `${words(v)}/${f.maxWords} words` : f.localized ? (lang === "en" ? "EN" : "DE") : ""}
          </span>
        </div>
        {f.kind === "select" ? (
          <select id={`f-${f.key}`} className="input" value={String(v ?? "")} onFocus={() => pick(f.key)} onChange={(e) => edit(f.key, e.target.value, "en")}>
            {(f.options ?? []).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : (
          <textarea
            id={`f-${f.key}`}
            className="input"
            rows={Math.max(f.kind === "textarea" ? 3 : 1, Math.ceil(String(v ?? "").length / 70))}
            style={{ width: "100%", resize: "vertical", fontSize: 14, lineHeight: 1.45 }}
            value={String(v ?? "")}
            onFocus={() => pick(f.key)}
            onChange={(e) => edit(f.key, e.target.value)}
          />
        )}
        {f.help && <div style={{ fontSize: 11, color: "var(--muted)" }}>{f.help}</div>}
        {iss.length > 0 && <div style={{ fontSize: 12, color: "#e06c5b" }}>{iss.join(" · ")}</div>}
        {deMissing(f) && (
          <div style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            English changed. German too?
            <button className="btn" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => { setLang("de"); pick(f.key); }}>
              Show German
            </button>
            <button className="btn" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => setKeepDe((k) => ({ ...k, [f.key]: true }))}>
              Keep it
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 430px", gap: 28, alignItems: "start", maxWidth: 1240 }}>
      {/* ---- left: edit ---- */}
      <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
        <div>
          <Link href="/teamcards" style={{ fontSize: 12, color: "var(--muted)" }}>
            ← All Team Cards
          </Link>
          <h1 style={{ margin: "4px 0 2px" }}>{card.name}</h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {card.id} · {card.status} · on staging: <a href={card.links.badge} target="_blank" rel="noreferrer">card</a>
            {card.links.engagement && (
              <>
                {" · "}
                <a href={card.links.engagement} target="_blank" rel="noreferrer">engagement</a>
              </>
            )}
            {card.links.page && (
              <>
                {" · "}
                <a href={card.links.page} target="_blank" rel="noreferrer">page</a>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ALL.map((s, i) => {
            const x = s === "Review" ? { changed: changes.length, problems: [] as string[] } : stepState(s);
            const mark = x.problems.length ? "!" : x.changed ? "●" : "✓";
            const col = x.problems.length ? "#e06c5b" : x.changed ? "var(--accent)" : "#6fcf7c";
            return (
              <button key={s} className="btn" onClick={() => go(s)} style={{ padding: "5px 11px", borderColor: s === step ? "var(--accent)" : undefined }}>
                <span style={{ color: col, fontWeight: 700 }}>{s === "Review" ? (changes.length ? changes.length : "·") : mark}</span> {i + 1}. {s}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 30, height: 30, borderRadius: 99, background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>TC</div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 14px 14px 14px", padding: "10px 14px", fontSize: 14, lineHeight: 1.5 }}>
            {TALK[step]}
            {step !== "Review" && step !== "Settings" && step !== "Reward" && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                {st.problems.length ? `${st.problems.length} thing${st.problems.length === 1 ? "" : "s"} to look at in this step.` : st.changed ? `${st.changed} change${st.changed === 1 ? "" : "s"} so far, all fine.` : "Nothing changed yet. Everything here is complete."}
              </div>
            )}
          </div>
        </div>

        {step !== "Review" && step !== "Settings" && fs.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 4 }}>You are editing</span>
              {(["en", "de"] as Loc[]).map((l) => (
                <button key={l} className="btn" style={{ padding: "4px 12px", borderColor: lang === l ? "var(--accent)" : undefined }} onClick={() => setLang(l)}>
                  {l === "en" ? "English" : "German"}
                </button>
              ))}
            </div>
            {fs.map(fieldEditor)}
          </div>
        )}

        {step === "Reward" && fs.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>Raffle and voucher fields appear once a card needs them. The preview shows how this card works.</div>}

        {step === "Settings" &&
          fs.map((f) => (
            <label key={f.key} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={Boolean(get(vals, f, "en"))} onChange={(e) => edit(f.key, e.target.checked, "en")} /> {f.label}
              <span style={{ color: "var(--muted)", fontSize: 12 }}>{f.help}</span>
            </label>
          ))}

        {step === "Review" && (
          <div style={{ display: "grid", gap: 12 }}>
            {busy && <div style={{ color: "var(--muted)" }}>{busy}</div>}
            {review && review.rows.length === 0 && !result && <div style={{ color: "var(--muted)" }}>Nothing changed yet. Pick a step above and click into a text.</div>}
            {review && review.rows.length > 0 && (
              <>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
                      <th style={{ padding: 6 }}>Field</th>
                      <th style={{ padding: 6 }}>Before</th>
                      <th style={{ padding: 6 }}>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.rows.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top", cursor: "pointer" }} onClick={() => pick(r.key)}>
                        <td style={{ padding: 6 }}>
                          {r.label}
                          {r.locale ? ` · ${r.locale === "en" ? "English" : "German"}` : ""}
                          {r.issues.length > 0 && <div style={{ color: "#e06c5b", fontSize: 12 }}>{r.issues.join(" · ")}</div>}
                        </td>
                        <td style={{ padding: 6, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{String(r.before ?? "")}</td>
                        <td style={{ padding: 6, whiteSpace: "pre-wrap" }}>{String(r.after ?? "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Apply writes these {review.rows.length} changes to the card, engagement and module on staging. The staging page is republished.</div>
                <div>
                  <button className="btn btn-primary" disabled={!!busy} onClick={apply}>
                    Yes, apply to staging
                  </button>
                </div>
              </>
            )}
            {result && (
              <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
                {result.pushed.map((p, i) => (
                  <div key={i}>✓ {p}</div>
                ))}
                {result.errors.map((p, i) => (
                  <div key={i} style={{ color: "#e06c5b" }}>
                    ✗ {p}
                  </div>
                ))}
                <div style={{ fontWeight: 600, marginTop: 6 }}>What next?</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  {card.links.page && (
                    <li>
                      <a href={card.links.page} target="_blank" rel="noreferrer">Look at it on staging ↗</a>
                    </li>
                  )}
                  <li>
                    Same wording elsewhere? Use <Link href="/teamcards#replace">Search and replace</Link> on the overview to change it on all cards at once.
                  </li>
                  <li>The Figma sitemap picks the change up on its next sync.</li>
                  <li>Once the client has approved, the card is rebuilt on production (comes with the publish step).</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {ask && (
          <div style={{ border: "1px solid rgba(227,62,26,0.35)", borderRadius: 12, padding: "10px 14px", fontSize: 14, display: "grid", gap: 8 }}>
            <div>Before we go on, have a look at {ask.length === 1 ? "this" : `these ${ask.length}`}:</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {ask.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setAsk(null)}>
                I&apos;ll fix it
              </button>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => next(true)}>
                Go on anyway
              </button>
            </div>
          </div>
        )}

        {step !== "Review" && (
          <div style={{ display: "flex", gap: 8 }}>
            {ALL.indexOf(step) > 0 && (
              <button className="btn" onClick={() => go(ALL[ALL.indexOf(step) - 1])}>
                Back
              </button>
            )}
            <button className="btn btn-primary" onClick={() => next()}>
              {ALL[ALL.indexOf(step) + 1] === "Review" ? "Review my changes" : `Next: ${ALL[ALL.indexOf(step) + 1]}`}
            </button>
          </div>
        )}
      </div>

      {/* ---- right: live mobile preview ---- */}
      <div style={{ position: "sticky", top: 16, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          {(views.length > 1 ? views : []).map((v) => (
            <button key={v.key} className="btn" style={{ padding: "4px 10px", fontSize: 12, borderColor: view === v.key ? "var(--accent)" : undefined }} onClick={() => setView(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
        <LivePreview view={view || "module"} vals={vals} lang={lang} card={previewCard} focus={focus} onFocus={pick} />
        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>
          Mobile, with the audif1.com production styles. Tap a text to edit it, tap the card to flip it, swipe popups to the back.
          {focusField && (
            <>
              <br />
              Editing: <b>{focusField.label}</b> ({lang === "en" ? "English" : "German"})
            </>
          )}
        </div>
      </div>
    </div>
  );
}
