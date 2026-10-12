import type { Config } from "tailwindcss";

// shadcn-style token names, mapped onto this app's existing dark palette
// (see app/globals.css). The table component and anything from the shadcn
// ecosystem reads these; the rest of the app keeps its inline styles.
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border-hsl))",
        input: "hsl(var(--border-hsl))",
        ring: "hsl(var(--accent-hsl))",
        background: "hsl(var(--bg-hsl))",
        foreground: "hsl(var(--fg-hsl))",
        primary: { DEFAULT: "hsl(var(--accent-hsl))", foreground: "#fff" },
        secondary: { DEFAULT: "hsl(var(--muted-hsl))", foreground: "hsl(var(--fg-hsl))" },
        muted: { DEFAULT: "hsl(var(--muted-hsl))", foreground: "hsl(var(--muted-fg-hsl))" },
        accent: { DEFAULT: "hsl(var(--muted-hsl))", foreground: "hsl(var(--fg-hsl))" },
        popover: { DEFAULT: "hsl(var(--popover-hsl))", foreground: "hsl(var(--fg-hsl))" },
        card: { DEFAULT: "hsl(var(--popover-hsl))", foreground: "hsl(var(--fg-hsl))" },
        destructive: { DEFAULT: "#c0392b", foreground: "#fff" },
      },
      borderRadius: { lg: "8px", md: "6px", sm: "4px" },
    },
  },
  plugins: [],
  // Keep the rest of the app (inline styles) untouched by Tailwind's reset.
  corePlugins: { preflight: false },
};
export default config;
