interface TerminalPaneProps {
  buffer: string;
  cols: number;
  rows: number;
  showCursor?: boolean;
}

export function TerminalPane(props: TerminalPaneProps) {
  return (
    <ghostty-terminal
      ansi={props.buffer}
      cols={props.cols}
      rows={props.rows}
      showCursor={props.showCursor ?? true}
    />
  );
}
