

## Neater Release Notes Display

Right now the release notes dump as a single `whitespace-pre-line` text block inside the download card, which makes it long and hard to scan (as seen in the screenshot). The content has clear structure — a title line, "Added" items, "Improved" items, and "Known Requirements" — that can be parsed and rendered nicely.

### Approach

Move the release notes out of the download card into a collapsible accordion below the two-column grid. Parse the raw text into structured sections and render them with proper formatting:

1. **Move release notes to a standalone collapsible card** below the download/setup grid using the existing `Collapsible` or `Accordion` component. Default state: collapsed, showing just "What's new in v0.2.0" as a clickable header.

2. **Parse the release notes text** into sections by splitting on known headings ("Known Requirements", etc.) and bullet-style lines (lines starting with "Added", "Improved", "Fixed", "Removed"):
   - Title line → card header subtitle
   - "Added …" / "Improved …" lines → rendered as a bulleted list with category badges
   - "Known Requirements" block → separate styled callout

3. **Visual treatment**:
   - Each changelog line gets a small colored badge: green for "Added", blue for "Improved", yellow for "Fixed"
   - Known Requirements section gets an info-style callout (like the existing Tip box)
   - The whole section stays compact when collapsed — one line with a chevron

### Files changed

- `src/components/dashboard/DesktopApp.tsx` — remove inline release notes block from the download card, add a new collapsible release notes section below the grid with structured parsing and rendering.

### Result

The download card stays clean and focused on the download button + feature highlights. Release notes are accessible but don't dominate the page. Structured formatting makes them scannable at a glance.

