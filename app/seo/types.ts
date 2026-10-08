export type SeoLocaleMeta = { title: string; description: string };

export type SeoListItem = {
  id: string;
  collection: "news" | "pages";
  internalTitle: string;
  slug: string;
  status: "published" | "draft";
  publishedDate: string | null;
  urls: { en: string; de: string };
  en: SeoLocaleMeta;
  de: SeoLocaleMeta;
};
