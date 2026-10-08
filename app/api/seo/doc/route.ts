import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSeoDoc, saveSeoDraft, publishSeo, type SeoLocaleMeta, type Collection } from "@/lib/payloadClient";
import { validateSeoField } from "@/lib/seoBrand";

function isCollection(v: string | null): v is Collection {
  return v === "news" || v === "pages";
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const collection = searchParams.get("collection");
  const id = searchParams.get("id");
  if (!isCollection(collection) || !id) {
    return NextResponse.json({ error: "collection (news|pages) and id are required" }, { status: 400 });
  }

  try {
    const doc = await getSeoDoc(collection, id);
    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load document" },
      { status: 502 }
    );
  }
}

type Body = {
  collection: Collection;
  id: string;
  action: "draft" | "publish";
  en?: SeoLocaleMeta;
  de?: SeoLocaleMeta;
  force?: boolean;
};

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  if (!isCollection(body.collection) || !body.id || !body.action) {
    return NextResponse.json({ error: "collection, id and action are required" }, { status: 400 });
  }
  if (body.action === "publish" && !body.en) {
    return NextResponse.json({ error: "EN title/description are required to publish" }, { status: 400 });
  }

  // Validate every field being written. Hard errors (em-dash, brand-mark
  // typos, over the hard length cap) block the save unless the caller
  // explicitly sets force:true after the user has seen and accepted them.
  const fieldsToCheck: Array<["title" | "description", string]> = [];
  for (const loc of ["en", "de"] as const) {
    const locale = body[loc];
    if (!locale) continue;
    fieldsToCheck.push(["title", locale.title], ["description", locale.description]);
  }
  const allErrors: string[] = [];
  for (const [kind, value] of fieldsToCheck) {
    allErrors.push(...validateSeoField(kind, value).errors);
  }
  if (allErrors.length && !body.force) {
    return NextResponse.json({ error: "validation_failed", issues: allErrors }, { status: 422 });
  }

  try {
    if (body.action === "draft") {
      await saveSeoDraft(body.collection, body.id, { en: body.en, de: body.de });
    } else {
      await publishSeo(body.collection, body.id, { en: body.en!, de: body.de });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 502 });
  }
}
