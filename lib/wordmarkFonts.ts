// Curated Google Fonts for the home wordmark (one per letter, re-rolled per load).
export const WORDMARK_FONTS = [
  "Anton", "Bebas Neue", "Bungee", "Monoton", "Orbitron", "Press Start 2P", "Rubik Mono One", "Russo One",
  "Syncopate", "Unbounded", "Zen Dots", "Audiowide", "Black Ops One", "Bungee Shade", "Faster One", "Righteous",
  "Major Mono Display", "Michroma", "Space Mono", "Silkscreen", "VT323", "DotGothic16", "Tourney", "Sixtyfour",
  "Rubik Glitch", "Rubik Iso", "Nabla", "Monofett", "Bungee Outline", "Chakra Petch", "Teko", "Oswald",
  "Abril Fatface", "Playfair Display", "Fahkwang", "Archivo Black", "Alfa Slab One", "Cinzel", "Lilita One", "Fredoka",
];

export function wordmarkFontsHref(): string {
  const fams = WORDMARK_FONTS.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`).join("&");
  return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
}

