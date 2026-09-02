---
name: nh-style-markdown
description: "Enforces a house Markdown style: ASCII-only punctuation (plain hyphens, straight quotes, three literal periods instead of an ellipsis character), emphasis reserved for load-bearing terms only, soft-wrapped paragraphs with no hard line breaks, consistently nested headings in sentence case, one bullet marker per list with blank lines around each list block, tables with a header row plus separator row and a consistent column count, code blocks always fenced and language-tagged when known, and active-voice prose free of filler qualifiers like basically, essentially, or simply. Use when writing or editing a Markdown file (README, SKILL.md, docs, PR description, or commit body), reviewing a Markdown diff before committing, or auditing existing Markdown content against house style."
---

# nh-style-markdown

Markdown in this project gets read by humans, by other agents, and by tools that diff it line by line. A stray em dash, a skipped heading level, or a hard-wrapped paragraph does not break rendering outright, but it does break diffs, break greps, and break the illusion that the docs came from one disciplined hand instead of a dozen different editor defaults. This skill enforces one house style so every Markdown file in a diff looks like it was written under the same rules.

## ASCII-only punctuation

- No em dash or en dash. Use a plain hyphen `-`, or restructure the sentence into two clauses joined by a period, comma, or colon.
- No curly or smart quotes (`'` `'` `"` `"`). Use straight quotes (`'` and `"`) only.
- No ellipsis character (`...` as a single glyph). Type three literal periods (`...`) instead, so the character survives copy-paste and search-and-replace unchanged.
- These substitutions exist because curly quotes and dashes are frequently auto-inserted by word processors and some editors, and they render inconsistently across terminals, diff tools, and static site generators. Plain ASCII always round-trips cleanly.

## Emphasis: bold and italics are for load-bearing terms only

- Reserve `**bold**` and `*italics*` for the handful of words in a document where missing the emphasis would cause a reader to misread the sentence: a genuine warning, a term being defined for the first time, a word being contrasted against its opposite.
- Do not bold every noun phrase, product name, or file path out of habit. A document where half the words are bold has, in effect, no emphasis at all, because the reader can no longer tell which bold word actually matters.
- If a whole paragraph feels like it needs emphasis, the paragraph is probably too long or the wrong information is buried in it. Restructure instead of bolding your way out of it.

## Paragraphs: let lines soft-wrap

- Do not insert manual line breaks inside a paragraph to keep lines under some fixed column width. Write the paragraph as one logical block and let the renderer or editor wrap it.
- Hard-wrapping breaks diffs: editing one word near the start of a hard-wrapped paragraph reflows every line after it, so a one-word edit shows up as a multi-line diff. It also renders as one run-on paragraph in any viewer that does not preserve the original line breaks (which is most of them), producing the opposite of the intended effect.
- A hard line break is acceptable only when Markdown syntax requires it (for example, a line ending in two trailing spaces, or a genuine list item boundary), never as a paragraph-formatting habit.

## Headings: consistent nesting, sentence case

- Nest headings without skipping levels. An `h2` section can contain `h3` subsections, but never jump straight from `h2` to `h4`. A reader (and a table-of-contents generator) infers document structure from heading depth, and a skipped level breaks that inference.
- Use sentence case for headings (`## Configure the retry queue`), not Title Case (`## Configure The Retry Queue`). This is this skill's own convention, not a universal Markdown rule. Adopt it for consistency within a project even if other style guides prefer Title Case.
- Do not use a heading as a bolded label for a single sentence. If a section is one line long, it usually belongs as a bullet point or a bolded lead-in inside the parent section instead of its own heading.

## Lists: consistent bullet marker style, blank lines around the block

- Pick one bullet marker (`-` or `*`, not both) per document and use it for every unordered list in that document. Mixing markers within one file is a style inconsistency even though most renderers accept either.
- Put one blank line before the first item of a list and one blank line after the last item. Some Markdown renderers merge a list into the preceding paragraph, or fail to render it as a list at all, when the blank line is missing.
- Nested list items should use consistent indentation (commonly two or four spaces per level) throughout the document, not a mix of tab-width assumptions.

## Tables: header row, separator row, consistent column count

- Every table needs a header row and a separator row (`| --- | --- |`) directly beneath it. A table missing the separator row is not a Markdown table; most renderers will print it as a plain paragraph with pipe characters in it.
- Every row, including the header, must have the same number of columns. A row with a missing or extra pipe silently shifts every following cell into the wrong column.
- Keep cell content short. A table cell that needs a paragraph of text is a sign the content belongs in prose below the table, not squeezed into a cell.

## Code blocks: always fenced, language-tagged when known

