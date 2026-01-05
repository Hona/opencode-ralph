import { colors } from "./colors";

export type PausedOverlayProps = {
  visible: boolean;
};

export function PausedOverlay(props: PausedOverlayProps) {
  if (!props.visible) return null;

  return (
    <box
      position="absolute"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      backgroundColor={colors.bgHighlight}
    >
      <box
        padding={2}
        borderStyle="single"
        borderColor={colors.border}
        backgroundColor={colors.bgPanel}
        flexDirection="column"
        alignItems="center"
      >
        <text fg={colors.yellow}>{"\u23F8"} PAUSED</text>
        <text fg={colors.fgMuted}>press p to resume</text>
      </box>
    </box>
  );
}
