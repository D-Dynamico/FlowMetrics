# Honesty and documentation

## Limitations to name first

This is the thing most likely to be tested under questioning, and the most
costly to get wrong.

An interviewer will find a limitation in this project. There is no version of a
three-day analysis on someone else's 2016 data without them. The only variable is
whether they find it because you named it or because you did not.

Name them first, in the README's limitations section and in conversation:

- The carrier leg is composite, so the largest source of delay is the one this
  data can say least about
- Findings are associations, not causes, and the predictors are confounded
- The data is Brazilian, not Indian: the marketplace structure and regional
  gradient transfer, but RTO from cash on delivery, festive-peak surges and quick
  commerce are entirely absent
- The window is 2016 to 2018, before the pandemic reshaped e-commerce logistics
- A stated share of raw rows was excluded, with per-rule counts
- Multi-seller orders are out of scope, so the seller findings apply to a subset
- No workforce, staffing or facility-capacity dimension exists in the data
- Delivery attempts and returns are invisible; there is one delivery timestamp
  and no attempt count
- Route and hub optimisation are scoped but not built

Every one of these, volunteered, reads as judgement. Every one, extracted, reads
as a gap. The content is identical; only the order changes.

The same standard applies to anything derived from this project. If a resume
bullet, form answer or interview claim cannot be traced to something in this
repository, it does not get said.

## The README

The README is the most-read artefact in the repository. Written last, after the
numbers are final, for someone who will not open the code.

Requirements are in `docs/PLAN.md` section 12. The four most often skipped and most
important:

- **The data source and attribution**, up top, not at the bottom.
- **What was excluded and why**, with counts. This is what makes every other
  number in the document trustworthy.
- **The causal caveat**, in its own paragraph.
- **Why attribution uses excess over baseline.** The one genuine methodological
  decision, and explaining it is what separates a project someone built from a
  project someone understands.

A screenshot helps, but the run instructions carry more weight: they must work
from a clean clone, verified, so a reader can see the thing running in under a
minute rather than taking an image on trust.
