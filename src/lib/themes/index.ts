import aura from "./aura.json";
import ayu from "./ayu.json";
import catppuccinFrappe from "./catppuccin-frappe.json";
import catppuccinLatte from "./catppuccin-latte.json";
import catppuccinMocha from "./catppuccin-mocha.json";
import cobalt2 from "./cobalt2.json";
import cursor from "./cursor.json";
import dracula from "./dracula.json";
import everforest from "./everforest.json";
import flexoki from "./flexoki.json";
import github from "./github.json";
import gruvbox from "./gruvbox.json";
import kanagawa from "./kanagawa.json";
import lucentOrng from "./lucent-orng.json";
import material from "./material.json";
import matrix from "./matrix.json";
import mercury from "./mercury.json";
import monokai from "./monokai.json";
import nightowl from "./nightowl.json";
import nord from "./nord.json";
import oneDark from "./one-dark.json";
import opencode from "./opencode.json";
import orng from "./orng.json";
import osakaJade from "./osaka-jade.json";
import palenight from "./palenight.json";
import rosepine from "./rosepine.json";
import solarized from "./solarized.json";
import synthwave84 from "./synthwave84.json";
import tokyonight from "./tokyonight.json";
import vercel from "./vercel.json";
import vesper from "./vesper.json";
import zenburn from "./zenburn.json";

/**
 * Theme color value - either a direct hex color or a reference to a def
 */
export type ThemeColorValue = string | { dark: string; light: string };

/**
 * Theme JSON structure
 */
export interface ThemeJson {
  $schema?: string;
  defs: Record<string, string>;
  theme: Record<string, ThemeColorValue>;
}

export const themes: Record<string, ThemeJson> = {
  aura: aura as ThemeJson,
  ayu: ayu as ThemeJson,
  "catppuccin-frappe": catppuccinFrappe as ThemeJson,
  "catppuccin-latte": catppuccinLatte as ThemeJson,
  "catppuccin-mocha": catppuccinMocha as ThemeJson,
  cobalt2: cobalt2 as ThemeJson,
  cursor: cursor as ThemeJson,
  dracula: dracula as ThemeJson,
  everforest: everforest as ThemeJson,
  flexoki: flexoki as ThemeJson,
  github: github as ThemeJson,
  gruvbox: gruvbox as ThemeJson,
  kanagawa: kanagawa as ThemeJson,
  "lucent-orng": lucentOrng as ThemeJson,
  material: material as ThemeJson,
  matrix: matrix as ThemeJson,
  mercury: mercury as ThemeJson,
  monokai: monokai as ThemeJson,
  nightowl: nightowl as ThemeJson,
  nord: nord as ThemeJson,
  "one-dark": oneDark as ThemeJson,
  opencode: opencode as ThemeJson,
  orng: orng as ThemeJson,
  "osaka-jade": osakaJade as ThemeJson,
  palenight: palenight as ThemeJson,
  rosepine: rosepine as ThemeJson,
  solarized: solarized as ThemeJson,
  synthwave84: synthwave84 as ThemeJson,
  tokyonight: tokyonight as ThemeJson,
  vercel: vercel as ThemeJson,
  vesper: vesper as ThemeJson,
  zenburn: zenburn as ThemeJson,
};

export const themeNames = Object.keys(themes);

export const defaultTheme = "opencode";
