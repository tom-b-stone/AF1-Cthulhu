"use client";

// The fan journey of one Team Card as a row of small screens, drawn from the
// values being edited, so every change shows where it lands. The field in
// focus is outlined on every screen that shows it. Steps the card does not
// use (raffle, voucher) stay visible, greyed, so the whole journey reads.
import type { CSSProperties, ReactNode } from "react";

type V = Record<string, { en?: string; de?: string } | string | boolean | undefined>;

export type JourneyCard = { id: string; name: string; imageUrl?: string; mechanic?: string; rewardType?: string; values: V };

const C = { chalk: "#F5F2F2", graphite: "#2B2929", lava: "#E33E1A", grey: "#E6E2E2", mute: "#7A7575" };

export const SCREENS: { key: string; title: string; fields: string[]; note: string }[] = [
  { key: "module", title: "1 · Module on the page", fields: ["modCategory", "modHeadline", "modSubline", "modCopy", "modBackground"], note: "Where the fan meets the card" },
  { key: "engagement", title: "2 · Engagement", fields: ["question", "submitLabel"], note: "The task that unlocks it" },
  { key: "overlay", title: "3 · Logged out: log in", fields: ["overlayTitle", "overlaySubtitle"], note: "After answering, without login" },
  { key: "reveal", title: "4 · Logged-out reveal", fields: ["revealTitle", "revealDescription", "revealButton"], note: "The card shows before login" },
  { key: "post", title: "5 · Logged in: answer sent", fields: ["postTitle", "postMessage"], note: "Logged-in fans skip 3 and 4" },
  { key: "collected", title: "6 · Card collected", fields: ["badgePopupTitle", "publicTitle", "rewardDescription"], note: "Popup after collecting" },
  { key: "raffle", title: "7 · Raffle", fields: [], note: "Reward type raffle" },
  { key: "voucher", title: "8 · Voucher", fields: [], note: "Reward type coupon code" },
  { key: "unearned", title: "9 · Collection: not earned", fields: ["publicTitle", "rewardTeaser", "ctaLabel", "ctaA11y"], note: "In the profile before unlocking" },
  { key: "earned", title: "10 · Collection: earned", fields: ["publicTitle", "description"], note: "In the profile afterwards" },
  { key: "share", title: "11 · Share", fields: ["shareTitle", "shareText"], note: "Share sheet of the engagement" },
  { key: "next", title: "12 · Next card", fields: [], note: "What comes next" },
];

