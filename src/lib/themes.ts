export type ThemeId = "ink" | "dusk" | "paper";
export type PaletteId = "cortex" | "lava" | "ocean" | "mono";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "ink", label: "Ink" },
  { id: "dusk", label: "Dusk" },
  { id: "paper", label: "Paper" },
];

export const PALETTES: { id: PaletteId; label: string; colors: string[] }[] = [
  {
    id: "cortex",
    label: "Cortex",
    colors: ["#ff5a5a", "#5ec8ff", "#ff9a4a", "#c084fc", "#f0c36a", "#fb7185", "#a3e635", "#2dd4bf", "#60a5fa", "#f472b6"],
  },
  {
    id: "lava",
    label: "Lava",
    colors: ["#ff4d00", "#ff7a18", "#ffb020", "#ff5c5c", "#c43c3c", "#ff9f43", "#e17055", "#fdcb6e"],
  },
  {
    id: "ocean",
    label: "Ocean",
    colors: ["#00b3b8", "#0e7b82", "#38bdf8", "#22d3ee", "#818cf8", "#34d399", "#67e8f9", "#a5b4fc"],
  },
  {
    id: "mono",
    label: "Mono",
    colors: ["#e8f0f2", "#c5d0d5", "#8a9aa3", "#5ee7ea", "#00b3b8", "#9aa8b0", "#d1d9de", "#6b7c85"],
  },
];

const THEME_VARS: Record<ThemeId, Record<string, string>> = {
  ink: {
    "--bg": "#0b0f14",
    "--surface": "#1b2430",
    "--ink": "#e8f0f2",
    "--muted": "#8a9aa3",
    "--panel": "rgba(27, 36, 48, 0.82)",
    "--cortex": "#00b3b8",
    "--line": "rgba(0, 179, 184, 0.22)",
  },
  dusk: {
    "--bg": "#120f18",
    "--surface": "#1e1830",
    "--ink": "#f0e8ff",
    "--muted": "#9b8fb0",
    "--panel": "rgba(30, 24, 48, 0.88)",
    "--cortex": "#a78bfa",
    "--line": "rgba(167, 139, 250, 0.25)",
  },
  paper: {
    "--bg": "#efe8df",
    "--surface": "#f7f1ea",
    "--ink": "#1a2228",
    "--muted": "#5c6b73",
    "--panel": "rgba(247, 241, 234, 0.92)",
    "--cortex": "#0e7b82",
    "--line": "rgba(14, 123, 130, 0.25)",
  },
};

let activePalette: string[] = PALETTES[0].colors;

export function getDataPalette(): string[] {
  return activePalette;
}

export function setDataPalette(id: PaletteId) {
  activePalette = PALETTES.find((p) => p.id === id)?.colors ?? PALETTES[0].colors;
}

export function applyTheme(id: ThemeId) {
  const vars = THEME_VARS[id] ?? THEME_VARS.ink;
  const root = document.documentElement;
  root.setAttribute("data-theme", id);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}
