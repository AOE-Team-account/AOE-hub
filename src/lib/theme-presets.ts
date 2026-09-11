// Ported directly from hub-prototype.html's THEMES object (sourced from
// tweakcn.com). Per project memory these 15 are already fully specified —
// don't re-derive the color values, just carry them forward.

export interface ThemePalette {
  bg: string;
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  accent: string;
  accentText: string;
}

export interface ThemeDefinition {
  font: string;
  light: ThemePalette;
  dark: ThemePalette;
}

export const DEFAULT_THEME_KEY = "default";

export const THEME_PRESETS: Record<string, ThemeDefinition> = {
  clay: {
    font: "var(--font-outfit), sans-serif",
    light: { bg: "oklch(0.9818 0.0054 95.0986)", card: "oklch(0.9665 0.0067 97.3521)", text: "oklch(0.3438 0.0269 95.7226)", textSecondary: "oklch(0.5341 0.0078 97.4503)", textMuted: "oklch(0.5341 0.0078 97.4503)", border: "oklch(0.8847 0.0069 97.3627)", accent: "oklch(0.6171 0.1375 39.0427)", accentText: "oklch(1.0000 0 0)" },
    dark: { bg: "oklch(0.2679 0.0036 106.6427)", card: "oklch(0.2928 0.0018 106.5092)", text: "oklch(0.9576 0.0027 106.4494)", textSecondary: "oklch(0.7713 0.0169 99.0657)", textMuted: "oklch(0.7713 0.0169 99.0657)", border: "oklch(0.3618 0.0101 106.8928)", accent: "oklch(0.6724 0.1308 38.7559)", accentText: "oklch(0.1908 0.0020 106.5859)" },
  },
  meadow: {
    font: "var(--font-plus-jakarta-sans), sans-serif",
    light: { bg: "oklch(0.9940 0 0)", card: "oklch(0.9940 0 0)", text: "oklch(0 0 0)", textSecondary: "oklch(0.6234 0 0)", textMuted: "oklch(0.6234 0 0)", border: "oklch(0.9300 0.0094 286.2156)", accent: "oklch(0.6411 0.0666 130.1256)", accentText: "oklch(0.9850 0.0010 106.4230)" },
    dark: { bg: "oklch(0.1173 0.0090 73.4751)", card: "oklch(0.1609 0.0115 80.9823)", text: "oklch(0.9796 0.0017 67.8026)", textSecondary: "oklch(0.6511 0.0081 80.7132)", textMuted: "oklch(0.6511 0.0081 80.7132)", border: "oklch(0.2806 0.0246 82.6847)", accent: "oklch(0.7830 0.0384 132.7370)", accentText: "oklch(0.0986 0.0063 72.5271)" },
  },
  plumcream: {
    font: "Geist, sans-serif",
    light: { bg: "oklch(0.9699 0.0113 71.8999)", card: "oklch(0.9870 0.0107 76.6004)", text: "oklch(0.4597 0.0629 289.5561)", textSecondary: "oklch(0.5768 0.0458 291.0006)", textMuted: "oklch(0.5768 0.0458 291.0006)", border: "oklch(0.8431 0.0060 333.9975)", accent: "oklch(0.4597 0.0629 289.5561)", accentText: "oklch(0.9699 0.0113 71.8999)" },
    dark: { bg: "oklch(0.2134 0.0255 291.1310)", card: "oklch(0.2413 0.0322 289.1359)", text: "oklch(0.9088 0.0299 289.9690)", textSecondary: "oklch(0.6539 0.0444 291.2325)", textMuted: "oklch(0.6539 0.0444 291.2325)", border: "oklch(0.3717 0.0358 291.0973)", accent: "oklch(0.9088 0.0299 289.9690)", accentText: "oklch(0.2134 0.0255 291.1310)" },
  },
  rose: {
    font: "var(--font-inter), system-ui, sans-serif",
    light: { bg: "oklch(0.9859 0.0076 48.6568)", card: "oklch(1.0000 0 0)", text: "oklch(0.4279 0.0265 46.6194)", textSecondary: "oklch(0.6608 0.0272 49.5764)", textMuted: "oklch(0.6608 0.0272 49.5764)", border: "oklch(0.9138 0.0146 50.7928)", accent: "oklch(0.7508 0.1610 2.6024)", accentText: "oklch(1.0000 0 0)" },
    dark: { bg: "oklch(0.1979 0.0107 39.2759)", card: "oklch(0.2379 0.0124 44.5317)", text: "oklch(0.9135 0.0123 43.2722)", textSecondary: "oklch(0.6608 0.0272 49.5764)", textMuted: "oklch(0.6608 0.0272 49.5764)", border: "oklch(0.2937 0.0152 45.3658)", accent: "oklch(0.7508 0.1610 2.6024)", accentText: "oklch(0.1979 0.0107 39.2759)" },
  },
  stone: {
    font: "'Google Sans Flex', ui-sans-serif, sans-serif, system-ui",
    light: { bg: "oklch(0.9195 0.0169 88.0030)", card: "oklch(0.9530 0.0156 86.4257)", text: "oklch(0.2350 0 0)", textSecondary: "oklch(0.4688 0.0136 84.5932)", textMuted: "oklch(0.4688 0.0136 84.5932)", border: "oklch(0.8434 0.0231 87.1621)", accent: "oklch(0.3012 0 0)", accentText: "oklch(0.9169 0.0175 99.6160)" },
    dark: { bg: "oklch(0 0 0)", card: "oklch(0.2264 0 0)", text: "oklch(0.8141 0 0)", textSecondary: "oklch(0.6348 0.0113 81.7875)", textMuted: "oklch(0.6348 0.0113 81.7875)", border: "oklch(0.1822 0 0)", accent: "oklch(0.4325 0.0376 198.3573)", accentText: "oklch(1.0000 0 0)" },
  },
  sketch: {
    font: "var(--font-architects-daughter), cursive",
    light: { bg: "oklch(0.9761 0 0)", card: "oklch(1.0000 0 0)", text: "oklch(0 0 0)", textSecondary: "oklch(0.5999 0 0)", textMuted: "oklch(0.5999 0 0)", border: "oklch(0 0 0)", accent: "oklch(0 0 0)", accentText: "oklch(1.0000 0 0)" },
    dark: { bg: "oklch(0 0 0)", card: "oklch(0.2178 0 0)", text: "oklch(0.9761 0 0)", textSecondary: "oklch(0.9761 0 0)", textMuted: "oklch(0.9761 0 0)", border: "oklch(0.9761 0 0)", accent: "oklch(0.9761 0 0)", accentText: "oklch(0 0 0)" },
  },
  amber: {
    font: "Montserrat, ui-sans-serif, sans-serif, system-ui",
    light: { bg: "oklch(1.0000 0 0)", card: "oklch(1.0000 0 0)", text: "oklch(0 0 0)", textSecondary: "oklch(0.5319 0.0413 75.9565)", textMuted: "oklch(0.5319 0.0413 75.9565)", border: "oklch(0.8978 0.0278 76.4745)", accent: "oklch(0.8512 0.1254 73.9788)", accentText: "oklch(0 0 0)" },
    dark: { bg: "oklch(0.1651 0.0141 76.6248)", card: "oklch(0.2044 0.0207 75.5143)", text: "oklch(0.9726 0.0227 76.5270)", textSecondary: "oklch(0.7409 0.0338 76.3513)", textMuted: "oklch(0.7409 0.0338 76.3513)", border: "oklch(0.3399 0.0342 75.5286)", accent: "oklch(0.8512 0.1254 73.9788)", accentText: "oklch(0.1778 0.0368 79.8490)" },
  },
  citrus: {
    font: "var(--font-quicksand), system-ui, sans-serif",
    light: { bg: "oklch(0.9926 0.0146 98.2779)", card: "oklch(1.0000 0 0)", text: "oklch(0.3211 0 0)", textSecondary: "oklch(0.5486 0 0)", textMuted: "oklch(0.5486 0 0)", border: "oklch(0.9128 0 0)", accent: "oklch(0.7116 0.1812 22.8389)", accentText: "oklch(1.0000 0 0)" },
    dark: { bg: "oklch(0.2284 0.0384 282.9324)", card: "oklch(0.2543 0.0571 266.7095)", text: "oklch(0.9551 0 0)", textSecondary: "oklch(0.7058 0 0)", textMuted: "oklch(0.7058 0 0)", border: "oklch(0.3171 0.0566 282.6916)", accent: "oklch(0.7685 0.1369 20.7298)", accentText: "oklch(0.2284 0.0384 282.9324)" },
  },
  bubblegum: {
    font: "var(--font-jua), sans-serif",
    light: { bg: "oklch(0.9873 0.0069 354.7893)", card: "oklch(1.0000 0 0)", text: "oklch(0.4015 0.0436 37.9587)", textSecondary: "oklch(0.6265 0.0418 357.7265)", textMuted: "oklch(0.6265 0.0418 357.7265)", border: "oklch(0.9366 0.0345 359.8126)", accent: "oklch(0.8502 0.0851 6.1876)", accentText: "oklch(1.0000 0 0)" },
    dark: { bg: "oklch(0.2482 0.0307 354.5794)", card: "oklch(0.3001 0.0369 357.0540)", text: "oklch(0.9678 0.0166 3.6461)", textSecondary: "oklch(0.8178 0.0293 355.5969)", textMuted: "oklch(0.8178 0.0293 355.5969)", border: "oklch(0.4074 0.0430 356.7696)", accent: "oklch(0.7716 0.1387 9.6611)", accentText: "oklch(0.2482 0.0307 354.5794)" },
  },
  marigold: {
    font: "var(--font-albert-sans), ui-sans-serif, sans-serif, system-ui",
    light: { bg: "oklch(0.9901 0.0161 95.2193)", card: "oklch(0.9901 0.0161 95.2193)", text: "oklch(0.2138 0.0019 286.2347)", textSecondary: "oklch(0.5555 0 0)", textMuted: "oklch(0.5555 0 0)", border: "oklch(0.9219 0 0)", accent: "oklch(0.8480 0.1563 82.4419)", accentText: "oklch(0.2002 0 0)" },
    dark: { bg: "oklch(0.2103 0.0059 285.8852)", card: "oklch(0.2103 0.0059 285.8852)", text: "oklch(0.9851 0 0)", textSecondary: "oklch(0.7090 0 0)", textMuted: "oklch(0.7090 0 0)", border: "oklch(0.2768 0 0)", accent: "oklch(0.8480 0.1563 82.4419)", accentText: "oklch(0 0 0)" },
  },
  brick: {
    font: "var(--font-dm-sans), sans-serif",
    light: { bg: "oklch(0.9684 0.0160 98.9931)", card: "oklch(0.9684 0.0160 98.9931)", text: "oklch(0.3800 0.0311 52.9437)", textSecondary: "oklch(0.5737 0.0551 48.3748)", textMuted: "oklch(0.5737 0.0551 48.3748)", border: "oklch(0.5737 0.0551 48.3748)", accent: "oklch(0.5665 0.1006 14.1906)", accentText: "oklch(1.0000 0 0)" },
    dark: { bg: "oklch(0.2672 0.0120 44.5837)", card: "oklch(0.3291 0.0156 50.8936)", text: "oklch(0.9684 0.0160 98.9931)", textSecondary: "oklch(0.7575 0.0380 50.8610)", textMuted: "oklch(0.7575 0.0380 50.8610)", border: "oklch(0.3800 0.0311 52.9437)", accent: "oklch(0.7391 0.0590 53.5684)", accentText: "oklch(0.2672 0.0120 44.5837)" },
  },
  harvest: {
    font: "var(--font-roboto-condensed), system-ui, sans-serif",
    light: { bg: "oklch(0.9153 0.0461 83.2827)", card: "oklch(0.8854 0.0531 83.9626)", text: "oklch(0.1997 0.0140 71.9628)", textSecondary: "oklch(0.4340 0.0345 71.8029)", textMuted: "oklch(0.4340 0.0345 71.8029)", border: "oklch(0.1997 0.0140 71.9628)", accent: "oklch(0.5930 0.1524 52.0222)", accentText: "oklch(0.9723 0.0216 83.2643)" },
    dark: { bg: "oklch(0.1149 0 0)", card: "oklch(0.1822 0 0)", text: "oklch(0.8652 0.1768 90.3816)", textSecondary: "oklch(0.7119 0.1460 84.6103)", textMuted: "oklch(0.7119 0.1460 84.6103)", border: "oklch(0.8652 0.1768 90.3816)", accent: "oklch(0.8652 0.1768 90.3816)", accentText: "oklch(0 0 0)" },
  },
  olive: {
    font: "var(--font-instrument-sans), var(--font-inter), sans-serif",
    light: { bg: "oklch(0.9885 0.0057 84.5659)", card: "oklch(0.9640 0.0082 91.4831)", text: "oklch(0.4538 0.0276 90.9045)", textSecondary: "oklch(0.6282 0.0405 90.1265)", textMuted: "oklch(0.6282 0.0405 90.1265)", border: "oklch(0.8274 0.0903 112.4121)", accent: "oklch(0.6819 0.0308 120.1873)", accentText: "oklch(0.9885 0.0057 84.5659)" },
    dark: { bg: "oklch(0.3007 0.0126 120.1308)", card: "oklch(0.3425 0.0158 122.2444)", text: "oklch(0.8967 0.1113 99.9037)", textSecondary: "oklch(0.6282 0.0405 90.1265)", textMuted: "oklch(0.6282 0.0405 90.1265)", border: "oklch(0.4254 0.0264 121.6298)", accent: "oklch(0.8274 0.0903 112.4121)", accentText: "oklch(0.3007 0.0126 120.1308)" },
  },
  espresso: {
    font: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    light: { bg: "oklch(0.9596 0.0131 82.4019)", card: "oklch(0.9773 0.0102 81.7952)", text: "oklch(0.2184 0.0079 274.5602)", textSecondary: "oklch(0.4821 0.0133 269.4066)", textMuted: "oklch(0.4821 0.0133 269.4066)", border: "oklch(0.8663 0.0168 79.3433)", accent: "oklch(0.2184 0.0079 274.5602)", accentText: "oklch(0.9596 0.0131 82.4019)" },
    dark: { bg: "oklch(0.2184 0.0079 274.5602)", card: "oklch(0.2614 0.0094 276.7359)", text: "oklch(0.9596 0.0131 82.4019)", textSecondary: "oklch(0.7333 0.0115 280.4017)", textMuted: "oklch(0.7333 0.0115 280.4017)", border: "oklch(0.3022 0.0091 276.8278)", accent: "oklch(0.9596 0.0131 82.4019)", accentText: "oklch(0.2184 0.0079 274.5602)" },
  },
  caramel: {
    font: "var(--font-manrope), ui-sans-serif, sans-serif, system-ui",
    light: { bg: "oklch(0.9760 0.0082 91.4820)", card: "oklch(0.9914 0.0098 87.4695)", text: "oklch(0.3795 0.0309 64.7091)", textSecondary: "oklch(0.5479 0.0538 71.4207)", textMuted: "oklch(0.5479 0.0538 71.4207)", border: "oklch(0.8688 0.0450 83.8927)", accent: "oklch(0.6351 0.1052 63.8590)", accentText: "oklch(1.0000 0 0)" },
    dark: { bg: "oklch(0.2246 0.0094 107.1335)", card: "oklch(0.1684 0 0)", text: "oklch(0.9280 0.0263 82.3839)", textSecondary: "oklch(0.8032 0.0335 80.9608)", textMuted: "oklch(0.8032 0.0335 80.9608)", border: "oklch(0.3796 0.0246 54.5408)", accent: "oklch(0.7369 0.0805 66.0333)", accentText: "oklch(0.2765 0.0184 59.7941)" },
  },
};

