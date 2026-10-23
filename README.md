# slop-lint-web

The **slop-lint** readability linter as a zero-backend web page: paste
AI-generated text, get a plainness score (0–100) with flagged lines.
Bilingual English/Chinese, 100% in-browser — text never leaves the page.

This is the web companion of the
[slop-lint CLI](https://github.com/hahahahahahahahah6/slop-lint)
([PyPI](https://pypi.org/project/slop-lint/)).

## How it works

- `rules.json` — word lists and regex sources **auto-extracted** from
  `slop_lint.py` by `tools/extract_rules.py`. Never hand-edit; re-run the
  extractor when the CLI's rules change.
- `slop.js` — a faithful JS port of the Python scoring engine
  (sentence splitting, buzzword/hedge scan, full Chinese L1/L2/structure
  rule set, em-dash quota, Flesch-style reading ease, 0–100 scoring).
- `index.html` — the UI (dark, minimal, debounced live analysis).

## Parity with the CLI

`test/run.js` checks 12 samples (EN slop/plain, ZH slop/plain, mixed,
empty, code fences, markdown, translationese, negation openings, long
sentences, unsourced authority) against golden outputs produced by the
Python engine (`test/samples.py` → `test/samples.json`).

```
python3 test/samples.py   # regenerate goldens from slop_lint.py
node test/run.js          # 12/12 must match (plainness, stats, findings)
```

Current status: **12/12 match** (slop-lint 0.2.0 rule set).

## Deploy

Any static host works — copy `index.html`, `slop.js`, `rules.json`:

```bash
# Cloudflare Pages / GitHub Pages / nginx — no build step
cp index.html slop.js rules.json /var/www/slop-lint/
```

## Regenerating rules after a CLI update

```bash
python3 tools/extract_rules.py   # pulls from ../../slop-lint/slop_lint.py
python3 test/samples.py && node test/run.js
```

## License

MIT — see [LICENSE](LICENSE).
