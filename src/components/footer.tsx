import { useTheme } from "../context/ThemeContext";
import { formatDuration, formatNumber } from "../util/time";
import type { TokenUsage } from "../state";
import { keyboardShortcuts, layout } from "./tui-theme";

export type FooterProps = {
  commits: number;
  elapsed: number;
  status: "running" | "paused" | "ready" | "starting" | "complete" | "error";
  linesAdded: number;
  linesRemoved: number;
  sessionActive?: boolean;
  tokens?: TokenUsage;
};

export function Footer(props: FooterProps) {
  const { theme } = useTheme();
  const t = () => theme();

  const shortcuts = () => {
    const list = [...keyboardShortcuts];
    if (props.sessionActive) {
      list.splice(3, 0, { key: ":", description: "Steer" });
    }
    return list;
  };

  const shortcutText = () =>
    shortcuts()
      .map(({ key, description }) => `${key}:${description}`)
      .join("  ");

  return (
    <box
      width="100%"
      height={layout.footer.height}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      backgroundColor={t().backgroundPanel}
      paddingLeft={1}
      paddingRight={1}
      border
      borderColor={t().border}
    >
      <box flexShrink={1} overflow="hidden">
        <text fg={t().textMuted}>{shortcutText()}</text>
      </box>

      <box flexGrow={1} />

      <box flexDirection="row">
        {props.tokens && (props.tokens.input > 0 || props.tokens.output > 0) && (
          <>
            <text fg={t().secondary}>{formatNumber(props.tokens.input)}in</text>
            <text fg={t().textMuted}>/</text>
            <text fg={t().secondary}>{formatNumber(props.tokens.output)}out</text>
            {props.tokens.reasoning > 0 && (
              <>
                <text fg={t().textMuted}>/</text>
                <text fg={t().secondary}>{formatNumber(props.tokens.reasoning)}r</text>
              </>
            )}
            <text fg={t().textMuted}> · </text>
          </>
        )}
        <text fg={t().success}>+{props.linesAdded}</text>
        <text fg={t().textMuted}>/</text>
        <text fg={t().error}>-{props.linesRemoved}</text>
        <text fg={t().textMuted}> · </text>
        <text fg={t().primary}>{props.commits}c</text>
        <text fg={t().textMuted}> · </text>
        <text fg={t().text}>{formatDuration(props.elapsed)}</text>
      </box>
    </box>
  );
}
