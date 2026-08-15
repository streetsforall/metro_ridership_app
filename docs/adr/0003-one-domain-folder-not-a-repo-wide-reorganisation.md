# `src/ridership/` is one domain folder, not the start of a repo-wide reorganisation

Status: superseded by [ADR-0007](0007-a-folder-with-an-index-is-a-sealed-module.md), which replaces
the pause below with a standing rule. The reasoning here still holds; the deferred `src/utils/`
reorganisation is tracked in
[#170](https://github.com/streetsforall/metro_ridership_app/issues/170).

`src/` is otherwise flat — `components/`, `hooks/`, `utils/`, `data/`, `@types/`. We introduced a
single domain folder, `src/ridership/`, so that the ridership derivation has a real interface: an
`index.ts` that is its entire public surface, with `chartData.ts` sitting inside it as
implementation. Anything importing `../ridership/chartData` is then visibly reaching past a seam,
which a flat `src/utils/ridershipView.ts` could only have asked for in a comment.

We deliberately did **not** sort the rest of `src/utils/` into domain folders at the same time.
`mapPopup`, `queryParams`, `dataDateRange` and `ridershipData` would each have touched every
importer, in a change whose reviewability depends on the diff containing nothing but relocation and
extraction. Two queued pieces of work — collapsing `calc.ts` into one metrics interface, and
unifying the app's several month encodings into a `Month` module — will move files themselves and
are better placed to say where the remaining boundaries actually are.

So the asymmetry is intended. `src/ridership/` is where the ridership derivation, its month-axis
helpers, and later its metrics and month modules live. Everything else stays where it is until
there is a reason beyond tidiness to move it.
