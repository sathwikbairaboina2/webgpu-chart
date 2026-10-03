export interface Theme {
  /** Plot background, "#rrggbb" (the WebGPU clear color needs hex). */
  background: string;
  grid: string;
  axisText: string;
  font: string;
}

export const THEMES: Record<"dark" | "light", Theme> = {
  dark: {
    background: "#0d1014",
    grid: "rgba(255,255,255,0.07)",
    axisText: "#8b95a3",
    font: "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  light: {
    background: "#fbfbfa",
    grid: "rgba(0,0,0,0.07)",
    axisText: "#5b6472",
    font: "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
};
