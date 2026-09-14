# SESH — Final Codex Implementation Spec

> **Status:** Locked implementation source of truth  
> **Product:** SESH  
> **Version:** V1 desktop application  
> **Primary targets:** macOS Apple Silicon and Windows 11

Codex should implement this specification as written. Do not expand the product beyond this scope unless a change is technically necessary to satisfy a requirement. If a detail is ambiguous, choose the smallest, most coherent implementation that preserves the product direction.

---

## 1. Product definition

**SESH** is a minimalist desktop focus/Pomodoro timer for personal use. It should feel like a small, premium desktop utility rather than a productivity suite.

The visual direction should closely reference the compact, near-black, information-dense aesthetic of the Axiom trading interface and PNL cards, without copying or importing proprietary assets. Core traits:

- Near-black UI
- Compact information density
- Crisp Geist typography
- Thin dark borders and subtle separators
- Restrained pale lavender, icy white, and gray-lavender branding
- Strong numeric hierarchy
- Minimal controls
- Customizable image backgrounds
- Floating desktop-window behavior

SESH is **not** a task manager. Do not add:

- Task names or task tracking
- Categories such as Coding, Studying, or Deep Work
- To-do lists or projects
- Social features
- Accounts or cloud sync
- Gamification, XP, achievements, streak pressure, or productivity coaching

---

## 2. UI/UX quality bar

The entire experience must feel **premium, seamless, polished, responsive, visually coherent, low-friction, and native-feeling** on both macOS and Windows.

This is a release requirement, not an aspirational note. Every state, transition, menu, dialog, control, and error condition must appear intentional and finished.

- Interactions must respond immediately and predictably.
- Common actions must require as few steps as practical.
- Timer controls must remain obvious without creating visual clutter.
- Layout, typography, spacing, color, iconography, and motion must use one coherent system.
- Resizing and switching modes must never produce clipping, overlap, jitter, or broken hierarchy.
- Hover, pressed, focused, disabled, loading, empty, error, paused, completed, and offline states must be designed—not left to browser defaults.
- Keyboard focus must be visible and logical; pointer hit targets must be comfortable despite the compact layout.
- Modals, menus, sliders, toggles, confirmations, and notifications must feel integrated with the desktop app.
- Background images must never compromise legibility; sensible contrast defaults and overlays are mandatory.
- Avoid unnecessary confirmations, blocking dialogs, disruptive animations, or hidden critical actions.
- Platform behavior should follow macOS and Windows conventions where those conventions improve familiarity, while preserving a consistent SESH identity.
- No visible implementation rough edges, placeholder copy, debug UI, layout flashes, raw errors, or inconsistent styling may ship.

Acceptance of V1 requires a final interaction and visual-polish pass at supported window sizes, display scaling levels, and normal/compact modes.

---

## 3. Name and branding

Application name: **SESH**.

Use the custom geometric **S** symbol as the app icon. The icon contains only the symbol:

- Geometric folded S
- Pale lavender, icy white, and subtle gray-lavender
- Black or transparent surrounding area
- No saturated electric blue
- No wordmark, text, border, or rounded-rectangle frame

Prepare platform-specific icon assets from the approved master artwork.

Inside the UI, render the wordmark as live text—not an image:

```text
SESH
```

Bundle **Geist Variable** and start with:

```css
.sesh-wordmark {
  font-family: "Geist", sans-serif;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
```

Tune spacing optically if needed. The wordmark remains secondary to the timer.

---

## 4. Technology stack

Build a native-feeling, cross-platform desktop application with:

```text
Tauri 2
React
TypeScript
Vite
CSS or CSS Modules
```

Do not use Electron unless Tauri demonstrably cannot provide a required capability. Keep the architecture portable between macOS Apple Silicon and Windows 11.

Use native Tauri capabilities for:

- Frameless window behavior
- Dragging, resizing, and positioning
- Always-on-top
- Local filesystem access
- OS notifications
- Local persistence
- Native file selection
- Platform lifecycle and sleep/wake handling where available

---

## 5. Main window

SESH behaves as a floating desktop timer card. The window must:

- Be draggable anywhere on screen
- Be resizable within defined minimum dimensions
- Have no standard OS title bar
- Use rounded corners where supported
- Optionally remain always on top
- Default `Always on Top` to `true`
- Remember its position, size, display, always-on-top state, and compact-mode state
- Restore to its previous position on launch
- Detect changed monitor configurations and prevent restoration completely offscreen
- Expose a reliable drag region without interfering with buttons or text selection

The user must be able to disable always-on-top.

