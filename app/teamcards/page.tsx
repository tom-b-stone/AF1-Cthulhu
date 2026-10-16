"use client";

// Team Card Configurator: overview of all cards, the entry to the guided
// edit (/teamcards/[id]) and the helper (your Claude, via the connector).
import Link from "next/link";
import { useEffect, useState } from "react";
import Replace from "./Replace";
import { Table, type TableColumn } from "@/components/ui/table-editable";

type Row = {
  values: Record<string, unknown>;
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

  const load = () =>
    fetch("/api/teamcards")
      .then((r) => r.json())
      .then((j) => (j.cards ? setCards(j.cards) : setError(j.error ?? "Could not load the cards")))
      .catch(() => setError("Could not load the cards"));
  useEffect(() => {
    void load();
  }, []);

  const columns: TableColumn<Row>[] = [
    // eslint-disable-next-line @next/next/no-img-element
    { key: "img", header: "", width: "56px", cell: (c) => (c.imageUrl ? <img src={c.imageUrl} alt="" style={{ width: 36, borderRadius: 4, display: "block" }} /> : null) },
    { key: "name", header: "Card", width: "240px", sortable: true, cell: (c) => <div><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ color: "var(--muted)", fontSize: 12 }}>{c.id}</div></div> },
    { key: "id", header: "ID", width: "80px", sortable: true },
    { key: "status", header: "Status", width: "100px", sortable: true, cell: (c) => <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border-2)" }}>{c.status}</span> },
    { key: "mechanic", header: "Unlock", width: "110px", sortable: true, cell: (c) => MECH[c.mechanic ?? ""] ?? c.mechanic ?? "?" },
    { key: "rewardType", header: "Reward", width: "100px", sortable: true, cell: (c) => REWARD[c.rewardType ?? ""] ?? c.rewardType ?? "?" },
    { key: "placement", header: "Placement", width: "260px", cell: (c) => <span style={{ color: "var(--muted)", fontSize: 12 }}>{c.placement}</span> },
    { key: "updatedAt", header: "Last change", width: "170px", sortable: true, sortValue: (c) => c.log[0]?.at ?? c.updatedAt, cell: (c) => (c.log[0] ? <div style={{ fontSize: 12 }}><div>{c.log[0].summary}</div><div style={{ color: "var(--muted)" }}>{new Date(c.log[0].at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div> : null) },
    { key: "links", header: "Staging", width: "200px", cell: (c) => <span style={{ fontSize: 12, whiteSpace: "nowrap" }}><a href={c.links.badge} target="_blank" rel="noreferrer">Card ↗</a>{c.links.engagement && <> · <a href={c.links.engagement} target="_blank" rel="noreferrer">Engagement ↗</a></>}{c.links.page && <> · <a href={c.links.page} target="_blank" rel="noreferrer">Page ↗</a></>}</span> },
    { key: "edit", header: "", width: "80px", cell: (c) => <Link className="btn btn-primary" href={`/teamcards/${c.id}`}>Edit</Link> },
  ];

  return (
    <div style={{ display: "grid", gap: 24, maxWidth: 1400 }}>
      <div>
        <h1 style={{ margin: "0 0 6px" }}>Team Cards</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>Every card with its texts, journey and staging links. Open a card to edit it step by step in the real frontend views, or change wording on many cards at once with search and replace.</p>
      </div>



      {error && <div style={{ color: "#e06c5b" }}>{error}</div>}
      {!cards && !error && <div style={{ color: "var(--muted)" }}>Loading cards…</div>}
      {cards && (
        <div className="beui beui-compact">
          <Table<Row>
            data={cards}
            columns={columns}
            getRowId={(r) => r.id}
            resizable
            reorderable
            defaultSort={{ key: "id", direction: "asc" }}
            height={Math.max(360, Math.min(720, 120 + cards.length * 64))}
            rowHeight={60}
            emptyState="No cards yet."
            className="rounded-lg border border-border"
          />
        </div>
      )}
      {cards && <Replace cards={cards as never} onApplied={() => void load()} />}
    </div>
  );
}
