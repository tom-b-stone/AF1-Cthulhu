import { listMediaFolders } from "./payloadClient";

// Race calendar from the CMS (`race-weekend` collection) joined with the
// media folders that already exist for each round, so the uploader can
// offer "Grand Prix → folder" as one choice. Location codes follow the
// folders that exist; for a round without a folder yet, this map.
const LOC_BY_COUNTRY: Record<string, string> = {
  australia: "AUS", china: "CHN", japan: "JPN", bahrain: "BHR", "saudi arabia": "SAU", "united states": "USA", canada: "CAN",
  monaco: "MCO", spain: "ESP", england: "GBR", austria: "AUT", "united kingdom": "GBR", "great britain": "GBR", belgium: "BEL", hungary: "HUN",
  netherlands: "NED", italy: "ITA", azerbaijan: "AZE", singapore: "SIN", mexico: "MEX", brazil: "BRA", qatar: "QAT",
  "united arab emirates": "UAE", malaysia: "MYS",
};
const LOC_BY_CITY: Record<string, string> = { miami: "MIA", "las vegas": "LAS", austin: "USA", barcelona: "BCN", madrid: "ESP" };

export type Race = {
  round: number;
  label: string; // "R14 · Spain · Madrid"
  title: string;
  country: string;
  city: string;
  start?: string;
  end?: string;
  loc: string;
  year: number;
  folderId?: string;
  folderPath?: string;
  sessions: { id: string; name: string; folderPath: string }[];
};

let cache: { at: number; races: Race[] } | null = null;

// The calendar is read from the production site (public, read-only: it is
// what audif1.com/races shows), because staging only carries a few test
// rounds. Folders are read from the CMS the tool writes to (staging), and
// the production folder names are the convention we follow.
const PROD_API = process.env.PRODUCTION_CMS_API_URL ?? "https://www.audif1.com/cms/api";

export async function listRaces(payloadFetch: (p: string) => Promise<Response>): Promise<Race[]> {
  if (cache && Date.now() - cache.at < 15 * 60_000) return cache.races;
  let docs: Record<string, unknown>[] = [];
  try {
    const prod = await fetch(`${PROD_API}/race-weekend?limit=60&depth=0`, { cache: "no-store" });
    if (prod.ok) docs = ((await prod.json()) as { docs: Record<string, unknown>[] }).docs;
  } catch {
    /* fall back to staging */
  }
  if (docs.length === 0) {
    const res = await payloadFetch(`/race-weekend?limit=60&depth=0`);
    if (!res.ok) throw new Error(`race-weekend failed (${res.status})`);
    docs = ((await res.json()) as { docs: Record<string, unknown>[] }).docs;
  }
  const json = { docs };
  const folders = await listMediaFolders();
  const galleries = folders.filter((f) => f.path.startsWith("10_Media-Galleries/"));

  const races: Race[] = [];
  for (const d of json.docs) {
    const sub = String(d.subtitle ?? "");
    const m = sub.match(/R(\d{1,2})/i);
    if (!m) continue;
    const round = Number(m[1]);
    const country = String(d.countryName ?? d.title ?? "");
    const city = String(d.cityName ?? "");
    const start = typeof d.raceStartDate === "string" ? d.raceStartDate : undefined;
    const year = start ? Number(start.slice(0, 4)) : new Date().getFullYear();
    // existing round folder: 10_Media-Galleries/<year>_R14_... or R14_...
    const rx = new RegExp(`^10_Media-Galleries/(?:${year}_)?R0?${round}_([A-Z]{2,4})[-_]`, "i");
    const roundFolder = galleries.find((f) => rx.test(f.path) && f.path.split("/").length === 2);
    const locFromFolder = roundFolder ? roundFolder.path.match(rx)?.[1]?.toUpperCase() : undefined;
    const loc = locFromFolder ?? LOC_BY_CITY[city.toLowerCase()] ?? LOC_BY_COUNTRY[country.toLowerCase()] ?? country.slice(0, 3).toUpperCase();
    const sessions = roundFolder
      ? galleries.filter((f) => f.path.startsWith(roundFolder.path + "/") && f.path.split("/").length === 3).map((f) => ({ id: f.id, name: f.name, folderPath: f.path }))
      : [];
    races.push({
      round,
      label: `R${String(round).padStart(2, "0")} · ${country}${city && city !== country ? ` · ${city}` : ""}`,
      title: String(d.title ?? country),
      country,
      city,
      start,
      end: typeof d.raceEndDate === "string" ? d.raceEndDate : undefined,
      loc,
      year,
      folderId: roundFolder?.id,
      folderPath: roundFolder?.path,
      sessions,
    });
  }
  races.sort((a, b) => a.round - b.round);
  cache = { at: Date.now(), races };
  return races;
}
