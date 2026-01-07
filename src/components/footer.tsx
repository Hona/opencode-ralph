import { colors } from "./colors";
import { formatDuration } from "../util/time";

export type FooterProps = {
  commits: number;
  elapsed: number;
  paused: boolean;
  linesAdded: number;
  linesRemoved: number;
};

/**
 * Footer component displaying keybind hints, commits count, and elapsed time.
 * Compact single-line layout for log-centric view.
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
      backgroundColor={colors.bgPanel}
    >
      {/* Keybind hints (left side) */}
      <text fg={colors.fgDark}>
        <span style={{ fg: colors.fgMuted }}>q</span> quit  <span style={{ fg: colors.fgMuted }}>p</span> {props.paused ? "resume" : "pause"}
      </text>

      {/* Spacer */}
      <box flexGrow={1} />

      {/* Stats (right side) */}
      <text>
        <span style={{ fg: colors.green }}>+{props.linesAdded}</span>
        <span style={{ fg: colors.fgDark }}>/</span>
        <span style={{ fg: colors.red }}>-{props.linesRemoved}</span>
        <span style={{ fg: colors.fgDark }}> · </span>
        <span style={{ fg: colors.fgMuted }}>{props.commits}c</span>
        <span style={{ fg: colors.fgDark }}> · </span>
        <span style={{ fg: colors.fgMuted }}>{formatDuration(props.elapsed)}</span>
      </text>
    </box>
  );
}
