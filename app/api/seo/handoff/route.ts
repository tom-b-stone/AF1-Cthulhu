import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  cmsAdminUrlFor,
  getSeoGenerationSource,
  listSeoItems,
  type Collection,
} from "@/lib/payloadClient";
import { buildConnectorBulkPrompt, buildHandoffPrompt, claudeUrlFor, type HandoffItem } from "@/lib/seoHandoff";
import { connectorStatus } from "@/lib/connectorTokens";

function isCollection(v: string | null): v is Collection {
  return v === "news" || v === "pages";
}

// "Generate missing" without the connector: the page content has to travel
// in the URL, so it goes in rounds. With the connector there is no limit —
// Claude fetches each page itself (buildConnectorBulkPrompt).
const MISSING_BATCH_NO_CONNECTOR = 5;

function appOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

async function toHandoffItem(collection: Collection, id: string): Promise<HandoffItem> {
  const source = await getSeoGenerationSource(collection, id);
  return {
    collection,
    id,
    internalTitle: source.internalTitle,
    cmsUrl: cmsAdminUrlFor(collection, id, "en"),
    contentText: source.contentText,
  };
}

// GET /api/seo/handoff?collection=news&id=...   -> one doc
// GET /api/seo/handoff?missing=1                -> next few docs missing EN or DE
// Either way it 307-redirects to claude.ai with the prompt pre-filled, so
// the row button can be a plain link (no popup blockers, no JS).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const collection = searchParams.get("collection");
  const id = searchParams.get("id");
  const missing = searchParams.get("missing");

  try {
    let items: HandoffItem[];
    if (missing) {
      const all = await listSeoItems();
      const allMissing = all.filter((i) => !i.en.title || !i.en.description || !i.de.title || !i.de.description);
      if (allMissing.length === 0) {
        return NextResponse.json({ error: "Nothing is missing — every doc has EN and DE title/description." }, { status: 404 });
      }
      // A user with a connector token gets the no-limit prompt; Claude pulls
      // the pages itself. (If they minted a token but never added it in
      // claude.ai, Claude will have no tools and say so — the page tells them
      // where to finish the setup.)
      const email = session.user?.email ?? "";
      const { active } = email ? await connectorStatus(email) : { active: false };
      if (active) {
        return NextResponse.redirect(claudeUrlFor(buildConnectorBulkPrompt(allMissing.length, appOrigin(req))), 307);
      }
      const targets = allMissing.slice(0, MISSING_BATCH_NO_CONNECTOR);
      items = await Promise.all(targets.map((t) => toHandoffItem(t.collection, t.id)));
    } else {
      if (!isCollection(collection) || !id) {
        return NextResponse.json({ error: "collection (news|pages) and id are required" }, { status: 400 });
      }
      items = [await toHandoffItem(collection, id)];
    }

    const prompt = buildHandoffPrompt(items, appOrigin(req));
    return NextResponse.redirect(claudeUrlFor(prompt), 307);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't build the hand-off" },
      { status: 502 }
    );
  }
}