export const THEME_SWATCH_ORDER: { key: string; label: string; color: string }[] = [
  { key: "default", label: "Default", color: "#3F6B4F" },
  { key: "clay", label: "Clay", color: "oklch(0.6171 0.1375 39.0427)" },
  { key: "meadow", label: "Meadow", color: "oklch(0.6411 0.0666 130.1256)" },
  { key: "plumcream", label: "Plum Cream", color: "oklch(0.4597 0.0629 289.5561)" },
  { key: "rose", label: "Rose", color: "oklch(0.7508 0.1610 2.6024)" },
  { key: "stone", label: "Stone", color: "oklch(0.3012 0 0)" },
  { key: "sketch", label: "Sketch", color: "oklch(0 0 0)" },
  { key: "amber", label: "Amber", color: "oklch(0.8512 0.1254 73.9788)" },
  { key: "citrus", label: "Citrus", color: "oklch(0.7116 0.1812 22.8389)" },
  { key: "bubblegum", label: "Bubblegum", color: "oklch(0.8502 0.0851 6.1876)" },
  { key: "marigold", label: "Marigold", color: "oklch(0.8480 0.1563 82.4419)" },
  { key: "brick", label: "Brick", color: "oklch(0.5665 0.1006 14.1906)" },
  { key: "harvest", label: "Harvest", color: "oklch(0.5930 0.1524 52.0222)" },
  { key: "olive", label: "Olive", color: "oklch(0.6819 0.0308 120.1873)" },
  { key: "espresso", label: "Espresso", color: "oklch(0.2184 0.0079 274.5602)" },
  { key: "caramel", label: "Caramel", color: "oklch(0.6351 0.1052 63.8590)" },
];

export type TextZoom = 0.9 | 1 | 1.15 | 1.3;
export const TEXT_ZOOM_OPTIONS: TextZoom[] = [0.9, 1, 1.15, 1.3];
