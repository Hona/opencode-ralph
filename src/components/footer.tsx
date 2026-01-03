import { colors } from "./colors";
import { formatDuration } from "../util/time";

export type FooterProps = {
  commits: number;
  elapsed: number;
  paused: boolean;
};

/**
 * Footer component displaying keybind hints, commits count, and elapsed time.
 * Uses flexDirection="row" with a top border.
 */
export function Footer(props: FooterProps) {
  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
      borderStyle="single"
      border={["top"]}
      borderColor={colors.border}
      backgroundColor={colors.bg}
    >
      {/* Keybind hints (left side) */}
      <text fg={colors.fg}>p</text>
      <text fg={colors.fgMuted}> pause </text>
      <text fg={colors.fgMuted}>{"\u00B7"} </text>
      <text fg={colors.fg}>q</text>
      <text fg={colors.fgMuted}> quit </text>
      <text fg={colors.fgMuted}>{"\u00B7"} </text>
      <text fg={colors.fg}>{"\u2191\u2193"}</text>
      <text fg={colors.fgMuted}> scroll</text>

      {/* Spacer */}
      <box flexGrow={1} />

      {/* Stats (right side) */}
      <text fg={colors.fgMuted}>
        {props.commits} commits {"\u00B7"} {formatDuration(props.elapsed)}
      </text>
    </box>
  );
}
