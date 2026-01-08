declare global {
  namespace JSX {
    interface IntrinsicElements {
      "ghostty-terminal": {
        ansi: string;
        cols: number;
        rows: number;
        showCursor?: boolean;
      };
    }
  }
}

export {};
