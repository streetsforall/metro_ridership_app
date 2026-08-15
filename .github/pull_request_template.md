## What and why

<!-- What changes, and what problem it solves. Link the issue. -->

## Checklist

- [ ] `npm run lint`, `npm run test` and `npm run build` pass
- [ ] Renamed or deleted an exported symbol? Grepped `README.md`, `CONTEXT.md`, `CLAUDE.md` and
      `docs/` for it — including `docs/architecture/mermaid/` and `captions.md`
- [ ] Changed a diagram source? Ran `npm run docs:architecture` and committed `diagrams.md`
- [ ] Changed the UI? Screenshot below, and Linux baselines regenerated with
      `npm run test:e2e:update:linux`

<!--
Baselines: only the -linux.png set is committed and it is what gates CI.
Never regenerate baselines to silence a diff you can't explain — see docs/guides/testing.md.
-->
