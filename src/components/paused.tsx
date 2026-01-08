import { Show } from "solid-js";
import { useTheme } from "../context/ThemeContext";

export type PausedOverlayProps = {
  visible: boolean;
};

export function PausedOverlay(props: PausedOverlayProps) {
  const { theme } = useTheme();
  const t = () => theme();

  return (
    <Show when={props.visible}>
      <box
        position="absolute"
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
        backgroundColor={t().backgroundElement}
      >
        <box
          padding={2}
          borderStyle="single"
          borderColor={t().border}
          backgroundColor={t().backgroundPanel}
          flexDirection="column"
          alignItems="center"
        >
          <text fg={t().warning}>{"\u23F8"} PAUSED</text>
          <text fg={t().textMuted}>press p to resume</text>
        </box>
      </box>
    </Show>
  );
}
