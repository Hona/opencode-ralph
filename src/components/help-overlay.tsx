import { For, Show } from "solid-js";
import { useTheme } from "../context/ThemeContext";
import { fullKeyboardShortcuts } from "./tui-theme";

export type HelpOverlayProps = {
  visible: boolean;
};

function groupShortcutsByCategory() {
  const groups = new Map<string, Array<{ key: string; description: string }>>();
  for (const shortcut of fullKeyboardShortcuts) {
    const existing = groups.get(shortcut.category) ?? [];
    existing.push({ key: shortcut.key, description: shortcut.description });
    groups.set(shortcut.category, existing);
  }
  return Array.from(groups.entries());
}

const groupedShortcuts = groupShortcutsByCategory();
const maxKeyWidth = fullKeyboardShortcuts.reduce((max, shortcut) => Math.max(max, shortcut.key.length), 0);

export function HelpOverlay(props: HelpOverlayProps) {
  const { theme } = useTheme();
  const t = () => theme();

  return (
    <Show when={props.visible}>
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
        backgroundColor="#000000B3"
      >
        <box
          flexDirection="column"
          padding={2}
          backgroundColor={t().backgroundPanel}
          borderColor={t().primary}
          minWidth={50}
          maxWidth={60}
          border
        >
          <box marginBottom={1} justifyContent="center">
            <text fg={t().primary}>⌨ Keyboard Shortcuts</text>
          </box>

          <For each={groupedShortcuts}>
            {(group) => (
              <box flexDirection="column" marginBottom={1}>
                <text fg={t().textMuted}>{group[0]}</text>
                <For each={group[1]}>
                  {(shortcut) => (
                    <box flexDirection="row">
                      <text fg={t().secondary}>
                        {shortcut.key.padEnd(maxKeyWidth + 2)}
                      </text>
                      <text fg={t().text}>{shortcut.description}</text>
                    </box>
                  )}
                </For>
              </box>
            )}
          </For>

          <box marginTop={1} justifyContent="center">
            <text fg={t().textMuted}>Press ? or Esc to close</text>
          </box>
        </box>
      </box>
    </Show>
  );
}