export default function JourneyPreview({ card, lang, focus, onPick, next }: { card: JourneyCard; lang: "en" | "de"; focus?: string; onPick?: (fieldKey: string) => void; next?: JourneyCard }) {
  const t = (k: string): string => {
    const v = card.values[k];
    if (v && typeof v === "object") return (v[lang] ?? "") || "";
    return typeof v === "string" ? v : "";
  };
  // a text that sits on a screen: outlined when in focus, click to edit
  const F = ({ k, style, ph }: { k: string; style?: CSSProperties; ph?: string }) => {
    const val = t(k);
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          onPick?.(k);
        }}
        title={`Edit: ${k}`}
        style={{
          display: "block",
          cursor: onPick ? "pointer" : "default",
          outline: focus === k ? `2px solid ${C.lava}` : "none",
          outlineOffset: 2,
          borderRadius: 3,
          whiteSpace: "pre-line",
          opacity: val ? 1 : 0.45,
          ...style,
        }}
      >
        {val || ph || `(${k} empty)`}
      </span>
    );
  };
  const img = card.imageUrl;
  const Card = ({ w = 92, dim = false }: { w?: number; dim?: boolean }) =>
    img ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={img} alt="" style={{ width: w, borderRadius: 8, display: "block", filter: dim ? "grayscale(1) opacity(0.5)" : undefined }} />
    ) : (
      <div style={{ width: w, height: w * 1.25, borderRadius: 8, background: C.grey }} />
    );
  const Btn = ({ k, dark = true }: { k: string; dark?: boolean }) => (
    <span style={{ display: "inline-block", marginTop: 8, padding: "5px 10px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: dark ? C.graphite : "transparent", color: dark ? "#fff" : C.graphite, border: `1px solid ${C.graphite}` }}>
      <F k={k} />
    </span>
  );
  const bg = (t("modBackground") || "grey-01") === "graphite" ? C.graphite : (t("modBackground") || "") === "chalk" ? C.chalk : "#ECE8E8";
  const fg = bg === C.graphite ? "#fff" : C.graphite;
  const reward = card.rewardType ?? "noReward";

  const screens: Record<string, ReactNode> = {
    module: (
      <div style={{ background: bg, color: fg, padding: 12, height: "100%" }}>
        <F k="modCategory" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7 }} />
        <F k="modHeadline" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.15, marginTop: 6 }} />
        <F k="modSubline" ph=" " style={{ fontSize: 11, marginTop: 4 }} />
        <F k="modCopy" style={{ fontSize: 10, lineHeight: 1.4, marginTop: 6 }} />
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <Card w={52} />
          <div style={{ fontSize: 9, opacity: 0.7 }}>+ engagement box below</div>
        </div>
      </div>
    ),
    engagement: (
      <div style={{ background: "#fff", padding: 12, height: "100%" }}>
        <div style={{ fontSize: 9, color: C.mute }}>{card.mechanic === "q-and-a" ? "Q&A" : card.mechanic ?? "Engagement"}</div>
        <F k="question" style={{ fontSize: 13, fontWeight: 700, marginTop: 6, lineHeight: 1.25 }} />
        <div style={{ marginTop: 10, height: 48, border: `1px solid ${C.grey}`, borderRadius: 6, fontSize: 9, color: C.mute, padding: 6 }}>{lang === "de" ? "Deine Antwort …" : "Your answer …"}</div>
        <Btn k="submitLabel" />
      </div>
    ),
    overlay: (
      <div style={{ background: "rgba(43,41,41,0.85)", color: "#fff", padding: 14, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <F k="overlayTitle" style={{ fontSize: 14, fontWeight: 700 }} />
        <F k="overlaySubtitle" style={{ fontSize: 10, marginTop: 6, lineHeight: 1.4 }} />
        <span style={{ marginTop: 10, fontSize: 10, background: "#fff", color: C.graphite, borderRadius: 999, padding: "5px 10px", alignSelf: "flex-start", fontWeight: 600 }}>{lang === "de" ? "Anmelden" : "Log in"}</span>
      </div>
    ),
    reveal: (
      <div style={{ background: C.graphite, color: "#fff", padding: 12, height: "100%", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Card w={70} />
        </div>
        <F k="revealTitle" style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }} />
        <F k="revealDescription" style={{ fontSize: 10, marginTop: 4 }} />
        <span style={{ display: "inline-block", marginTop: 8, padding: "5px 10px", borderRadius: 999, fontSize: 10, background: C.lava, color: "#fff", fontWeight: 600 }}>
          <F k="revealButton" />
        </span>
      </div>
    ),
    post: (
      <div style={{ background: "#fff", padding: 12, height: "100%" }}>
        <div style={{ fontSize: 18 }}>✓</div>
        <F k="postTitle" style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }} />
        <F k="postMessage" style={{ fontSize: 10, marginTop: 6, lineHeight: 1.4 }} />
      </div>
    ),
    collected: (
      <div style={{ background: C.chalk, padding: 12, height: "100%", textAlign: "center" }}>
        <F k="badgePopupTitle" style={{ fontSize: 11, fontWeight: 700 }} />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
          <Card w={74} />
        </div>
        <F k="publicTitle" style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }} />
        <F k="rewardDescription" style={{ fontSize: 10, marginTop: 4 }} />
      </div>
    ),
    raffle: reward === "raffleSignup" ? <div style={{ padding: 12, fontSize: 11 }}>Raffle sign-up form (fields come with the raffle step)</div> : <Unused text={`Not used: this card has reward "${reward}"`} />,
    voucher: reward === "couponCode" ? <div style={{ padding: 12, fontSize: 11 }}>Voucher code screen</div> : <Unused text={`Not used: this card has reward "${reward}"`} />,
    unearned: (
      <div style={{ background: "#fff", padding: 12, height: "100%" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Card w={56} dim />
          <div>
            <F k="publicTitle" style={{ fontSize: 11, fontWeight: 700 }} />
            <F k="rewardTeaser" style={{ fontSize: 9, marginTop: 4, lineHeight: 1.35 }} />
          </div>
        </div>
        <Btn k="ctaLabel" />
        <div style={{ fontSize: 8, color: C.mute, marginTop: 6 }}>
          Screen reader: <F k="ctaA11y" style={{ display: "inline" }} />
        </div>
      </div>
    ),
    earned: (
      <div style={{ background: "#fff", padding: 12, height: "100%" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Card w={56} />
          <div>
            <F k="publicTitle" style={{ fontSize: 11, fontWeight: 700 }} />
            <F k="description" style={{ fontSize: 9, marginTop: 4, lineHeight: 1.35 }} />
          </div>
        </div>
      </div>
    ),
    share: (
      <div style={{ background: "#fff", padding: 12, height: "100%" }}>
        <div style={{ fontSize: 9, color: C.mute }}>WhatsApp · X · Copy link</div>
        <F k="shareTitle" style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }} />
        <F k="shareText" style={{ fontSize: 9, marginTop: 4, lineHeight: 1.35 }} />
      </div>
    ),
    next: next ? (
      <div style={{ background: C.chalk, padding: 12, height: "100%" }}>
        <div style={{ fontSize: 9, color: C.mute }}>{lang === "de" ? "Nächste Team Card" : "Next Team Card"}</div>
        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>{next.name}</div>
      </div>
    ) : (
      <Unused text="No next card linked yet. Will come from the collection order." />
    ),
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(176px, 1fr))", gap: 12 }}>
      {SCREENS.map((s) => {
        const active = !!focus && s.fields.includes(focus);
        return (
          <div key={s.key} id={`screen-${s.key}`} style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: active ? "var(--accent)" : "var(--fg)" }}>{s.title}</div>
            <div style={{ height: 236, borderRadius: 12, overflow: "hidden", border: `${active ? 2 : 1}px solid ${active ? C.lava : "var(--border)"}`, background: "#fff", color: C.graphite, fontFamily: "var(--font-heading)" }}>{screens[s.key]}</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{s.note}</div>
          </div>
        );
      })}
    </div>
  );
}

function Unused({ text }: { text: string }) {
  return <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 12, textAlign: "center", fontSize: 10, color: "#9a9595", background: "repeating-linear-gradient(45deg,#faf9f9,#faf9f9 8px,#f1eeee 8px,#f1eeee 16px)" }}>{text}</div>;
}
