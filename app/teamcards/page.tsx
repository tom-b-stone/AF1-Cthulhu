"use client";

// Team Card Configurator: overview of all cards, the entry to the guided
// edit (/teamcards/[id]) and the helper (your Claude, via the connector).
import Link from "next/link";
import { useEffect, useState } from "react";
import { teamCardClaudeUrl } from "@/lib/teamCardHandoff";

type Row = {
  id: string;
  name: string;
  status: string;
  mechanic?: string;
  rewardType?: string;
  placement?: string;
  imageUrl?: string;
  updatedAt: string;
  log: { at: string; by: string; summary: string }[];
  links: { badge: string; engagement?: string; page?: string };
};

const MECH: Record<string, string> = { "q-and-a": "Q&A", survey: "Survey", "hot-or-not": "Hot or Not", page: "Page visit", link: "Link" };
const REWARD: Record<string, string> = { noReward: "No reward", raffleSignup: "Raffle", couponCode: "Voucher" };

export default function Page() {
  const [cards, setCards] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wish, setWish] = useState("");

  useEffect(() => {
    fetch("/api/teamcards")
      .then((r) => r.json())
      .then((j) => (j.cards ? setCards(j.cards) : setError(j.error ?? "Could not load the cards")))
      .catch(() => setError("Could not load the cards"));
  }, []);

  return (
    <div style={{ display: "grid", gap: 24, maxWidth: 1100 }}>
      <div>
        <h1 style={{ margin: "0 0 6px" }}>Team Cards</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>Every card with its texts, journey and staging links. Edit a card step by step, or ask the helper for questions and changes across cards.</p>
      </div>

      <section style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "grid", gap: 10, background: "var(--surface)" }}>
        <div style={{ fontWeight: 600 }}>Helper</div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Ask a question or describe a change, for one card or many (&ldquo;in all Team Card modules, change the category to …&rdquo;). Your Claude asks back (which cards, English and German?), shows a before/after table, and only writes to staging after your OK.
        </div>
        <textarea className="input" rows={3} placeholder="e.g. Shorten every reward teaser to one sentence" value={wish} onChange={(e) => setWish(e.target.value)} />
        <div>
          <a className="btn btn-primary" href={teamCardClaudeUrl(undefined, wish.trim() || undefined)} target="_blank" rel="noreferrer">
            Ask the helper ↗
          </a>
          <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 10 }}>Opens your Claude with the AF1 Tools connector.</span>
        </div>
      </section>

      {error && <div style={{ color: "#e06c5b" }}>{error}</div>}
      {!cards && !error && <div style={{ color: "var(--muted)" }}>Loading cards…</div>}
      {cards && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {["", "Card", "Status", "Unlock", "Reward", "Placement", "Last change", "Staging", ""].map((h, i) => (
                  <th key={i} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                  <td style={{ padding: 10, width: 56 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.imageUrl ? <img src={c.imageUrl} alt="" style={{ width: 44, borderRadius: 4, display: "block" }} /> : null}
                  </td>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{c.id}</div>
                  </td>
                  <td style={{ padding: 10 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border-2)" }}>{c.status}</span>
                  </td>
                  <td style={{ padding: 10 }}>{MECH[c.mechanic ?? ""] ?? c.mechanic ?? "?"}</td>
                  <td style={{ padding: 10 }}>{REWARD[c.rewardType ?? ""] ?? c.rewardType ?? "?"}</td>
                  <td style={{ padding: 10, color: "var(--muted)", fontSize: 12, maxWidth: 260 }}>{c.placement}</td>
                  <td style={{ padding: 10, fontSize: 12 }}>
                    {c.log[0] ? (
                      <>
                        <div>{c.log[0].summary}</div>
                        <div style={{ color: "var(--muted)" }}>{new Date(c.log[0].at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      </>
                    ) : null}
                  </td>
                  <td style={{ padding: 10, fontSize: 12, whiteSpace: "nowrap" }}>
                    <a href={c.links.badge} target="_blank" rel="noreferrer">Card ↗</a>
                    {c.links.engagement && (
                      <>
                        {" · "}
                        <a href={c.links.engagement} target="_blank" rel="noreferrer">Engagement ↗</a>
                      </>
                    )}
                    {c.links.page && (
                      <>
                        {" · "}
                        <a href={c.links.page} target="_blank" rel="noreferrer">Page ↗</a>
                      </>
                    )}
                  </td>
                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                    <Link className="btn btn-primary" href={`/teamcards/${c.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
