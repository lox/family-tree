# Family Tree

A browser-based GEDCOM family-tree experiment with a genealogy-specific layout engine.

## Run locally

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4173/>. Vite reloads the page as files change. The bundled Kennedy sample opens by default; use **Open GEDCOM** to load another `.ged` file locally. GED data is parsed in the browser and is not uploaded.

After a file opens, its import report shows the detected GEDCOM version and producer, record counts, malformed lines, unsupported tags, skipped duplicate records, and family links to missing people. Valid records still open when the file contains recoverable problems. The parser has compatibility fixtures for GEDCOM 5.5.1 Reunion exports and GEDCOM 7 partner records.

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
- `src/details-pane.js` owns the DOM presentation of a selected person's facts, events, relationships, notes, sources, media, and record metadata behind one rendering interface.
- `src/app.js` composes the layout, SVG renderer, details pane, selection, resizing, settings, and file loading.
- `src/sample.ged` is the default demonstration file and goes through the same parser as an opened GEDCOM.

The engine projects the entire GEDCOM forest, including disconnected families and isolated individuals, into generation units. A unit has one anchor person and zero or more partners, so remarriages do not duplicate the anchor. It then measures those units, packs them into width-constrained generation bands, and places person cards. The connection router assigns clear vertical channels and shared family buses. Destination edges are valid route endpoints rather than false obstacles, and wrapped branches use continuous routed lines across bands. The tree is neutral by default; selecting a person applies one green relationship path through their recorded ancestry and subdues unrelated context. The SVG renderer owns typography, colour, animation, and interaction; the engines own only deterministic geometry.

Print layouts can reuse the same engine later by supplying physical page constraints and print-specific card measurements.

## License

[MIT](LICENSE.md) © 2026 Lachlan Donald
