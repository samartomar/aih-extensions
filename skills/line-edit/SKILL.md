---
name: line-edit
description: "Line-edit a document so every sentence is load-bearing, every link resolves and the Markdown renders, without losing a fact."
disable-model-invocation: true
---

Line-edit the document the user names. A **line edit** changes how a document reads and never what it says. It is done when every sentence is **load-bearing**: remove it and the reader loses a fact, an instruction or a reason they need.

If the document instructs an agent (a skill, `AGENTS.md`, `CLAUDE.md`, a prompt), also call the Skill tool with "writing-for-agents". Its no-op test is what load-bearing means for that reader. Whatever it would prune or move goes in the report as a proposal: this skill changes only sentences, links and Markdown.

A style rule in the repository's `AGENTS.md`, `CLAUDE.md` or `CONTRIBUTING.md` outranks the reference below.

To check an edit someone else made, skip to step 5 with their before and after.

## Steps

1. **Name the reader.** Write one sentence: who reads this, and what they do next. Take it from the user or the document; ask only when neither says.
2. **Take the inventory.** Before the first edit, write out a numbered list of everything the document carries: each fact, instruction, condition, exception, qualifier, number, name and link target. Done when every sentence, list item and table cell maps to an inventory line or is marked as carrying nothing. For a document so long that the list would run to hundreds of lines, skip it: step 5's check compares every sentence.
3. **Cut** each sentence that carries nothing, and each that restates another without adding to it: an announcement of what follows, a summary of what came before, a point made twice.
4. **Rewrite** what survives, one section at a time, until it meets every rule below. Edit prose only. Code, commands, quotations, identifiers and frontmatter stay byte for byte; a code block may gain the indentation its list item needs. A line you do not reword keeps its own list marker, emphasis marker and wrapping.
5. **Verify** the edit, not the document's claims. Run this skill's `line-check.mjs` with Node: `node <this skill's folder>/line-check.mjs <before> <after>`, or `--git <file>` to compare with the last commit. It pairs each sentence that is no longer present word for word with its nearest match, and lists new sentences, missing links and code, links that do not resolve, and links elsewhere in the repository to a heading you renamed or removed (a link to the web stays unchecked). Without Node, make the same comparison by hand. Done when:
   - [ ] each sentence it lists says the same thing as its nearest match, or is in your report as a cut;
   - [ ] each new sentence it lists is in your report as an addition;
   - [ ] each missing link or code span it lists is in your report with its reason, and the frontmatter is unchanged;
   - [ ] it exits 0: every link into the repository resolves, and nothing links to a heading you renamed or removed;
   - [ ] each inventory number, where you took an inventory, points at the sentence in the result that states it;
   - [ ] the Markdown or link check in the repository's `package.json` or CI passes, if it has one.
6. **Report** the word count before and after; each sentence you cut as carrying nothing; each addition and where you read it; each link you could not resolve and each claim you doubt, both left as written; and the inventory lines this reader could lose, each with the words it would remove. Those last are proposals: cutting one changes what the document says, so the user decides. The goal is every fact kept. Expect about the same length: the document gets shorter only when the user accepts proposals.

## Sentences

- **Open on the point.** The first sentence of the document, and of each section, is the one the reader came for.
- **One name per thing.** Use the project's own term (its glossary, its code, else the document's most exact one) and repeat it exactly. Bold it once, where it is defined.
- **Cut the word the sentence means the same without.** A qualifier stays when it changes the claim (`usually`, on a rule with exceptions).
- **Put a literal in backticks**: a command, path, flag, identifier or exact message the text names. Swap a description for the literal only when the document or its source states it.
- **Keep a reason where the rule would surprise.** Join it to the rule with a colon or "because".
- **Join clauses with the mark that names their relation.** A colon elaborates, a semicolon joins two related clauses, parentheses hold an aside, a period starts the next thought. With the comma, those are the whole set.

## Shape

- **Match form to content.** Ordered actions: a numbered list. Cases the reader scans for their own: bullets. The same fields three times or more: a table, condition on the left. An argument: prose.
- **A heading names what its section holds**, so the outline alone answers "where is X?". Give a heading only to a section a reader jumps to.
- **Bold marks a term at its definition, or the rule a skimmer must keep.** Italics mark a word under contrast.

## Links

- **A link reads as its target's name**, and the sentence around it says what is there or when to follow it.
- **Link a term at its first use only.**
- **Relative between files that travel together; absolute in anything published or pasted elsewhere** (an issue, a pull request, a site).

## Markdown

CommonMark and GFM decide how the text renders, and GitHub adds rules of its own:

- **Text shaped like a tag goes in a code span.** Bare, `<name>` is raw HTML and does not display.
- **A block inside a list item lines up with the item's text**: three spaces under `1. `, four under `10. `, two under `- `. A flush-left fence, heading or new paragraph ends the list.
- **A table cell holds one line of inline text**, with `|` escaped as `\|` even inside a code span. Content that needs a list or a code block becomes a list.
- **Text for a GitHub issue, pull request or comment is one line per paragraph.** GitHub renders each line break there.