---

## 6. Main timer UI

Do not display session titles or categories. The timer is the focus.

Approximate normal-mode hierarchy:

```text
┌─────────────────────────────────────────┐
│ SESH                               •••  │
│                                         │
│              12:42                      │
│                                         │
│ FOCUS                           74.60%  │
│ ELAPSED                          37:18  │
│ TARGET                           50:00  │
│                                         │
│           PAUSE       RESET             │
└─────────────────────────────────────────┘
```

The exact layout may be tuned during implementation, but preserve this hierarchy.

The large central number is always **remaining time**, never elapsed time.

---

## 7. Timer metrics

During focus, display exactly:

```text
FOCUS       74.60%
ELAPSED      37:18
TARGET       50:00
```

Calculate:

```text
focusPercentage = elapsedFocusTime / targetFocusTime × 100
```

- Display two decimal places.
- Do not prefix the percentage with `+`.
- Clamp the normal-session display to `0–100%` unless overtime is deliberately added later.
- Use tabular numerals for all changing numeric values.

---

## 8. Break mode

Support Pomodoro-style breaks. During a break, substitute:

```text
BREAK       35.40%
ELAPSED      01:46
TARGET       05:00
```

The large number remains remaining time. Do not display `FOCUS` while a break is active.

---

## 9. Timer presets

Provide:

```text
25 / 5
50 / 10
90 / 15
Custom
```

The format is `Focus / Break`. Allow editing of custom focus and break values and persist the last selected preset and custom values.

Do not force automatic Pomodoro cycling.

Defaults:

```text
Auto-start break       Off
Auto-start next focus  Off
```

---

## 10. Timer controls and state machine

Controls:

```text
Idle       START
Running    PAUSE · RESET
Paused     RESUME · RESET
Break      Same state-appropriate structure
Complete   Start break, start focus, or reset as applicable
```

Reset requires confirmation only when meaningful elapsed time exists. Avoid confirmations for trivial or untouched states.

Model timer phases and statuses explicitly. Invalid transitions must not occur through rapid clicks, keyboard input, restore, sleep/wake, or notification actions.

---

## 11. Timer implementation and drift prevention

Do **not** decrement a counter once per second as the source of truth. Use absolute timestamps.

Conceptual state:

```ts
startedAt: number | null;
targetDurationMs: number;
pausedAt: number | null;
totalPausedMs: number;
```

Calculate:

```ts
elapsed = Date.now() - startedAt - totalPausedMs;
remaining = targetDurationMs - elapsed;
```

The UI interval exists only to trigger rendering. Timestamp-derived state must prevent drift when the app is backgrounded, minimized, throttled, busy, asleep, or briefly unfocused.

Pause/resume must accumulate paused duration accurately. Clamp display values at completion and ensure the completion side effects fire once.

---

## 12. Sleep, wake, suspend, and restore

On wake, focus, or resume, recalculate from timestamps immediately.

If a timer completed while the computer slept or the app was closed:

- Transition immediately to the completed state
- Do not resume from stale rendered values
- Show the completion notification if enabled and appropriate
- Do not fire duplicate sounds or notifications on repeated lifecycle events

Persist enough active-session data to recover accurately after an app restart.

---

## 13. Completion behavior

At `00:00`:

- Stop the active timer
- Trigger a subtle completion sound if enabled
- Issue an OS notification if enabled and permission is available
- Enter a restrained completed state

Example:

```text
00:00

FOCUS      100.00%
ELAPSED      50:00
TARGET       50:00

COMPLETE
```

No confetti, celebratory spectacle, or gamification.

---

## 14. Compact mode

Provide a compact floating mode:

```text
┌────────────────────────────┐
│ 12:42              74.60% │
└────────────────────────────┘
```

An optional tiny status indicator may be used:

```text
● 12:42             74.60%
```

Compact mode must remain draggable, readable, resizable within sensible limits, and always-on-top capable. Do not show all metrics. Double-clicking the window may toggle normal/compact mode; the menu must always expose the action.

---

## 15. Main menu

The `•••` menu contains:

```text
Always on Top
Compact Mode
Timer Settings
Appearance
Background Library
Reset Window Position
Quit
```

`Lock Position` is a possible later feature and is not required for V1.

---

## 16. Visual design

Strongly reference Axiom’s desktop visual language without importing proprietary assets.

Use:

- Dark backgrounds
- Thin borders and subtle separators
- Compact spacing
- Small uppercase labels
- Large, clean numbers
- High-contrast white text
- Restrained accent colors

Avoid:

