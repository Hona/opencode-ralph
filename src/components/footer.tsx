import { useTheme } from "../context/ThemeContext";
import { formatDuration } from "../util/time";

export type FooterProps = {
  commits: number;
  elapsed: number;
  paused: boolean;
  linesAdded: number;
  linesRemoved: number;
  sessionActive?: boolean;
};

/**
 * Footer component displaying keybind hints, commits count, and elapsed time.
 * Compact single-line layout for log-centric view.
 */
export function Footer(props: FooterProps) {
  const { theme } = useTheme();
  const t = theme();
  
  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={t.backgroundPanel}
    >
      {/* Keybind hints (left side) */}
      <text fg={t.textMuted}>
        <span style={{ fg: t.borderSubtle }}>q</span> quit  <span style={{ fg: t.borderSubtle }}>p</span> {props.paused ? "resume" : "pause"}  <span style={{ fg: t.borderSubtle }}>T</span> tasks{props.sessionActive && (<>  <span style={{ fg: t.borderSubtle }}>:</span> steer</>)}
      </text>

      {/* Spacer */}
      <box flexGrow={1} />

      {/* Stats (right side) */}
      <text>
        <span style={{ fg: t.success }}>+{props.linesAdded}</span>
        <span style={{ fg: t.textMuted }}>/</span>
        <span style={{ fg: t.error }}>-{props.linesRemoved}</span>
        <span style={{ fg: t.textMuted }}> · </span>
        <span style={{ fg: t.borderSubtle }}>{props.commits}c</span>
        <span style={{ fg: t.textMuted }}> · </span>
        <span style={{ fg: t.borderSubtle }}>{formatDuration(props.elapsed)}</span>
      </text>
    </box>
  );
}
