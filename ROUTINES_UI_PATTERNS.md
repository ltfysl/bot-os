# Routines UI Design Patterns

## Visual Hierarchy

```
┌─────────────────────────────────────────────────┐
│ [Routines]                              [✕]     │ ← 48px header
├─────────────────────────────────────────────────┤
│ Morning Standup                      [●] [×]    │ ← 52px row
│ Mon 09:00 · 2h ago                              │   (hover shows actions)
├─────────────────────────────────────────────────┤
│ Hourly Sync                          [○] [×]    │
│ 0 * * * * · 45m ago                             │
├─────────────────────────────────────────────────┤
│ Weekly Review                        [●] [×]    │
│ Mon 17:00 · Never                               │
└─────────────────────────────────────────────────┘
```

## Dense vs Dashboard Comparison

### ❌ Settings Dashboard (What We Avoided)
```
┌─────────────────────────────────────────────────┐
│                   Routines                      │ ← Fat header
│                                                 │
│  ┌─────────────────────────────────┐            │
│  │ Morning Standup             ●   │            │ ← Card grid
│  │ Mon 09:00                       │            │   (fat padding)
│  │ [Edit] [Disable] [Delete]       │            │
│  └─────────────────────────────────┘            │
│                                                 │
│  ┌─────────────────────────────────┐            │
│  │ Hourly Sync                 ○   │            │
│  │ 0 * * * *                       │            │
│  │ [Edit] [Enable] [Delete]        │            │
│  └─────────────────────────────────┘            │
└─────────────────────────────────────────────────┘
```

### ✅ Dense Grok Bot List (What We Built)
```
┌─────────────────────────────────────────────────┐
│ Routines                                [✕]     │ ← Narrow header
├─────────────────────────────────────────────────┤
│ Morning Standup                      [●] [×]    │ ← Dense rows
│ Mon 09:00 · 2h ago                              │   (hover actions)
├─────────────────────────────────────────────────┤
│ Hourly Sync                          [○] [×]    │
│ 0 * * * * · 45m ago                             │
└─────────────────────────────────────────────────┘
```

## Interaction Patterns

### Hover States
- Row background: transparent → `var(--bg-hover)`
- Actions visibility: `opacity: 0` → `opacity: 1`
- Transition: `0.1s ease` (instant feel)

### Action Buttons
- Enable/Pause: Green `●` / Muted `○`
- Delete: Red on hover with subtle background
- Click zones: 28×28px (touch-friendly)

### State Indicators
- **Schedule**: Monospace font (technical clarity)
- **Last Run**: Relative time (human-friendly)
- **Enabled**: Visual color coding (scan-friendly)

## Typography Scale

```
Routine Name:  14px, weight 500  ← Primary hierarchy
Schedule:      11px, monospace   ← Technical data
Last Run:      11px, regular     ← Secondary metadata
```

## Spacing Rhythm

```
Row height:     52px               ← Dense but breathable
Row padding:    10px 20px         ← Minimal side padding
Name/Meta gap:  2px               ← Tight vertical rhythm
List padding:   8px 0             ← Minimal container padding
```

## Color Palette (Reused Design Tokens)

```css
--bg-hover:        #1c1c1c  /* Row hover */
--bg-active:       #222222  /* Action hover */
--text-primary:    #e8e8e8  /* Routine name */
--text-tertiary:   #707070  /* Schedule, last run */
--text-muted:      #505050  /* Disabled state */
--border-subtle:   #222222  /* Row dividers */
```

## Accessibility Features

- Clear hover states for all interactive elements
- 28×28px click targets (WCAG AAA)
- Confirm dialog before delete
- Error messages surfaced inline
- Keyboard navigation ready (future enhancement)

## Performance Considerations

- No unnecessary re-renders (React state management)
- Smooth 0.1s transitions (no jank)
- Hover actions hidden until needed (visual noise reduction)
- Single API call to load routines
- Optimistic UI updates (future enhancement)

## Responsive Behavior

- Fixed row height (consistent rhythm)
- Text overflow ellipsis for long names
- Actions always visible on mobile (no hover)
- Minimal horizontal padding (mobile-friendly)