- Pervasive glassmorphism
- Huge shadows
- Rounded, bubbly controls
- Gaming UI
- Neon/cyberpunk overload
- Excessive gradients
- Large decorative icons

Do not use PNL/trading terminology such as `PNL`, `POSITION`, `PROFIT`, `LOSS`, `WIN RATE`, or `TRADE`. User-facing terminology is `FOCUS`, `BREAK`, `ELAPSED`, and `TARGET`.

---

## 17. Typography

Bundle and use **Geist Variable** throughout. Do not allow arbitrary font selection.

```css
/* Timer */
font-weight: 500;
font-variant-numeric: tabular-nums;

/* Metric labels */
font-weight: 500;

/* Metric values */
font-weight: 500;
font-variant-numeric: tabular-nums;

/* Wordmark */
font-weight: 400;
letter-spacing: 0.14em;
```

The timer must not shift horizontally as digits change.

---

## 18. Base color system

Start here and tune visually against the approved references:

```css
:root {
  --bg: #0d0e10;
  --panel: #151619;
  --panel-elevated: #1a1b1f;
  --border: #292b31;
  --border-subtle: #22242a;
  --text-primary: #f4f4f5;
  --text-secondary: #a6a8b0;
  --text-muted: #70727a;
  --focus-positive: #2fddae;
  --button-primary: #536dff;
  --button-primary-hover: #657cff;
}
```

Exact values may be tuned. The base must remain near-black, not flat gray. Brand/logo treatment remains pale and neutral; do not revert to saturated electric blue.

---

## 19. Background image system

Background customization is a core feature. Support:

```text
No Background
Preset
Wallhaven
Local Image
```

Use a layered architecture:

```text
card
├── background image layer
├── black overlay layer
└── foreground UI layer
```

Image opacity and blur must affect only the image layer. Never reduce or blur the foreground UI. Oversize blurred images enough to prevent empty edges.

---

## 20. Appearance controls

Create a compact, Axiom-style appearance panel with a live preview and:

- Background/Text sections or tabs
- Blur: `0–20 px`
- Image opacity: `0–100%`
- Black overlay: `0–100%`, default approximately `35–50%`
- Fit: `Cover` or `Contain`, default `Cover`
- Horizontal and vertical position
- Minimal text opacity and text scale controls

At minimum, image position supports:

```text
Top Left · Top · Top Right
Left · Center · Right
Bottom Left · Bottom · Bottom Right
```

A draggable focal-position control is optional for V1.

---

## 21. Background library

Provide three tabs:

```text
Presets
Wallhaven
My Images
```

### Presets

Bundle a small collection of original/non-copyrighted backgrounds made for SESH. Suggested categories: Dark, Abstract, Space, Gradient, and Minimal. Do not bundle copyrighted anime artwork.

### My Images

Allow users to add PNG, JPG, JPEG, and WEBP files. Copy imported files into the SESH app-data backgrounds directory so the app does not depend permanently on the original path.

Provide `Add Image`, `Delete Image`, and `Set Background`. Confirm destructive deletion when appropriate, do not delete the currently active file without resolving the active selection, and handle unreadable or unsupported files gracefully.

---

## 22. Wallhaven integration

Integrate Wallhaven through its supported API rather than scraping the website. Primary use case: anime wallpapers.

Default filters:

```text
Category: Anime
Purity: SFW only
Minimum resolution: 1920 × 1080
Sorting: Toplist or Favorites
```

Never enable NSFW content by default.

The Wallhaven browser includes search, category, sorting, minimum resolution, thumbnail grid, loading/empty/error states, and optional quick-query chips:

```text
Top Anime · Anime City · Night · Cyberpunk · Space · Scenic · Minimal
```

Quick chips are predefined queries, not permanent taxonomy. Browse with thumbnails and download the full-resolution image only after selection.

If an API key is needed for some API capabilities, support it as an optional local setting and never log or transmit it anywhere except Wallhaven.

---

## 23. Wallpaper cache

Selection flow:

```text
Wallhaven → thumbnail → user selects → download full image
→ save to local cache → render local file
```

Do not hotlink full images while the timer runs. Cache approximately 30–50 wallpapers or enforce a sensible size limit. Clean up least-recently-used files automatically.

Never delete:

- The current background
- Favorited backgrounds, if favorites are later implemented

Favorites are optional for V1.

---

## 24. Offline behavior

The timer must work completely offline. Without internet:

- Timer, settings, presets, local images, and cached backgrounds work
- The current background continues to render
- Only Wallhaven browsing becomes unavailable

