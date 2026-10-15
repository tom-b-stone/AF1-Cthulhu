"use client";

// Guided edit of one Team Card. Each step shows the real frontend view(s)
// where its texts appear, large and editable in place (WYSIWYG), with a
// short dialog that says what to do, the step's status, and ask-backs
// (German after English, rule issues). Nothing is written before Review.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FIELDS, STEPS, fieldIssues, type FieldDef, type Loc, type LocValue } from "@/lib/teamCardFields";
import { CollectedView, CollectionView, EngagementView, ModuleView, OverlayView, PostView, RevealView, RewardView, ShareView, WysStyles, type EditCtx } from "../Frontend";

type Values = Record<string, LocValue | string | boolean | undefined>;
type Card = {
  id: string;
  name: string;
  status: string;
  mechanic?: string;
  rewardType?: string;
  imageUrl?: string;
  engagementImageUrl?: string;
  values: Values;
  links: { badge: string; engagement?: string; page?: string };
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
  Reveal: [{ key: "reveal", label: "Reveal popup" }],
  Collected: [{ key: "collected", label: "Collected popup" }],
  Collection: [
    { key: "unearned", label: "Not collected yet" },
    { key: "earned", label: "Collected" },
  ],
  Reward: [{ key: "reward", label: "Reward" }],
  Settings: [],
  Review: [],
};

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

  const ctx: EditCtx = {
    vals,
    lang,
    focus,
    issues: Object.fromEntries(FIELDS.map((f) => [f.key, issuesOf(f, lang)])),
    onEdit: (k, v) => edit(k, v),
    onFocus: (k) => setFocus(k),
    imageUrl: card.imageUrl,
    engagementImageUrl: card.engagementImageUrl,
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
    setResult({ pushed: j.pushed ?? [], errors: j.errors ?? (j.error ? [j.error] : []) });
    if (j.card) {
      setCard(j.card);
      setVals(j.card.values);
    }
    setReview(null);
    setBusy(null);
  }

  const screen: Record<string, ReactNode> = {
    module: <ModuleView c={ctx} />,
    question: <EngagementView c={ctx} />,
    overlay: <OverlayView c={ctx} />,
    post: <PostView c={ctx} />,
    share: <ShareView c={ctx} />,
    reveal: <RevealView c={ctx} />,
    collected: <CollectedView c={ctx} />,
    unearned: <CollectionView c={ctx} earned={false} />,
    earned: <CollectionView c={ctx} earned />,
    reward: <RewardView rewardType={card.rewardType} />,
  };

  const st = stepState(step);
  const fs = fieldsOf(step);
  const focusField = FIELDS.find((f) => f.key === focus);

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 1100 }}>
      <WysStyles />
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

      {/* stepper with status */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ALL.map((s, i) => {
          const x = s === "Review" ? { changed: changes.length, problems: [] as string[] } : stepState(s);
          const mark = x.problems.length ? "!" : x.changed ? "●" : "✓";
          const col = x.problems.length ? "#e06c5b" : x.changed ? "var(--accent)" : "#6fcf7c";
          return (
            <button key={s} className="btn" onClick={() => go(s)} style={{ padding: "6px 12px", borderColor: s === step ? "var(--accent)" : undefined }}>
              <span style={{ color: col, fontWeight: 700 }}>{s === "Review" ? (changes.length ? changes.length : "·") : mark}</span> {i + 1}. {s}
            </button>
          );
        })}
      </div>

      {/* dialog */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 34, height: 34, borderRadius: 99, background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>TC</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 14px 14px 14px", padding: "12px 16px", fontSize: 15, lineHeight: 1.5, maxWidth: 760 }}>
          {TALK[step]}
          {step !== "Review" && step !== "Settings" && step !== "Reward" && (
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
              {st.problems.length ? `${st.problems.length} thing${st.problems.length === 1 ? "" : "s"} to look at in this step.` : st.changed ? `${st.changed} change${st.changed === 1 ? "" : "s"} so far, all fine.` : "Nothing changed yet. Everything here is complete."}
            </div>
          )}
        </div>
      </div>

      {/* big preview */}
      {VIEWS[step].length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {VIEWS[step].length > 1 &&
                VIEWS[step].map((v) => (
                  <button key={v.key} className="btn" style={{ padding: "5px 12px", borderColor: view === v.key ? "var(--accent)" : undefined }} onClick={() => setView(v.key)}>
                    {v.label}
                  </button>
                ))}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 4 }}>You are editing</span>
              {(["en", "de"] as Loc[]).map((l) => (
                <button key={l} className="btn" style={{ padding: "5px 12px", borderColor: lang === l ? "var(--accent)" : undefined }} onClick={() => setLang(l)}>
                  {l === "en" ? "English" : "German"}
                </button>
              ))}
            </div>
          </div>
          <div className="af-frame">{screen[view]}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Recreated from audif1.com. Click a text to edit it; a red wavy line means a rule issue (hover for the reason).
            {focusField && (
              <>
                {" "}
                Editing: <b>{focusField.label}</b>
                {focusField.maxWords ? ` · ${String(get(vals, focusField, lang)).trim().split(/\s+/).filter(Boolean).length}/${focusField.maxWords} words` : ""}
              </>
            )}
          </div>
        </div>
      )}

      {/* German ask-back */}
      {fs.filter(deMissing).map((f) => (
        <div key={f.key} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 34, flexShrink: 0 }} />
          <div style={{ background: "rgba(227,62,26,0.08)", border: "1px solid rgba(227,62,26,0.35)", borderRadius: "4px 14px 14px 14px", padding: "10px 14px", fontSize: 14, display: "grid", gap: 8 }}>
            <div>
              You changed the English <b>{f.label.toLowerCase()}</b>. Shall we change the German too?
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn"
                style={{ padding: "4px 12px" }}
                onClick={() => {
                  setLang("de");
                  setFocus(f.key);
                }}
              >
                Yes, show me the German
              </button>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setKeepDe((k) => ({ ...k, [f.key]: true }))}>
                No, keep it
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* settings step */}
      {step === "Settings" &&
        fs.map((f) => (
          <label key={f.key} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" checked={Boolean(get(vals, f, "en"))} onChange={(e) => edit(f.key, e.target.checked, "en")} /> {f.label}
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{f.help}</span>
          </label>
        ))}

      {/* status of this step + form fallback */}
      {step !== "Review" && fs.length > 0 && step !== "Settings" && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Status of this step</div>
            <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setShowForm((x) => !x)}>
              {showForm ? "Hide form" : "Edit as form"}
            </button>
          </div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <tbody>
              {fs.map((f) => {
                const en = issuesOf(f, "en");
                const de = f.localized ? issuesOf(f, "de") : [];
                const changed = changes.some((c) => c.key === f.key);
                return (
                  <tr key={f.key} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                    <td style={{ padding: "6px 4px", width: 200 }}>
                      <span style={{ cursor: "pointer", textDecoration: focus === f.key ? "underline" : undefined }} onClick={() => setFocus(f.key)}>
                        {f.label}
                      </span>
                    </td>
                    <td style={{ padding: "6px 4px", width: 90 }}>{changed ? <span style={{ color: "var(--accent)" }}>● changed</span> : <span style={{ color: "var(--muted)" }}>as is</span>}</td>
                    <td style={{ padding: "6px 4px", color: en.length || de.length ? "#e06c5b" : "#6fcf7c" }}>{[...en, ...de.map((x) => `${x} (DE)`)].join(" · ") || "ok"}</td>
                    {showForm && (
                      <td style={{ padding: "6px 4px", width: "45%" }}>
                        {f.localized ? (
                          (["en", "de"] as Loc[]).map((l) => (
                            <textarea key={l} className="input" rows={f.kind === "textarea" ? 2 : 1} style={{ width: "100%", marginBottom: 4 }} placeholder={l.toUpperCase()} value={String(get(vals, f, l))} onFocus={() => { setFocus(f.key); setLang(l); }} onChange={(e) => edit(f.key, e.target.value, l)} />
                          ))
                        ) : f.kind === "select" ? (
                          <select className="input" value={String(get(vals, f, "en") ?? "")} onChange={(e) => edit(f.key, e.target.value, "en")}>
                            {(f.options ?? []).map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* review */}
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
                    <tr key={i} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
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
                <li>Once the client has approved, the card is rebuilt on production (comes with the publish step).</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ask-back before moving on */}
      {ask && (
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ width: 34, flexShrink: 0 }} />
          <div style={{ border: "1px solid rgba(227,62,26,0.35)", borderRadius: "4px 14px 14px 14px", padding: "10px 14px", fontSize: 14, display: "grid", gap: 8 }}>
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
  );
}
