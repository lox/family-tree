# Family Tree

A browser-based GEDCOM family-tree experiment with a genealogy-specific layout engine.

## Run locally

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4173/>. Vite reloads the page as files change. The bundled Kennedy sample opens by default; use **Open GEDCOM** to load another `.ged` file locally. GED data is parsed in the browser and is not uploaded.

After a file opens, its import report shows the detected GEDCOM version and producer, record counts, malformed lines, unsupported tags, skipped duplicate records, and family links to missing people. Valid records still open when the file contains recoverable problems. The parser has compatibility fixtures for GEDCOM 5.5.1 Reunion exports and GEDCOM 7 partner records.

Use **Find** or press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> to search the open tree by name, alias, place, date, or occupation. Selecting a relationship in Person Details moves to that person. Browser Back and Forward step through person selections without putting private GEDCOM identifiers in the URL.

Selecting a person focuses their recorded ancestry, partners, and direct children while leaving the rest of the tree visible as subdued context. Double-click a person to filter the canvas to their family branch. The **Filter** panel also provides immediate-family, ancestor, and descendant presets, generation-depth controls, and optional sibling or partner inclusion. Use the × beside an active filter to restore the full tree.

## Test

```sh
npm test
npm run build
```

To exercise the layout with a deterministic 966-person, 240-family pedigree:

```sh
npm run benchmark
```

## Deploy

The site is packaged as a small Nginx container and configured for Fly.io:

```sh
fly deploy
```

## Architecture

- `src/gedcom-parser.js` converts GEDCOM 5.5, 5.5.1, and 7.0-style records into a normalized graph and reports recoverable import problems.
- `src/import-report.js` turns parser diagnostics into the concise report shown beside the tree summary.
- `src/layout-engine.js` is a pure, DOM-independent forest projection and packing engine.
- `src/connection-router.js` bundles one-to-many relationships, allocates obstacle-free channels, and emits trunks, rails, drops, junctions, or paired continuation portals.
- `src/presentation-state.js` computes the selected person's relationship path without coupling color semantics to the layout engine.
- `src/relationship-filter.js` selects people and trims family records for relationship-relative tree views.
- `src/relationship-filter-control.js` owns the filter presets, custom controls, active state, and clear interaction.
- `src/person-search.js` owns person matching and the keyboard-driven search dialog.
- `src/navigation-state.js` scopes browser history entries to the GEDCOM currently held in memory.
- `src/details-pane.js` owns the DOM presentation of a selected person's facts, events, relationships, notes, sources, media, and record metadata behind one rendering interface.
- `src/app.js` composes the layout, SVG renderer, details pane, selection, resizing, settings, and file loading.
- `src/sample.ged` is the default demonstration file and goes through the same parser as an opened GEDCOM.

The engine projects the entire GEDCOM forest, including disconnected families and isolated individuals, into generation units. A unit has one anchor person and zero or more partners, so remarriages do not duplicate the anchor. It then measures those units, packs them into width-constrained generation bands, and places person cards. The connection router assigns clear vertical channels and shared family buses. Destination edges are valid route endpoints rather than false obstacles, and wrapped branches use continuous routed lines across bands. Selecting a person highlights their recorded ancestry and direct children while subduing unrelated context. Filtering removes out-of-scope people and keeps every remaining card at full contrast. The SVG renderer owns typography, colour, animation, and interaction; the engines own only deterministic geometry.

Print layouts can reuse the same engine later by supplying physical page constraints and print-specific card measurements.

## License

[MIT](LICENSE.md) © 2026 Lachlan Donald
