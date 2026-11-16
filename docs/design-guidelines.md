# Finvestik design guidelines

## Shared foundation

Use `static/css/style.css` tokens for backgrounds, borders, text, focus, positive/negative values, and indigo actions. Support both default dark mode and `html.light`; never hard-code a white card or black label. Use Inter with system sans-serif fallbacks. Prefer existing `.content-card`, `.btn`, `.form-input`, and navigation classes over another component system.

## Responsive layout

- Start at 320px. Avoid fixed minimum widths on page columns; use `min-width: 0` for flex/grid children and `minmax(0, 1fr)` for equal columns.
- Keep the hamburger navigation below 1024px: all five desktop links do not fit at the 640px Tailwind breakpoint.
- Use a single column on small screens; profile cards become two columns at 380px. Keep stock tables inside their own horizontally scrollable container rather than shrinking financial values or overflowing the page.
- Stack stock insights below the table below 1024px. Preserve the Analyze control on mobile. Reserve drag resizing for larger screens.
- Keep floating filters inside the viewport. On phones use a single-column, independently scrollable panel with reachable actions.
- Use intrinsic image proportions, explicit HTML width/height where known, and `max-width: 100%`. Avoid loading large images for small icons.

## Accessibility and interaction

- Give interactive controls a 44px touch target, visible keyboard focus, an accessible name, and semantic buttons/links. Tooltips alone are insufficient for icon buttons.
- Keep phone text inputs at least 16px to avoid automatic iOS focus zoom. Every input needs a programmatic label and errors associated with that input.
- Honor `prefers-reduced-motion`. Do not communicate gains, losses, loading, or validation only through color or animation; include readable numbers and status text.
- Use adequate contrast in both themes (WCAG AA: 4.5:1 normal text, 3:1 large text). Check final composited gradient colors as well as tokens.
- Dialogs and menus must be operable with a keyboard; return focus when closed and keep `aria-expanded` synchronized.

## Review before shipping

Serve the repository root (`python -m http.server 8000`), then check Home, Education, Position Calculator, Custom Index, Stock Universe, and RRG at 320, 375, 768, 1024, and 1440px. Test both themes, keyboard navigation, 200% zoom, reduced motion, open menus/filters, table scrolling, and loading/error states. A table may scroll horizontally; the document should not. Verify calculators and data filters still behave correctly. Test a real mobile browser before claiming device compatibility.