Show a subtle inline error such as `Unable to load Wallhaven.` Do not block the rest of the UI.

---

## 25. Settings architecture

Use a coherent settings modal/panel with sections or tabs. If one page becomes crowded, split into `Timer`, `Appearance`, and `Background`.

Required timer settings:

- Focus duration
- Break duration
- Auto-start break
- Auto-start focus
- Notifications
- Sound
- Always on top

Required appearance settings:

- Background preview and selection
- Blur
- Image opacity
- Overlay
- Fit and position
- Minimal text opacity and scale

Provide restrained `Reset` and `Done` actions. Changes that are safe to preview should update live; persist committed settings reliably.

---

## 26. Local persistence

Persist settings locally. A representative model:

```ts
interface SeshSettings {
  focusDurationMinutes: number;
  breakDurationMinutes: number;
  selectedPreset: "25/5" | "50/10" | "90/15" | "custom";
  customFocusDurationMinutes: number;
  customBreakDurationMinutes: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  alwaysOnTop: boolean;
  compactMode: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  backgroundType: "none" | "preset" | "wallhaven" | "local";
  backgroundId: string | null;
  backgroundBlurPx: number;
  backgroundOpacity: number;
  backgroundOverlay: number;
  backgroundFit: "cover" | "contain";
  backgroundPosition: string;
  textOpacity: number;
  textScale: number;
  window: {
    x: number | null;
    y: number | null;
    width: number;
    height: number;
    monitorId: string | null;
  };
}
```

Persist active session state separately, including phase, status, absolute timestamps, target duration, accumulated pause duration, and completion-side-effect state.

Use a versioned schema, validation, defaults, and safe migration. Corrupt or partial data must fall back gracefully without preventing launch.

---

## 27. Startup behavior

If no active session exists:

- Restore window placement and mode
- Restore the selected preset, appearance, and background
- Show idle state

If an active session exists:

- Restore it
- Recalculate elapsed time from timestamps
- Resume the correct running/paused/completed status

If it finished while SESH was closed, show the completed state.

Avoid white flashes, incorrect first-frame values, or visible settings reflow during hydration.

---

## 28. Notifications and sound

- Request notification permission only when necessary and in context.
- Respect disabled or denied permissions without repeated prompts.
- Notifications identify whether focus or break completed and provide concise copy.
- Completion sound is subtle, bundled locally, and controlled by the Sound toggle.
- Avoid overlapping or duplicate sound/notification events.
- The core timer must never depend on notification availability.

---

## 29. Keyboard and accessibility

At minimum, support logical keyboard navigation for every control and sensible shortcuts for start/pause/resume, reset, compact mode, and closing dialogs. Do not trigger shortcuts while the user is editing a text or numeric field.

- Use semantic controls and accessible names.
- Preserve visible focus indicators.
- Maintain strong text/background contrast.
- Do not communicate state by color alone.
- Expose slider values and toggle state to assistive technology.
- Respect reduced-motion preferences.
- Ensure changing time values do not cause disruptive screen-reader announcements every second.
- Keep touch/click targets usable even when visuals are compact.

---

## 30. Responsive resizing

Define supported minimum and default sizes for normal and compact modes. The design must adapt continuously within those bounds.

- Preserve timer prominence.
- Tighten spacing and type scale deliberately.
- Never overlap, clip, or hide essential controls.
- Settings and background library may use their own sensible minimum size.
- Support common Windows display scaling and macOS Retina rendering.
- Test multi-monitor movement and displays with different scale factors.

---

## 31. Motion and interaction feedback

Use short, subtle transitions for hover, press, modal/menu entry, and state changes. Motion should clarify causality, not decorate the interface.

Avoid:

- Bouncy or playful motion
- Large scaling effects
- Constant glow pulses
- Animated gradients
- Per-second animation of the timer number

The timer digits update cleanly with no bounce or layout shift.

---

## 32. Progress visualization

Do not add a large circular Pomodoro ring. If graphical progress is used, keep it extremely restrained—for example, a thin horizontal progress line. The percentage alone is sufficient for V1.

---

## 33. Performance

SESH should feel instantaneous.

- Low idle CPU usage
- Low memory use
- No timer drift
- No unnecessary React rerenders
- No constant network requests
- No polling unless the Wallhaven browser is open and a request is needed
- Thumbnail lazy loading and cancellation of stale searches
- Local rendering of selected/cached backgrounds
- Efficient image sizing and decoding
- Debounced persistence for rapidly changing sliders/window bounds, with a final flush when interaction ends

---

