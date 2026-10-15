// GP Mini-Zine fan page on the staging CMS: the block layout, built from the
// blocks audif1.com already uses (hero, teaser, carousel, call-to-action
// with link buttons, share-to-button-list). Pure data, no I/O, so the
// publish route and one-off scripts produce the same page.

export type ZineMeta = {
  slug: string; // "2026-chn"
  gpName: string; // "Chinese Grand Prix"
  city: string; // "Shanghai"
  loc: string; // "CHN"
  year: number;
  dateLabel: string;
  hashtags: string[]; // ["#ARF1", "#ChineseGP"]
  instagram: string; // handle without @
};

export type ZineAssets = { teaser: string; steps: string[] }; // media ids

export type ZineIds = { coverMedia: string; pdfUrl: string; pageUrl: string; teamCardsUrl?: string };

export const ZINE_STEPS: { headline: string; copy: string }[] = [
  { headline: "Print both sheets", copy: "A4, landscape, actual size (100 %). Single-sided, any printer will do." },
  { headline: "Fold lengthwise", copy: "Fold each sheet in half along the long side, crease well, then open it again." },
  { headline: "Fold eight panels", copy: "Fold it into eight equal panels and open it flat again. The creases do the work later." },
  { headline: "One cut", copy: "Fold it in half along the short side and cut only the red dashed line in the middle." },
  { headline: "Push together", copy: "Fold along the long side again, hold both ends and push them towards the centre." },
  { headline: "Flatten it", copy: "The cut opens into a cross. Fold the pages around it until you hold a little book." },
  { headline: "Nest and staple", copy: "Open sheet 1 at its centre, slide sheet 2 inside and staple the spine if you like." },
  { headline: "Make it yours", copy: "Colour in the cover, scan the code on the back and share your zine." },
];

const btn = (label: string, target: { url: string } | { anchor: string }, variant: "primary" | "secondary" | "quaternary" = "primary", newTab = false) => ({
  blockType: "link-button",
  appearance: { variant, size: "sm", hug: true },
  label,
  iconPlacement: "after",
  ...("url" in target ? { linkType: "external", url: target.url } : { linkType: "anchor", anchor: target.anchor }),
  openNewTab: newTab,
});

export function zinePageTitle(m: ZineMeta) {
  return `GP Mini-Zine | ${m.gpName} ${m.year}`;
}

export function zinePageSlug(m: ZineMeta) {
  return `gp-mini-zine-${m.slug}`;
}

export function buildZineSections(m: ZineMeta, a: ZineAssets | null, ids: ZineIds) {
  const tags = m.hashtags.join(" ");
  const teamCards = ids.teamCardsUrl ?? "https://www.audif1.com/en/app/profile";
  return [
    {
      blockType: "hero",
      category: "GP Mini-Zine",
      headline: `Your ${m.city} weekend. In your pocket.`,
      subline: `${m.gpName} ${m.year}`,
      copy: "Thirteen moments from the race weekend, picked by the team. Print it, fold it, colour in the cover and make it yours.",
      ctas: [btn("Get your zine", { anchor: "#download" })],
      container: {
        contentPosition: "bottom",
        horizontalPosition: "left",
        size: "large",
        background: { type: "image", imageSettings: { media: ids.coverMedia, shouldHaveOverlay: true, bgColor: "graphite" } },
      },
      authRequirement: "PUBLIC",
    },
    {
      blockType: "teaser",
      headline: "Print. Cut. Fold.",
      copy: "Two A4 sheets, one cut each and a few folds: that is all it takes. The sheets nest into a 16-page zine with thirteen photos from the Grand Prix, a cover to colour in and a code on the back to share it.",
      ...(a ? { image: a.teaser } : {}),
      oriontation: "ltr",
      size: "large",
      ctas: [btn("See how it works", { anchor: "#how-to" }, "secondary")],
      children: [],
      authRequirement: "PUBLIC",
    },
    {
      blockType: "teaser",
      headline: "Made by the team. Finished by you.",
      copy: `The cover is a line drawing, ready for your pens, stickers and race-day notes. Leave it clean or turn it into a one-off. Every Grand Prix gets its own zine, so the season can grow on your shelf, one race at a time.`,
      image: ids.coverMedia,
      oriontation: "ltr",
      size: "large",
      ctas: [],
      children: [],
      authRequirement: "PUBLIC",
    },
    {
      blockType: "carousel",
      category: "How it works",
      headline: "Eight steps. Ten minutes.",
      copy: "You need a printer, scissors and a stapler if you want one. Glue is optional.",
      hasControls: true,
      aspectRatio: "aspect-square",
      ctas: [],
      carouselItems: ZINE_STEPS.map((s, i) => ({
        carouselImage: {
          ...(a?.steps[i] ? { imagePreview: a.steps[i] } : {}),
          shouldHaveOverlay: false,
          security: "public",
          ctas: [],
          hasFullScreenMode: false,
          isSameAsFullScreen: true,
          subline: `STEP ${String(i + 1).padStart(2, "0")}`,
          headline: s.headline,
          copy: s.copy,
          contentCtas: i === 0 ? [btn("Download the zine", { url: ids.pdfUrl }, "secondary", true)] : [],
          links: [],
        },
      })),
      anchorId: "how-to",
      authRequirement: "PUBLIC",
    },
    {
      blockType: "call-to-action",
      category: "Audi Revolut F1® Team Cards",
      headline: "Download the zine. Collect the Team Card.",
      copy: `Sign in, download your ${m.city} GP Mini-Zine and unlock the ${m.loc} Zine Team Card for your collection.`,
      ctas: [btn("Download the zine (PDF)", { url: ids.pdfUrl }, "primary", true), btn("See your Team Cards", { url: teamCards }, "secondary")],
      container: {
        contentPosition: "center",
        size: "boxed",
        background: { type: "image", imageSettings: { media: ids.coverMedia, shouldHaveOverlay: true, bgColor: "graphite" } },
      },
      children: [],
      anchorId: "download",
      authRequirement: "PUBLIC",
    },
    {
      blockType: "call-to-action",
      category: "Share",
      headline: "Show us your zine.",
      copy: `Post a photo of your finished zine, tag @${m.instagram} and use ${tags}. Or send this page to the friend who never misses a race.`,
      ctas: [],
      container: {
        contentPosition: "center",
        size: "fit",
        background: { type: "color", color: "chalk", imageSettings: { shouldHaveOverlay: false, bgColor: "graphite" } },
      },
      children: [
        {
          blockType: "share-to-button-list",
          variant: "tertiary",
          url: ids.pageUrl,
          shareMessage: `My ${m.city} GP Mini-Zine from the Audi Revolut F1® Team: thirteen photos from the ${m.gpName} to print, fold and colour in. ${tags}`,
          shareButtons: ["whatsapp", "facebook", "twitter", "copy"].map((social) => ({ shareButton: { social } })),
        },
      ],
      anchorId: "share",
      authRequirement: "PUBLIC",
    },
  ];
}

export function buildZineMeta(m: ZineMeta, coverMedia: string) {
  return {
    title: `${m.gpName} ${m.year} GP Mini-Zine | Audi Revolut F1® Team`,
    description: `Print, fold and colour in your own GP Mini-Zine of the ${m.gpName} ${m.year}: thirteen moments from the Audi Revolut F1® Team weekend.`,
    image: coverMedia,
  };
}
