# CLAUDE.md — Working guidelines for FlowMetrics

A three-day portfolio project for a supply chain operations role, built on the
Olist Brazilian e-commerce dataset: about 100,000 real, anonymised marketplace
orders from 2016 to 2018. An operations hiring manager will skim it, then ask
about it in an interview.

**The code is not the deliverable. The defensible finding is.** Optimise for
explainability over cleverness, every time.

## Where things are

| File | What it holds |
|---|---|
| `docs/PLAN.md` | What to build and why: data, domain model, cleaning, analysis, API, frontend |
| `docs/SESSION.md` | Log of every decision made so far. Check it before "fixing" something that looks wrong |
| `docs/CODE_GUIDELINES.md` | Layer rules, config, naming, docstrings, nulls, what not to build, testing |
| `docs/GLOSSARY.md` | The exact terms to use everywhere (late, legs, adherence, bottleneck leg...) |
| `docs/HONESTY.md` | Limitations to name up front, and what the README must contain |
| `docs/COMMITS.md` | How to write commit messages and log entries |

## Non-negotiables

1. **Never fabricate a number.** Every figure in the README or dashboard is
   produced by code here, from the committed data, and is reproducible.
2. **Never hardcode a finding.** The headline is assembled from computed values
   at runtime.
3. **Every exclusion is counted and surfaced:** in `/api/meta`, on the dashboard
   and in the README.
4. **Never claim causation.** Say "concentrates in", "travels with", "is
   associated with". Never "causes", "drives", "because of".
5. **Never claim a capability that is not in the repo.** Route and hub
   optimisation are future work.
6. **Attribute the data.** Credit Olist and Kaggle in the README and the
   dashboard footer. Raw CSVs stay gitignored.

## Basic rules

- **Four layers:** `data/clean.py` cleans, `analysis/` computes, `api/` serialises,
  `frontend/` displays. No metric is computed outside `analysis/`.
- **Every judgement call lives in `config.py`.**
- **Never `fillna(0)` on a duration.** Drop the row and count it.
- **Don't build** auth, a database, Docker, CI, caching, ML or async.
- **Commit only when asked.** Messages in plain English, with no trailers. See
  `docs/COMMITS.md`.
- **Append to `docs/SESSION.md`** whenever code lands or a decision is made.

## Running it

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python -m uvicorn api.main:app --port 8000   # dashboard + API on :8000
python -m pytest tests/
```
