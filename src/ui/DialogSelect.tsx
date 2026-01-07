import { useKeyboard } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import { createSignal, createMemo, For, Show } from "solid-js";
import fuzzysort from "fuzzysort";
import { Dialog } from "./Dialog";
import { useDialog } from "../context/DialogContext";
import { colors } from "../components/colors";

export interface SelectOption {
  /** Display title for the option */
  title: string;
  /** Unique value identifier */
  value: string;
  /** Optional description shown below the title */
  description?: string;
  /** Optional keybind hint (e.g., "Ctrl+P") */
  keybind?: string;
  /** Whether the option is currently disabled */
  disabled?: boolean;
}

export type DialogSelectProps = {
  /** Dialog title displayed at the top */
  title?: string;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Options to display and filter */
  options: SelectOption[];
  /** Callback when an option is selected */
  onSelect: (option: SelectOption) => void;
  /** Callback when dialog is cancelled */
  onCancel: () => void;
  /** Optional custom border color */
  borderColor?: string;
  /** Maximum number of visible results (defaults to 8) */
  maxVisible?: number;
};

interface HighlightedPart {
  text: string;
  highlighted: boolean;
}

/**
 * Fuzzy search select dialog with keyboard navigation.
 * Features search input, filtered results list, and highlighted matches.
 */
