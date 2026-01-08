## Command palette keyboard handling

- **Issue**: Pressing `c` locked the app because the command palette dialog could be triggered while another dialog/input was focused and no repaint was forced, so the UI stopped responding but kept consuming `c`.
- **Fix**: Made the keyboard-notified flag reactive to avoid repeated logging, prevented the palette from opening if a dialog is already stacked, and explicitly requested a render after showing the palette so the overlay appears immediately.
