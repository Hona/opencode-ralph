import { createSignal, onMount, Show } from "solid-js";
import { DialogSelect, SelectOption } from "./DialogSelect";
import { DialogPrompt } from "./DialogPrompt";
import { useDialog } from "../context/DialogContext";
import { useTheme } from "../context/ThemeContext";
import {
  detectInstalledTerminals,
  type KnownTerminal,
} from "../lib/terminal-launcher";
import {
  setPreferredTerminal,
  setCustomTerminalCommand,
} from "../lib/config";

export interface DialogTerminalConfigProps {
  /** Callback when terminal is selected (terminal name or "custom" or "clipboard") */
  onSelect: (result: TerminalConfigResult) => void;
  /** Callback when dialog is cancelled */
  onCancel: () => void;
  /** The attach command to copy or launch with */
  attachCommand?: string;
}

export type TerminalConfigResult =
  | { type: "terminal"; terminal: KnownTerminal }
  | { type: "custom"; command: string }
  | { type: "clipboard" };

/**
 * Terminal configuration dialog.
 * Lists detected terminals, with options for custom command or clipboard copy.
 * Saves selection to config for future use.
 */
export function DialogTerminalConfig(props: DialogTerminalConfigProps) {
  const { replace } = useDialog();
  const { theme } = useTheme();
  const [terminals, setTerminals] = createSignal<KnownTerminal[]>([]);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    const detected = await detectInstalledTerminals();
    setTerminals(detected);
    setLoading(false);
  });

  // Build options from detected terminals + special options
  const buildOptions = (): SelectOption[] => {
    const options: SelectOption[] = [];

    // Add detected terminals
    for (const terminal of terminals()) {
      options.push({
        title: terminal.name,
        value: `terminal:${terminal.name}`,
        description: terminal.command,
      });
    }

    // Add divider-like separator (disabled option)
    if (terminals().length > 0) {
      options.push({
        title: "───────────────────",
        value: "__separator__",
        disabled: true,
      });
    }

    // Add special options
    options.push({
      title: "Custom command...",
      value: "custom",
      description: "Enter a custom terminal command",
    });

    options.push({
      title: "Copy to clipboard",
      value: "clipboard",
      description: "Copy attach command to clipboard",
      keybind: "c",
    });

    return options;
  };

  const handleSelect = (option: SelectOption) => {
    if (option.value === "clipboard") {
      props.onSelect({ type: "clipboard" });
      return;
    }

    if (option.value === "custom") {
      // Replace with custom command prompt dialog
      replace(() => (
        <DialogPrompt
          title="Custom Terminal Command (use {cmd} for attach command)"
          placeholder="e.g., alacritty -e sh -c '{cmd}'"
          onSubmit={(command) => {
            setCustomTerminalCommand(command);
            props.onSelect({ type: "custom", command });
          }}
          onCancel={props.onCancel}
        />
      ));
      return;
    }

    // Terminal selection
    if (option.value.startsWith("terminal:")) {
      const terminalName = option.value.replace("terminal:", "");
      const terminal = terminals().find((t) => t.name === terminalName);
      if (terminal) {
        setPreferredTerminal(terminal.name);
        props.onSelect({ type: "terminal", terminal });
      }
    }
  };

  const t = theme();

  return (
    <Show
      when={!loading()}
      fallback={
        <DialogSelect
          title="Choose Default Terminal"
          options={[{ title: "Detecting terminals...", value: "__loading__", disabled: true }]}
          onSelect={() => {}}
          onCancel={props.onCancel}
          borderColor={t.accent}
        />
      }
    >
      <DialogSelect
        title="Choose Default Terminal"
        placeholder="Search terminals..."
        options={buildOptions()}
        onSelect={handleSelect}
        onCancel={props.onCancel}
        borderColor={t.accent}
      />
    </Show>
  );
}
