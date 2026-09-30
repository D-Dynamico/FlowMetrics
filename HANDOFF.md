# Handoff

For whoever picks this up next. Read this first, then the three files below.

---

## Read these, in this order

1. **`CLAUDE.md`** — how to work in this repo. Non-negotiable rules, layer
   separation, the vocabulary that must stay consistent, the honesty standard.
   The commit rules there are specific and the user cares about them: plain
   English messages, no trailers, and **never commit unless asked**.
2. **`PLAN.md`** — what the project is and why. Sections 5 (cleaning), 7 (the
   analysis) and 14 (interview questions) are the ones that matter most.
3. **`SESSION.md`** — every decision made so far, one headline plus four or five
   lines each. If you are about to change something and wonder why it is the way
   it is, the answer is almost certainly there. **Append to it whenever you land
   code or make a decision.**
4. **`README.md`** — the finished write-up, with every finding.

---

## Where the project stands

Built and working: cleaning pipeline, KPI layer, root cause analysis, eight API
endpoints, 28 tests, a React dashboard, and the README. 19 commits pushed to
`origin/main`.

Run it:

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python -m uvicorn api.main:app --port 8000     # serves dashboard + API on :8000
python -m pytest tests/                        # 28 with raw CSVs, 27 without
```

The raw Olist CSVs live in `data/raw/` and are gitignored. They are present on
the user's machine. `data/orders_clean.parquet` is committed, so everything runs
without them except the one cleaning test, which skips.

---

## The one thing genuinely unfinished

**Nobody has confirmed the dashboard renders correctly.** The Chrome extension
was never connected during the build, so every frontend change was made without
seeing the result. The user looked once, said "the UI is a real mess", and
picked "renders but looks cheap" from a list of options. A design pass followed
(warm neutrals, one accent, sentence case, a 4px spacing scale, explicit chart
heights) but **nobody has looked since**.

Do not assume it is fixed. Get eyes on it before building anything else on top:
ask the user for a screenshot, or use the browser tools if the extension
connects.

---

## Two small open questions

- `frontend/public/icons.svg` and `frontend/src/assets/hero.png` are committed
  but referenced by nothing. The user added them; they were asked whether to keep
  or delete and have not answered.
- There are uncommitted fixes in the working tree right now: the `PLAN.md` layout
  diagram corrected, the favicon wired into `index.html`, Vite scaffold files
  removed, and the `SESSION.md` date. Ask before committing them.

---

## Things that will look wrong but are deliberate

Check `SESSION.md` before "fixing" any of these.

**No `analysis/geo.py`.** `PLAN.md` originally listed one. Distance is computed
once in `data/clean.py` and stored on the row, so a runtime geo module would have
nothing to do.

**Attribution blames one stage per late order.** Real delays compound. This is a
stated approximation, named in the README limitations, not an oversight.

**Concentration is reported as a ratio, not a raw share.** "Most late orders are
in São Paulo" is true however well it performs, because São Paulo holds 42% of
volume. The share-of-late over share-of-orders ratio is the finding. Do not
simplify it back to a raw share.

**Baselines come from on-time orders only, grouped per stage per order type.**
Both halves matter. Pooling order types makes in-state orders look fast; including
late orders pollutes the baseline with the outliers it is meant to measure.

**Negative durations are dropped, never clamped to zero.** A zero-length stage
reads as the fastest part of the network.

**Volume floors on every ranking** (30 orders per route, 20 per seller, 200 per
category), and they are displayed in the UI. Without them a three-order route
tops every worst-performers list.

**The approval stage is 0.3 h median** and almost never wins attribution. That is
the real answer, not a bug.

---

## Rules that will bite you if you skip `CLAUDE.md`

- **Never commit unless asked.** The user manages their own history. An earlier
  agent committed unprompted and had to undo it.
- **Plain English commit messages.** No jargon. Someone who has never opened the
  repo should follow them. Say "the carrier stage is always the longest, so
  blaming the longest would blame it every time", not "attribute by excess over
  baseline".
- **No trailers.** No `Co-Authored-By`, no generated-with footers. The history is
  read as evidence of the author's own work.
- **No metric is computed twice.** Every number is defined once in `analysis/`.
  Nothing in `api/` or `frontend/` calculates anything.
- **Never claim causation.** The predictors are confounded. The vocabulary is
  "concentrates in", "travels with", "is associated with".
- **Never fabricate a number.** Anything in the README or the dashboard must be
  produced by code here and regenerate on every run.

---

## If you change the analysis

Numbers appear in three places and they must not drift: the generated
`headline` string in `analysis/rca.py`, the README's findings section, and
`SESSION.md`. The headline regenerates itself; the other two do not. Rerun this
after any change to cleaning or attribution and update the README to match:

```bash
python -c "from analysis.loader import load_orders; from analysis.rca import run_rca; print(run_rca(load_orders())['headline'])"
```

---

## Reasonable next steps, if asked

Nothing is required. In rough order of value:

1. Verify the dashboard visually and fix whatever is wrong.
2. A screenshot in the README, if the user changes their mind — they explicitly
   declined one, and the requirement was removed from `PLAN.md` and `CLAUDE.md`.
3. Split the 614 KB JS bundle (almost all Recharts) if page weight matters.
4. Rewrite the three oldest commit messages, which predate the plain-English
   rule. This means rewriting pushed history, so ask first.
