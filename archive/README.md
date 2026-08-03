# ATL / ВСЕЛЕННАЯ

An interactive map of the fictional universe in [ATL](https://genius.com/artists/Atl)'s lyrics —
634 entities (creatures, places, concepts, symbols) pulled from 251 songs, clustered into
eight "gravity zones" and rendered as a force-directed star map.

```
web/          the site — a Vite + D3 single-page app.  This is the whole product.
archive/      the v1 prototype, kept for reference.
```

`web/public/data.js` holds the finished universe — every entity, connection and song —
and is committed, so the site runs from a fresh clone with no API keys, no scraping and
no build step beyond `npm install`.

## Running the site

```bash
cd web
npm install
npm run dev          # → http://localhost:5173
```

> **Don't open `web/index.html` from disk — it will render a blank page.**
> It's a Vite source file: the browser blocks `<script type="module">` over `file://`,
> and `/src/main.js` and `/data.js` are server-absolute paths that resolve to your
> drive root. The site has to be served over http. Use `npm run dev` above, or
> `npm run build && npm run preview` for the production bundle.

Build a static bundle with `npm run build` — output lands in `web/dist/`, deployable
as plain files to any static host.

```bash
npm run build && npm test    # headless smoke test over the built bundle
```

`web/test/smoke.mjs` boots the bundle in jsdom and drives the interactions that were
broken before — rebuilding the graph, opening an entity, clicking a zone — so those
regressions can't come back quietly.

### How to use it

| | |
|---|---|
| **СЛОЙ** slider | how deep to dig — `ЯДРО` shows only recurring entities, `ВСЁ` shows all 634 |
| **Type buttons** | filter by существа / персонажи / концепции / символы / места / явления |
| **Click a node** | opens the side panel; "Открыть полную страницу →" opens the full entity page |
| **Click a zone name** | flies the camera to that region |
| **Timeline** | click a year to filter; hover an album dot for its track list |

Every view is deep-linkable: `#/entity/{id}`, `#/wiki/{id}`, `#/zone/{id}`, `#/year/{year}`, `#/song/{id}`.

## Where the data came from

`web/public/data.js` was generated offline by a three-stage Python pipeline that is **not
part of this repo** — it scraped every ATL song from Genius, had an LLM read each one and
name the entities carrying real weight in it (typed as существо / персонаж / концепция /
символ / место / явление, each with a description, an origin and a verbatim excerpt), then
clustered the resulting free-form "realms" into the eight fixed zones you see on the map.

That stage ran once. Nothing in this repo depends on it, and you never need to run it —
`data.js` is the finished artifact and it's committed.

## Notes on the data

- 251 songs → 634 entities → 726 connections.
- 551 of those 634 entities appear in exactly one song, so the graph is genuinely sparse at
  the edges. The `СЛОЙ` slider exists to hide that tail — `ЯДРО` shows only what recurs.
- `переход` is the catch-all zone for realms that matched no keyword, which makes it the
  biggest at 181 nodes. It's a quirk of the clustering, not a statement about the lyrics.
- Full song lyrics are deliberately not here — only short excerpts, as evidence for each entity.
