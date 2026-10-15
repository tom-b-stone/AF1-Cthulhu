"use client";

// Guided edit of one Team Card: one step at a time, text on the left, the
// whole fan journey on the right, updated as you type. The tool asks back
// where it matters (German after an English change, rule issues before
// moving on) and writes nothing until the review step's Apply.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FIELDS, STEPS, fieldIssues, type FieldDef, type Loc, type LocValue } from "@/lib/teamCardFields";
import { teamCardClaudeUrl } from "@/lib/teamCardHandoff";
import JourneyPreview, { SCREENS, type JourneyCard } from "../JourneyPreview";

type Values = Record<string, LocValue | string | boolean | undefined>;
type Card = JourneyCard & { status: string; placement?: string; links: { badge: string; engagement?: string; page?: string }; log: { at: string; by: string; summary: string }[] };
type DiffRow = { card: string; key: string; label: string; locale: Loc | null; before: unknown; after: unknown; issues: string[] };

const ALL_STEPS = [...STEPS, "Review"] as const;
const STEP_HELP: Record<string, string> = {
  Card: "Name and short description of the card, plus the popup title fans see when they collect it.",
  "Logged-out reveal": "What a fan who is not logged in sees after the task: the card, a title, a line and the login button.",
  "Reward and CTA": "What the card gives, how it is teased in the collection, and the button that leads to the task.",
  Engagement: "The task itself: question, login overlay, the message after answering, and the share texts.",
  Module: "The block on the page where fans meet the card.",
  Settings: "Switches. Leave the card active: a disabled card loses its link to engagement and module.",
  Review: "Everything you changed, checked against the rules. Nothing is written before you apply.",
};

const get = (v: Values, f: FieldDef, l: Loc) => (f.localized ? ((v[f.key] as LocValue | undefined)?.[l] ?? "") : (v[f.key] as string | boolean | undefined));

