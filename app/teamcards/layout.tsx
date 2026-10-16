import FigmaSyncBanner from "./FigmaSyncBanner";

export default function TeamCardsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FigmaSyncBanner />
    </>
  );
}