- Always use fenced code blocks (three backticks or a tilde fence), never the four-space-indent style. Indented code blocks are visually ambiguous with a genuinely indented list item or blockquote, and many renderers and syntax highlighters do not recognize them as code at all.
- Tag the fence with the language when you know it (` ```python `, ` ```bash `, ` ```json `). This enables correct syntax highlighting and lets tooling (and readers) distinguish "runnable code" from "illustrative text."
- Use ` ```text ` or an untagged fence only when the content genuinely has no language (raw output, a directory listing, prose you want preserved verbatim).

## Readability: active voice, no filler qualifiers

- Prefer active voice ("the queue drops the job" not "the job is dropped by the queue"). Active voice names the actor, which is almost always the more useful fact, and it is shorter.
- Cut filler qualifiers that add no information: "basically," "essentially," "simply," "just," "obviously." If a sentence reads the same with the qualifier removed, the qualifier was never carrying weight. If removing it changes the meaning, replace it with the specific claim it was gesturing at.
- Prefer one clear sentence over one long sentence stitched together with multiple clauses. If a sentence needs more than one comma-joined clause to make its point, it is usually two sentences trying to be one.

## Quick reference

| Rule | What to avoid | What to do instead |
| --- | --- | --- |
| Punctuation | Em dash, en dash, curly quotes, ellipsis character | Plain hyphen, straight quotes, three literal periods |
| Emphasis | Bolding every noun phrase | Bold or italicize only genuinely load-bearing terms |
| Paragraphs | Manual line breaks at a fixed column width | Let the paragraph soft-wrap as one block |
| Headings | Skipping a nesting level, Title Case | Nest one level at a time, sentence case |
| Lists | Mixed bullet markers, no surrounding blank lines | One marker per document, blank line before and after |
| Tables | Missing separator row, inconsistent column count | Header row plus separator row, same column count every row |
| Code blocks | Four-space-indented code | Fenced code, language-tagged when known |
| Prose | Passive voice, filler qualifiers | Active voice, specific claims |

## Good examples

Example 1: a paragraph and list that follow every rule above.

```markdown
The retry queue drains in FIFO order, but a failed job goes back to the tail instead of blocking the rest of the batch. This keeps one bad job from starving every job behind it.

The queue supports three modes:

- `strict`: stop entirely on the first failure
- `lenient`: retry a failed job up to three times, then drop it
- `passthrough`: log failures and continue without retrying

Use `lenient` unless you have a specific reason to pick one of the other two.
```

Why this passes: the paragraph is one soft-wrapped block with no manual line breaks, the list uses a single marker (`-`) with a blank line before and after it, nothing is bolded because nothing here needs it, and every character is plain ASCII.

Example 2: a table plus a fenced, language-tagged code block.

````markdown
| Status code | Meaning | Retry? |
| --- | --- | --- |
| 429 | Rate limited | Yes, with backoff |
| 500 | Server error | Yes, once |
| 400 | Bad request | No |

Call the endpoint like this:

```python
response = client.get("/v1/jobs", timeout=5)
response.raise_for_status()
```
````

Why this passes: the table has a header row and a separator row, every row has exactly three columns, and the code block is fenced with `python` as its language tag instead of being indented.

## Bad example

```markdown
### Getting Started

Basically, this Section explains how the Service works - its pretty simple…

#### Overview

* First, a request is basically received.
- Then it's essentially validated.
* Finally it is processed by the system

Name | Type
Alice | Admin
Bob Editor

    def handle(request):
        return process(request)

The response is always sent back once the payload has been fully validated by the system.
```

What's wrong:

- `### Getting Started` uses Title Case instead of sentence case, and it should read "Getting started."
- `#### Overview` jumps from `h3` straight to `h4` with no `h3` sibling structure justifying it here; more concretely, a document that starts its first heading at `h3` and its second at `h4` has skipped establishing `h1`/`h2` context, which is the nesting violation this rule exists to catch.
- "Basically" and "essentially" are filler qualifiers that add no information and should be deleted.
- The em-dash-style hyphen usage plus the curly apostrophe in "its pretty simple" and the literal ellipsis character are all non-ASCII punctuation; this line should read "The service works. It is simple."
- The first list mixes `*` and `-` markers across three items, and it has no blank line before it (it runs directly into the paragraph above).
- The table has a header row (`Name | Type`) but no separator row underneath it, so most renderers will print it as plain text, not a table. The second data row (`Bob Editor`) is also missing its column delimiter, giving it one column where every other row has two.
- `    def handle(request):` is a four-space-indented code block instead of a fenced one, so it has no language tag and risks being confused with an indented list continuation.
- The closing sentence is passive voice ("the response is always sent back... by the system") where naming the actor directly ("the system sends the response back") is shorter and clearer.

## Pre-submission checklist

- [ ] No em dash, en dash, curly quotes, or ellipsis character anywhere in the file
- [ ] Bold and italics appear only on genuinely load-bearing terms, not on every noun phrase
- [ ] No manually inserted line breaks inside paragraphs; each paragraph is one soft-wrapped block
- [ ] Headings nest one level at a time with no skipped levels, and use sentence case
- [ ] Every list in the document uses one consistent bullet marker, with a blank line before and after the list block
- [ ] Every table has a header row, a separator row, and the same column count in every row
- [ ] Every code block is fenced, and language-tagged whenever the language is known
- [ ] Prose favors active voice and contains no filler qualifiers (basically, essentially, simply, just, obviously)