export default function EditCard() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<Card | null>(null);
  const [vals, setVals] = useState<Values>({});
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<{ key: string; loc: Loc } | null>(null);
  const [lang, setLang] = useState<Loc>("en");
  const [keepDe, setKeepDe] = useState<Record<string, boolean>>({});
  const [askContinue, setAskContinue] = useState<string[] | null>(null);
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

  const stepName = ALL_STEPS[step];
  const fields = FIELDS.filter((f) => f.step === stepName);

  const changes = useMemo(() => {
    if (!card) return [];
    const out: { key: string; locale?: Loc; value: string | boolean }[] = [];
    for (const f of FIELDS) {
      if (f.localized) {
        for (const l of ["en", "de"] as Loc[]) if (get(vals, f, l) !== get(card.values, f, l)) out.push({ key: f.key, locale: l, value: String(get(vals, f, l)) });
      } else if (get(vals, f, "en") !== get(card.values, f, "en")) out.push({ key: f.key, value: get(vals, f, "en") as string | boolean });
    }
    return out;
  }, [vals, card]);

  if (!card) return <div style={{ color: "var(--muted)" }}>Loading card…</div>;

  const setVal = (f: FieldDef, l: Loc, v: string | boolean) =>
    setVals((cur) => ({ ...cur, [f.key]: f.localized ? { ...((cur[f.key] as LocValue) ?? {}), [l]: String(v) } : v }));

  // EN changed, DE untouched → ask back
  const deQuestion = (f: FieldDef) => f.localized && get(vals, f, "en") !== get(card.values, f, "en") && get(vals, f, "de") === get(card.values, f, "de") && !keepDe[f.key];

  const stepIssues = (names: FieldDef[]) =>
    names.flatMap((f) => (f.localized ? [...fieldIssues(f, "en", get(vals, f, "en"), String(get(vals, f, "de"))), ...fieldIssues(f, "de", get(vals, f, "de")).map((x) => `${x} (DE)`)] : fieldIssues(f, null, get(vals, f, "en"))));

  const pick = (key: string) => {
    const s = FIELDS.find((f) => f.key === key)?.step;
    if (s) setStep(ALL_STEPS.indexOf(s as (typeof ALL_STEPS)[number]));
    setFocus({ key, loc: lang });
    setTimeout(() => document.getElementById(`field-${key}-${lang}`)?.focus(), 50);
  };

  const goNext = (force = false) => {
    const issues = [...stepIssues(fields), ...fields.filter(deQuestion).map((f) => `${f.label}: English changed, German not yet`)];
    if (issues.length && !force) {
      setAskContinue(issues);
      return;
    }
    setAskContinue(null);
    const n = Math.min(step + 1, ALL_STEPS.length - 1);
    setStep(n);
    if (ALL_STEPS[n] === "Review") void runPreview();
  };

  async function runPreview() {
    setBusy("Checking…");
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

  const summary = changes.map((c) => `${FIELDS.find((f) => f.key === c.key)?.label}${c.locale ? ` ${c.locale.toUpperCase()}` : ""}`).join(", ");

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <Link href="/teamcards" style={{ fontSize: 12, color: "var(--muted)" }}>
            ← All Team Cards
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>{card.name}</h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {card.id} · {card.status} · <a href={card.links.badge} target="_blank" rel="noreferrer">card</a>
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
            )}{" "}
            on staging
          </div>
        </div>
        <a className="btn" href={teamCardClaudeUrl(card.id)} target="_blank" rel="noreferrer">
          Ask the helper about this card ↗
        </a>
      </div>

      {/* stepper */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ALL_STEPS.map((s, i) => {
          const n = s === "Review" ? changes.length : changes.filter((c) => FIELDS.find((f) => f.key === c.key)?.step === s).length;
          return (
            <button
              key={s}
              className="btn"
              onClick={() => {
                setStep(i);
                setAskContinue(null);
                if (s === "Review") void runPreview();
              }}
              style={{ borderColor: i === step ? "var(--accent)" : undefined, color: i === step ? "var(--accent)" : undefined, padding: "6px 12px" }}
            >
              {i + 1}. {s}
              {n ? <span style={{ fontSize: 10, background: "var(--accent)", color: "#fff", borderRadius: 999, padding: "0 6px" }}>{n}</span> : null}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) 1fr", gap: 24, alignItems: "start" }}>
        {/* left: the step */}
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>{STEP_HELP[stepName]}</div>

          {stepName !== "Review" &&
            fields.map((f) => (
              <div key={f.key} style={{ display: "grid", gap: 6, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {f.label}
                  {f.maxWords ? <span style={{ fontWeight: 400, color: "var(--muted)" }}> · max {f.maxWords} words</span> : null}
                </div>
                {f.help && <div style={{ fontSize: 11, color: "var(--muted)" }}>{f.help}</div>}
                {f.localized ? (
                  (["en", "de"] as Loc[]).map((l) => {
                    const v = String(get(vals, f, l) ?? "");
                    const iss = fieldIssues(f, l, v);
                    const Tag = f.kind === "textarea" ? "textarea" : "input";
                    return (
                      <label key={l} style={{ display: "grid", gap: 3, fontSize: 11, color: "var(--muted)" }}>
                        {l === "en" ? "English" : "German"}
                        <Tag
                          id={`field-${f.key}-${l}`}
                          className="input"
                          {...(f.kind === "textarea" ? { rows: 3 } : {})}
                          value={v}
                          onFocus={() => {
                            setFocus({ key: f.key, loc: l });
                            setLang(l);
                            const sc = SCREENS.find((s) => s.fields.includes(f.key));
                            if (sc) document.getElementById(`screen-${sc.key}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                          }}
                          onChange={(e) => setVal(f, l, e.target.value)}
                        />
                        {iss.length > 0 && <span style={{ color: "#e06c5b" }}>{iss.join(" · ")}</span>}
                      </label>
                    );
                  })
                ) : f.kind === "boolean" ? (
                  <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={Boolean(get(vals, f, "en"))} onChange={(e) => setVal(f, "en", e.target.checked)} /> {f.label}
                  </label>
                ) : (
                  <select className="input" value={String(get(vals, f, "en") ?? "")} onFocus={() => setFocus({ key: f.key, loc: lang })} onChange={(e) => setVal(f, "en", e.target.value)}>
                    {(f.options ?? []).map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                )}
                {deQuestion(f) && (
                  <div style={{ fontSize: 12, background: "rgba(227,62,26,0.08)", border: "1px solid rgba(227,62,26,0.35)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
                    <div>You changed the English. Change the German too?</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn" style={{ padding: "4px 10px" }} onClick={() => document.getElementById(`field-${f.key}-de`)?.focus()}>
                        I&apos;ll write it
                      </button>
                      <a className="btn" style={{ padding: "4px 10px" }} target="_blank" rel="noreferrer" href={teamCardClaudeUrl(card.id, `Transcreate the new English "${f.label}" (key ${f.key}) into German and propose it for ${card.id}: "${get(vals, f, "en")}"`)}>
                        Let Claude translate ↗
                      </a>
                      <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setKeepDe((k) => ({ ...k, [f.key]: true }))}>
                        Keep German
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

          {stepName === "Review" && (
            <div style={{ display: "grid", gap: 12 }}>
              {busy && <div style={{ color: "var(--muted)" }}>{busy}</div>}
              {review && review.rows.length === 0 && !result && <div style={{ color: "var(--muted)" }}>No changes yet. Go back to a step and edit a text.</div>}
              {review && review.rows.length > 0 && (
                <>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--muted)" }}>
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
                            {r.locale ? ` ${r.locale.toUpperCase()}` : ""}
                            {r.issues.length > 0 && <div style={{ color: "#e06c5b" }}>{r.issues.join(" · ")}</div>}
                          </td>
                          <td style={{ padding: 6, color: "var(--muted)" }}>{String(r.before ?? "")}</td>
                          <td style={{ padding: 6 }}>{String(r.after ?? "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {review.errors.length > 0 && <div style={{ color: "#e06c5b", fontSize: 12 }}>{review.errors.join(" · ")}</div>}
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Apply writes these {review.rows.length} changes to staging (card, engagement, module) and republishes the staging page.</div>
                  <div>
                    <button className="btn btn-primary" disabled={!!busy} onClick={apply}>
                      Apply to staging
                    </button>
                  </div>
                </>
              )}
              {result && (
                <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                  {result.pushed.map((p, i) => (
                    <div key={i}>✓ {p}</div>
                  ))}
                  {result.errors.map((p, i) => (
                    <div key={i} style={{ color: "#e06c5b" }}>
                      ✗ {p}
                    </div>
                  ))}
                  <div style={{ fontWeight: 600, marginTop: 6 }}>Next steps</div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                    {card.links.page && (
                      <li>
                        <a href={card.links.page} target="_blank" rel="noreferrer">Check the module on staging ↗</a>
                      </li>
                    )}
                    <li>
                      <a href={teamCardClaudeUrl(undefined, `I just changed ${summary || "texts"} on ${card.id}. Should the same change apply to other Team Cards? Check and propose.`)} target="_blank" rel="noreferrer">
                        Apply the same change to other cards with the helper ↗
                      </a>
                    </li>
                    <li>When the client has approved: rebuild on production (comes with the publish step).</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {askContinue && (
            <div style={{ fontSize: 12, border: "1px solid rgba(227,62,26,0.35)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Before you go on, {askContinue.length} thing{askContinue.length === 1 ? "" : "s"} to check:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {askContinue.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setAskContinue(null)}>
                  Fix it
                </button>
                <button className="btn" style={{ padding: "4px 10px" }} onClick={() => goNext(true)}>
                  Continue anyway
                </button>
              </div>
            </div>
          )}

          {stepName !== "Review" && (
            <div style={{ display: "flex", gap: 8 }}>
              {step > 0 && (
                <button className="btn" onClick={() => setStep(step - 1)}>
                  Back
                </button>
              )}
              <button className="btn btn-primary" onClick={() => goNext()}>
                {ALL_STEPS[step + 1] === "Review" ? "Review changes" : `Next: ${ALL_STEPS[step + 1]}`}
              </button>
            </div>
          )}
        </div>

        {/* right: the journey */}
        <div style={{ display: "grid", gap: 10, position: "sticky", top: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600 }}>Fan journey preview</div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["en", "de"] as Loc[]).map((l) => (
                <button key={l} className="btn" style={{ padding: "4px 10px", borderColor: lang === l ? "var(--accent)" : undefined }} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Click a text in a screen to edit it. The field you are typing in is outlined in red. A sketch of the site, not a screenshot.</div>
          <JourneyPreview card={{ ...card, values: vals }} lang={lang} focus={focus?.key} onPick={pick} />
        </div>
      </div>
    </div>
  );
}
