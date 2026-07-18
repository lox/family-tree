# Family Tree

A browser-based GEDCOM family-tree experiment with a genealogy-specific layout engine.

## Run locally

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173/family-tree.html>. The bundled Kennedy sample opens by default; use **Open GEDCOM** to load another `.ged` file locally. GED data is parsed in the browser and is not uploaded.

## Test

```sh
npm test
```

## Architecture

- `src/gedcom-parser.js` converts GEDCOM 5.5-style records into a normalized graph of people and families.
- `src/layout-engine.js` is a pure, DOM-independent forest projection and packing engine.
- `src/connection-router.js` bundles one-to-many relationships, allocates obstacle-free channels, and emits trunks, rails, drops, junctions, or paired continuation portals.
- `src/presentation-state.js` computes the selected person's relationship path without coupling color semantics to the layout engine.
- `src/details-pane.js` owns the DOM presentation of a selected person's facts, events, relationships, notes, sources, media, and record metadata behind one rendering interface.
- `src/app.js` composes the layout, SVG renderer, details pane, selection, resizing, settings, and file loading.
- `src/sample-data.js` supplies the default demonstration graph.

The engine projects the entire GEDCOM forest, including disconnected families and isolated individuals, into generation units. A unit has one anchor person and zero or more partners, so remarriages do not duplicate the anchor. It then measures those units, packs them into width-constrained generation bands, and places person cards. The connection router assigns clear vertical channels and shared family buses. Destination edges are valid route endpoints rather than false obstacles, and wrapped branches use continuous routed lines across bands. The tree is neutral by default; selecting a person applies one green relationship path through their recorded ancestry and subdues unrelated context. The SVG renderer owns typography, colour, animation, and interaction; the engines own only deterministic geometry.

Print layouts can reuse the same engine later by supplying physical page constraints and print-specific card measurements.

## License

[MIT](LICENSE.md) © 2026 Lachlan Donald
