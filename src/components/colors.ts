/**
 * Night Owl color palette for the TUI
 */
export const colors = {
  bg: "#011627",
  bgDark: "#010e17",
  bgHighlight: "#1d3b53",
  bgPanel: "#0b2942",
  fg: "#d6deeb",
  fgDark: "#5f7e97",
  fgMuted: "#b2ccd6",
  green: "#addb67",
  red: "#ef5350",
  yellow: "#ecc48d",
  blue: "#82aaff",
  purple: "#c792ea",
  cyan: "#7fdbca",
  border: "#1d3b53",
  orange: "#f78c6c",
};

/**
 * Icons for different tool types displayed in the event log
 */
export const TOOL_ICONS: Record<string, string> = {
  read: "󰈞", // Read icon
  write: "󰏫", // Write icon
  edit: "󰛓", // Edit icon
  glob: "center", // Glob icon
  grep: "󰱽", // Grep icon
  bash: "󰆍", // Bash icon
  task: "󰙨", // Task icon
  webfetch: "󰖟",
  websearch: "󰖟",
  codesearch: "󰖟",
  todowrite: "󰗡",
  todoread: "󰗡",
  thought: "󰋚", // Reasoning/Thought icon
};