export function DialogSelect(props: DialogSelectProps) {
  const { pop } = useDialog();
  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const maxVisible = () => props.maxVisible ?? 8;

  // Fuzzy filter options based on query
  const filteredOptions = createMemo(() => {
    const q = query();
    if (!q) {
      // Return all options when no query, preserving original order
      return props.options
        .filter((opt) => !opt.disabled)
        .map((opt) => ({
          option: opt,
          highlighted: null as HighlightedPart[] | null,
        }));
    }

    // Use fuzzysort to filter and score options
    const results = fuzzysort.go(q, props.options, {
      key: "title",
      threshold: 0.2,
    });

    return results.map((result) => {
      // Generate highlighted parts using the callback API
      const parts: HighlightedPart[] = [];
      result.highlight((match, _index) => {
        parts.push({ text: match, highlighted: true });
        return match;
      });

      // Build full highlighted parts by reconstructing from indexes
      const highlighted = buildHighlightedParts(result.target, result.indexes);

      return {
        option: result.obj,
        highlighted,
      };
    });
  });

  // Keep selected index in bounds
  const clampedIndex = createMemo(() => {
    const len = filteredOptions().length;
    if (len === 0) return 0;
    const idx = selectedIndex();
    return Math.max(0, Math.min(idx, len - 1));
  });

  // Calculate scroll offset for visible window
  const scrollOffset = createMemo(() => {
    const idx = clampedIndex();
    const max = maxVisible();
    // Keep selected item visible by scrolling
    return Math.max(0, idx - max + 1);
  });

  // Get visible slice of options
  const visibleOptions = createMemo(() => {
    const offset = scrollOffset();
    return filteredOptions().slice(offset, offset + maxVisible());
  });

  const handleSelect = () => {
    const options = filteredOptions();
    const idx = clampedIndex();
    if (options.length > 0 && options[idx]) {
      const selected = options[idx].option;
      if (!selected.disabled) {
        props.onSelect(selected);
        pop();
      }
    }
  };

  const handleCancel = () => {
    props.onCancel();
    pop();
  };

  useKeyboard((e: KeyEvent) => {
    // Enter: select current option
    if (e.name === "return" || e.name === "enter" || e.name === "Enter") {
      handleSelect();
      return;
    }

    // Escape: cancel (Dialog handles this too, but we call onCancel)
    if (e.name === "escape" || e.name === "Escape") {
      handleCancel();
      return;
    }

    // Up arrow: move selection up
    if (e.name === "up" || e.name === "Up") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    // Down arrow: move selection down
    if (e.name === "down" || e.name === "Down") {
      setSelectedIndex((prev) =>
        Math.min(filteredOptions().length - 1, prev + 1)
      );
      return;
    }

    // Tab: move down (common in command palettes)
    if (e.name === "tab" && !e.shift) {
      setSelectedIndex((prev) =>
        Math.min(filteredOptions().length - 1, prev + 1)
      );
      return;
    }

    // Shift+Tab: move up
    if (e.name === "tab" && e.shift) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    // Backspace: delete last character
    if (e.name === "backspace" || e.name === "Backspace") {
      setQuery((prev) => prev.slice(0, -1));
      setSelectedIndex(0); // Reset selection on query change
      return;
    }

    // Regular character input
    if (e.raw && e.raw.length === 1 && !e.ctrl && !e.meta) {
      setQuery((prev) => prev + e.raw);
      setSelectedIndex(0); // Reset selection on query change
    }
  });

  return (
    <Dialog
      borderColor={props.borderColor || colors.blue}
      onClose={handleCancel}
      width="70%"
    >
      {/* Title */}
      <Show when={props.title}>
        <box marginBottom={1}>
          <text fg={colors.blue} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
        </box>
      </Show>

      {/* Search input */}
      <box
        marginBottom={1}
        paddingLeft={1}
        paddingRight={1}
        borderStyle="single"
        borderColor={colors.border}
        backgroundColor={colors.bgDark}
      >
        <text fg={colors.fgMuted}>❯ </text>
        <text fg={query() ? colors.fg : colors.fgMuted}>
          {query() || props.placeholder || "Type to search..."}
        </text>
      </box>

      {/* Results list */}
      <box flexDirection="column">
        <Show
          when={filteredOptions().length > 0}
          fallback={
            <box padding={1}>
              <text fg={colors.fgMuted}>No matching results</text>
            </box>
          }
        >
          <For each={visibleOptions()}>
            {(item, index) => {
              const actualIndex = () => scrollOffset() + index();
              const isSelected = () => actualIndex() === clampedIndex();

              return (
                <box
                  flexDirection="row"
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected() ? colors.bgHighlight : undefined}
                >
                  {/* Selection indicator */}
                  <text fg={isSelected() ? colors.blue : colors.fgMuted}>
                    {isSelected() ? "❯ " : "  "}
                  </text>

                  {/* Title with optional highlighting */}
                  <box flexGrow={1} flexDirection="column">
                    <box flexDirection="row">
                      <Show
                        when={item.highlighted}
                        fallback={
                          <text
                            fg={item.option.disabled ? colors.fgMuted : colors.fg}
                          >
                            {item.option.title}
                          </text>
                        }
                      >
                        <For each={item.highlighted!}>
                          {(part) => (
                            <text
                              fg={
                                part.highlighted
                                  ? colors.yellow
                                  : item.option.disabled
                                  ? colors.fgMuted
                                  : colors.fg
                              }
                              attributes={
                                part.highlighted ? TextAttributes.BOLD : undefined
                              }
                            >
                              {part.text}
                            </text>
                          )}
                        </For>
                      </Show>
                    </box>

                    {/* Description if present */}
                    <Show when={item.option.description}>
                      <text fg={colors.fgDark}>{item.option.description}</text>
                    </Show>
                  </box>

                  {/* Keybind hint if present */}
                  <Show when={item.option.keybind}>
                    <box marginLeft={2}>
                      <text fg={colors.fgDark}>[{item.option.keybind}]</text>
                    </box>
                  </Show>
                </box>
              );
            }}
          </For>
        </Show>
      </box>

      {/* Footer hints */}
      <box flexDirection="row" justifyContent="flex-end" gap={2} marginTop={1}>
        <box flexDirection="row">
          <text fg={colors.fgMuted}>[</text>
          <text fg={colors.green}>↑↓</text>
          <text fg={colors.fgMuted}>] Navigate</text>
        </box>
        <box flexDirection="row">
          <text fg={colors.fgMuted}>[</text>
          <text fg={colors.green}>Enter</text>
          <text fg={colors.fgMuted}>] Select</text>
        </box>
        <box flexDirection="row">
          <text fg={colors.fgMuted}>[</text>
          <text fg={colors.red}>Esc</text>
          <text fg={colors.fgMuted}>] Cancel</text>
        </box>
      </box>
    </Dialog>
  );
}

/**
 * Build highlighted parts from match indexes.
 * Returns an array of text parts with highlight flags.
 */
function buildHighlightedParts(
  target: string,
  indexes: ReadonlyArray<number>
): HighlightedPart[] {
  if (indexes.length === 0) {
    return [{ text: target, highlighted: false }];
  }

  const parts: HighlightedPart[] = [];
  const indexSet = new Set(indexes);
  let currentPart = "";
  let currentHighlighted = indexSet.has(0);

  for (let i = 0; i < target.length; i++) {
    const isHighlighted = indexSet.has(i);
    if (isHighlighted !== currentHighlighted) {
      if (currentPart) {
        parts.push({ text: currentPart, highlighted: currentHighlighted });
      }
      currentPart = target[i];
      currentHighlighted = isHighlighted;
    } else {
      currentPart += target[i];
    }
  }

  if (currentPart) {
    parts.push({ text: currentPart, highlighted: currentHighlighted });
  }

  return parts;
}
