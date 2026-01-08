# OpenTUI Theme Colors Fix

## Problem

Theme colors were not being applied to the main app view (Header, Footer, Log), while dialogs displayed colors correctly. The UI appeared as "dark background with lighter text and almost no color at all."

## Root Cause

Two issues were identified:

### 1. Incorrect OpenTUI Color Pattern in Footer

The Footer component used nested `<span style={{ fg: ... }}>` inside `<text>` elements:

```tsx
// WRONG - OpenTUI doesn't support nested span style for colors
<text fg={t.textMuted}>
  <span style={{ fg: t.success }}>+{props.linesAdded}</span>
  <span style={{ fg: t.textMuted }}>/</span>
  <span style={{ fg: t.error }}>-{props.linesRemoved}</span>
</text>
```

OpenTUI requires the `fg` attribute directly on `<text>` elements:

```tsx
// CORRECT - Use separate <text> elements with fg attribute
<text fg={t.success}>+{props.linesAdded}</text>
<text fg={t.textMuted}>/</text>
<text fg={t.error}>-{props.linesRemoved}</text>
```

The dialogs worked because they already used the correct pattern with separate `<text>` elements.

### 2. Non-Reactive Theme Access

Components captured the theme once at render time:

```tsx
// NON-REACTIVE - Captures theme value once, doesn't update on theme change
const t = theme();
return <box backgroundColor={t.backgroundPanel}>...</box>;
```

Should use a reactive getter:

```tsx
// REACTIVE - Theme is accessed each time t() is called in JSX
const t = () => theme();
return <box backgroundColor={t().backgroundPanel}>...</box>;
```

## Fix

1. **Footer**: Replaced all `<span style={{ fg }}>` with separate `<text fg={}>` elements
2. **All main components**: Changed from `const t = theme()` to `const t = () => theme()` and updated usages to `t().property`

### Components Updated

- `src/components/footer.tsx` - Fixed span pattern + reactive getter
- `src/components/header.tsx` - Reactive getter
- `src/components/log.tsx` - Reactive getter
- `src/components/steering.tsx` - Fixed span pattern + reactive getter
- `src/components/toast.tsx` - Reactive getter + fixed non-reactive early return

## Key Takeaway

When using OpenTUI/SolidJS for TUI rendering:

1. **Colors**: Always use `<text fg={color}>` directly, never `<span style={{ fg: color }}>`
2. **Reactivity**: Use getter functions `const t = () => theme()` and access via `t()` in JSX to ensure theme changes propagate