## 34. Privacy and security

SESH is local-first:

- No telemetry or analytics
- No account
- No cloud storage or sync
- The only V1 external connection is Wallhaven API/image delivery
- Store imported images, cache, preferences, and optional API credentials locally
- Validate remote responses and image MIME/type/size before use
- Sanitize filenames and never allow remote values to escape designated app-data directories
- Do not expose local file paths or secrets in user-facing errors

---

## 35. Error handling

Never expose raw stack traces. Use concise, non-blocking messages where possible:

```text
Could not load wallpapers. Try again.
Could not open image.
Could not save settings.
```

Log technical details locally or to the development console as appropriate. Preserve usable state after recoverable errors and offer retry where it is meaningful.

---

## 36. Suggested project structure

```text
src/
  components/
    Header/
    Timer/
    TimerMetrics/
    TimerControls/
    CompactTimer/
    Settings/
    Appearance/
    BackgroundLibrary/
    WallpaperGrid/
  hooks/
    useTimer.ts
    useSettings.ts
    useWindowState.ts
  services/
    wallhaven.ts
    wallpaperCache.ts
    persistence.ts
    notifications.ts
    audio.ts
  state/
    timerMachine.ts
    types.ts
  styles/
    tokens.css
    globals.css
  assets/
    fonts/
    icons/
    sounds/
    backgrounds/
src-tauri/
  capabilities/
  icons/
  src/
```

Keep timer-domain logic independent from React rendering so timestamp math and transitions can be tested deterministically.

---

## 37. Testing and verification

Automated coverage should include:

- Timer arithmetic, rounding, formatting, pause/resume, and completion
- No drift after delayed render ticks
- Sleep/wake and app-restart reconstruction
- Exactly-once completion effects
- Focus/break transitions and both auto-start settings
- Presets and custom durations
- Settings schema validation, persistence, migration, and corrupt-data recovery
- Cache limits and protection of the current background
- Offline Wallhaven behavior and API failure states
- Window-bound validation after monitor changes

Manual verification on both target platforms must cover:

- Frameless drag and resize behavior
- Always-on-top toggling
- Normal and compact modes
- Window restoration across multiple displays and scale factors
- Notification permission states and sound toggle
- Imported PNG/JPG/JPEG/WEBP backgrounds
- Background blur, opacity, overlay, fit, and all positions
- Wallhaven search, filters, thumbnails, selection, caching, offline state, and retry
- Keyboard navigation, focus visibility, reduced motion, and contrast
- UI polish at minimum, default, and larger supported sizes

---

## 38. V1 acceptance criteria

V1 is complete only when all of the following are true:

1. A user can launch SESH, choose a preset or custom duration, and reliably start, pause, resume, reset, and complete focus and break timers.
2. Remaining time, elapsed time, target time, and the correct focus/break percentage remain accurate after backgrounding, throttling, sleep/wake, and restart.
3. The floating frameless window is draggable, resizable, always-on-top capable, compactable, and safely restored on macOS and Windows.
4. Settings and active-session state persist locally and recover safely.
5. Preset, Wallhaven, and local-image backgrounds work with image-only opacity/blur, overlay, fit, and position controls.
6. Offline use leaves the entire timer functional and degrades only Wallhaven browsing.
7. Notifications and sound respect settings and fire at most once per completion.
8. The app contains no task-management, account, social, cloud, analytics, or gamification features.
9. The interface is recognizably SESH: near-black, Geist-based, compact, restrained, and Axiom-inspired without proprietary assets or trading terminology.
10. The complete experience meets the premium UI/UX quality bar: seamless, polished, responsive, visually coherent, low-friction, accessible, and native-feeling, with no unfinished states.

---

## 39. Implementation priority

Build in this order:

1. Timer domain/state model and deterministic tests
2. Main normal-mode UI and controls
3. Persistence and restart/sleep recovery
4. Frameless window, positioning, resizing, and always-on-top
5. Compact mode
6. Timer settings, notifications, and sound
7. Background layering and appearance controls
8. Presets and local-image library
9. Wallhaven browser and cache
10. Accessibility, performance, cross-platform verification, and final visual/interaction polish

Do not defer polish until after architectural decisions make it difficult. Apply the design tokens, interaction states, accessibility semantics, and responsive constraints throughout implementation.

---

## 40. Final instruction to Codex

Treat this document as the source of truth for SESH V1. Prefer precise, small, maintainable solutions. Do not invent adjacent product features. When a technical constraint requires deviation, document the constraint, preserve the intended user experience, and choose the least expansive alternative.
