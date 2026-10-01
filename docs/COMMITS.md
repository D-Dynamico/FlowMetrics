# Commits and the session log

The commit history is read. One commit titled "initial commit" containing three
days of work reads as either copied or rushed.

Commit in meaningful increments: config, the table joins, each derived column
group, each cleaning rule, KPI functions, each RCA stage, tests, each endpoint
group, each frontend block, README. Fifteen to thirty commits across three days.

Write messages that say what changed and, when there was a decision, why.

**Write them in plain English.** Someone who has never opened this repository
should understand the message. No jargon, no shorthand, no terms that only make
sense once you already know the code. Say "the carrier stage is always the
longest, so blaming the longest stage would blame it every time" rather than
"attribute by excess over baseline rather than raw duration". Explain the thing
instead of naming it.

Short sentences. Say what changed, then why, then what would have gone wrong the
other way. `fix stuff` is not a message; neither is a message you would have to
translate for a reader.

**No trailers on commit messages.** Subject and body only. No `Co-Authored-By`,
no generated-with attribution, no tool footers. The history is read as evidence
of incremental work by its author, and a trailer undercuts that on the one
artefact where authorship is the point.

Append to `docs/SESSION.md` whenever code lands or a decision is made. One headline,
then four or five lines: what was built, or what was decided and what was
rejected instead. It is a log of what happened, never a plan of what is coming.
