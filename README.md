# Family Tree

A browser-based GEDCOM family-tree experiment with a genealogy-specific layout engine.

## Run locally

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4173/>. Vite reloads the page as files change. The bundled Kennedy sample opens by default; use **Import** to load another `.ged` file locally. After a successful import, that action changes to **Share**. GED data is parsed in the browser and is not uploaded unless **Share** is explicitly selected. Shared trees use an in-memory backend during local development and are cleared when the development server stops.

Choose **Import** to open a local GEDCOM, then **Share** to create a public, unguessable link for it. Clicking **Share** again shows the existing link. Anyone with that link can view the tree; links are not password protected. Production uploads are compressed and stored in a private Tigris bucket.

Select a person and choose **Describe a change** to edit without navigating a form. The first conversational slice can change a primary name, birth date, or birth place, and add a note. The app translates the request into structured operations and shows an exact preview; nothing is committed until **Apply change** is selected. The most recent change can be undone during the current session. The latest edited tree is saved in IndexedDB and restored when the app is next opened without a public share link. Genealogical citations remain separate from the edit provenance that records the approved request.

Choose **Export GEDCOM** to download the edited tree. An unchanged import is returned byte-for-byte. Edited exports patch the preserved GEDCOM syntax so unsupported and unmodelled data remains untouched. Files with malformed lines remain viewable but cannot be edited safely. Names with structured GEDCOM components also remain read-only in this first slice. Editing a publicly shared tree creates a local fork; choose **Share** again to publish a new immutable link.

Uploads are limited to 100 MB and five attempts per client IP per hour. The Fly service also caps per-machine request concurrency so simultaneous multipart uploads cannot exhaust the 256 MB VM. Shared objects do not currently expire; configure a Tigris lifecycle policy before changing that retention behaviour.

After a file opens, its import report shows the detected GEDCOM version and producer, record counts, malformed lines, unsupported tags, skipped duplicate records, and family links to missing people. Valid records still open when the file contains recoverable problems. The parser has compatibility fixtures for GEDCOM 5.5.1 Reunion exports and GEDCOM 7 partner records.

Use **Find** or press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> to search the open tree by name, alias, place, date, or occupation. With a person selected, Find can also compare them with another person; Shift-clicking a second card is the desktop shortcut. The relationship pane shows the closest recorded relationship and a person-by-person family line. Direct ancestors, descendants, siblings, aunts, uncles, nieces, nephews, and ordinary cousin paths receive plain-English labels; paths involving partners retain conservative recorded-connection wording.

Person names and relationship links in the details pane are selectable. Partner lines and descendant lines can also be selected to inspect the corresponding family record or children. Browser Back and Forward step through person, family-line, and comparison selections without putting private GEDCOM identifiers in the URL.

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

Provision a private Tigris bucket for the Fly app once:

```sh
fly storage create -a lox-family-tree
```

Fly sets `BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and the S3 endpoint secrets on the app. The site is packaged with a small Node server that serves the built client and streams shared GEDCOM files to and from Tigris:

```sh
fly deploy
```

## Architecture

- `src/gedcom-parser.js` converts GEDCOM 5.5, 5.5.1, and 7.0-style records into a normalized graph and reports recoverable import problems.
- `src/gedcom-syntax.js` retains the original GEDCOM byte structure and stable syntax paths for lossless no-op export and narrow field patches.
- `src/tree-document.js` imports the parser graph into the versioned canonical editing model with stable identities and validated references.
- `src/tree-projection.js` derives the existing read-only graph contract from the canonical document, including convenient birth, death, occupation, and family event fields.
- `src/tree-operations.js` validates and atomically applies revision-checked operations while producing human-readable previews and inverse operations.
- `src/conversation-editor.js` translates the supported conversational editing patterns into proposed operations without mutating the tree.
- `src/editing-control.js` owns the proposal, approval, and single-session undo dialog while handing approved transactions back to the application session.
- `src/tree-storage.js` persists the latest materialized document in IndexedDB while its compact edit log retains revision provenance without copying the imported GEDCOM for every edit.
- `src/gedcom-export.js` overlays approved edits onto the preserved GEDCOM syntax and refuses unsafe edited exports.
- `src/import-report.js` turns parser diagnostics into the concise report shown beside the tree summary.
- `src/layout-engine.js` is a pure, DOM-independent forest projection and packing engine.
- `src/connection-router.js` bundles one-to-many relationships, allocates obstacle-free channels, and emits trunks, rails, drops, junctions, or paired continuation portals.
- `src/presentation-state.js` computes the selected person's relationship path without coupling color semantics to the layout engine.
- `src/relationship-comparison.js` finds the closest recorded family path and derives conservative directional kinship labels and lineage entries.
- `src/relationship-details.js` presents family-record metadata for selected partner and descendant connections.
- `src/relationship-filter.js` selects people and trims family records for relationship-relative tree views.
- `src/relationship-filter-control.js` owns the filter presets, custom controls, active state, and clear interaction.
- `src/person-search.js` owns person matching and the keyboard-driven find/compare dialog.
- `src/navigation-state.js` validates person, family-connection, and comparison selections and scopes their browser history entries to the GEDCOM currently held in memory.
- `src/details-pane.js` owns the DOM presentation of people, partnerships, descendant groups, and relationship comparisons behind one rendering interface.
- `src/svg-rendering.js` owns shared SVG element creation, rounded connection geometry, hit targets, and keyboard exposure for routed lines.
- `src/app.js` composes the layout, SVG renderer, details pane, selection, resizing, settings, and file loading.
- `src/shared-tree.js` recognises public tree URLs and owns shared-tree upload and download requests.
- `server/app.js` serves the built application and exposes the GEDCOM upload and download API.
- `server/tigris-tree-storage.js` compresses shared GEDCOM files into private Tigris object storage.
- `src/sample.ged` is the default demonstration file and goes through the same parser as an opened GEDCOM.

The engine projects the entire GEDCOM forest, including disconnected families and isolated individuals, into generation units. A unit has one anchor person and zero or more partners, so remarriages do not duplicate the anchor. It then measures those units, packs them into width-constrained generation bands, and places person cards. The connection router assigns clear vertical channels and shared family buses. Destination edges are valid route endpoints rather than false obstacles, and wrapped branches use continuous routed lines across bands. Selecting a person highlights their recorded ancestry and direct children while subduing unrelated context. Filtering removes out-of-scope people and keeps every remaining card at full contrast. The SVG renderer owns typography, colour, animation, and interaction; the engines own only deterministic geometry.

Print layouts can reuse the same engine later by supplying physical page constraints and print-specific card measurements.

## License

[MIT](LICENSE.md) © 2026 Lachlan Donald
