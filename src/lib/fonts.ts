import {
  Lora,
  Inter,
  Outfit,
  Plus_Jakarta_Sans,
  Architects_Daughter,
  Cormorant_Garamond,
  Quicksand,
  Jua,
  DM_Serif_Display,
  DM_Sans,
  Roboto_Condensed,
  Instrument_Sans,
  Source_Serif_4,
  Albert_Sans,
  Manrope,
} from "next/font/google";

// One CSS variable per font. Used by the default theme (Lora/Inter) and by
// the 15 alternate themes in theme-presets.ts, ported from hub-prototype.html.
// A few fonts referenced there (Geist, "Google Sans Flex", Montserrat) were
// never actually loaded in the prototype either — they fall back to system
// fonts by design, so they're intentionally not added here.

export const lora = Lora({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-lora" });
export const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter" });
export const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-outfit" });
export const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plus-jakarta-sans" });
export const architectsDaughter = Architects_Daughter({ subsets: ["latin"], weight: ["400"], variable: "--font-architects-daughter" });
export const cormorantGaramond = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-cormorant-garamond" });
export const quicksand = Quicksand({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-quicksand" });
export const jua = Jua({ subsets: ["latin"], weight: ["400"], variable: "--font-jua" });
export const dmSerifDisplay = DM_Serif_Display({ subsets: ["latin"], weight: ["400"], variable: "--font-dm-serif-display" });
export const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-dm-sans" });
export const robotoCondensed = Roboto_Condensed({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-roboto-condensed" });
export const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-instrument-sans" });
export const sourceSerif4 = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-source-serif-4" });
export const albertSans = Albert_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-albert-sans" });
export const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-manrope" });

export const allFontVariables = [
  lora.variable,
  inter.variable,
  outfit.variable,
  plusJakartaSans.variable,
  architectsDaughter.variable,
  cormorantGaramond.variable,
  quicksand.variable,
  jua.variable,
  dmSerifDisplay.variable,
  dmSans.variable,
  robotoCondensed.variable,
  instrumentSans.variable,
  sourceSerif4.variable,
  albertSans.variable,
  manrope.variable,
].join(" ");
