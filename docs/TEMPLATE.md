# <Subject> — Reference

This document describes **every <entry type>** in <subject / module /
application>, in detail. For each entry you will find:

- **What it is** – the exact definition or technical behaviour.
- **Details** – inputs, parts, members, or parameters.
- **Result** – what comes out, or the answer.
- **Related** – where it comes from and what it connects to.
- **Plain-language use** – what it is for in non-technical words.
- **Importance** – a three-level ranking: **major**, **mid**, or **minor**.

> **How to use this template**
>
> 1. Copy this file and give it a subject-specific name (e.g. `BIOLOGY.md`).
> 2. Replace every `<...>` placeholder with real content.
> 3. Delete this note and the "Format rules" section once you are done.
> 4. Keep the heading and field shapes: Ownquiz uses them to build cards.

The subject is split into these parts:

| Part | Role |
| --- | --- |
| `<part 1>` | <one-line description of its role> |
| `<part 2>` | <one-line description of its role> |

A shared design rule: **<state the one principle that applies everywhere,
e.g. "the core never talks to the user directly">.**

---

## Format rules (delete after reading)

Ownquiz parses this file line by line:

- A `#### \`Name\` — source` heading starts a new card.
- Text after the em dash (`—`) becomes the card's source/location label.
- A `- **Label:** value` (or `- **Label**: value`) line becomes one field.
- `###` headings group cards into sections; `##` headings start a new part.
- A `---` line ends the current card.
- The field `Importance` must contain `major`, `mid`, or `minor`. Missing or
  unrecognised values are treated as `mid`.
- Card names should be unique; they are used as stable IDs for saved progress.

For non-code subjects, rename any field label you like (for example
"Parameters" → "Ingredients", "Returns" → "Answer"). Only the `####` heading,
the `- **Label:**` field shape, and `Importance` are required.

---

## Importance ranking

Each entry is ranked by how central it is to the subject. The ranking is a
learning aid, not a judgement.

| Level | Meaning | Count |
| --- | --- | ---: |
| **Major** | Core to a headline topic or to the correctness of the whole subject. If it is missing, the rest cannot be understood. Study these first. | `<n>` |
| **Mid** | Important supporting material: definitions, processes, and links that many entries rely on. | `<n>` |
| **Minor** | Small details, side facts, and convenience items. Useful to know, but easy to replace. | `<n>` |

Rule of thumb: **major** entries answer "what is the subject actually about?",
**mid** entries answer "how do the pieces fit together?", and **minor** entries
answer "which small detail rounds it out?".

---

## Table of contents

- [Format rules](#format-rules-delete-after-reading)
- [Importance ranking](#importance-ranking)
- [Part 0 – Shared ideas](#part-0--shared-ideas)
- [Part 1 – `<part 1>`](#part-1--part-1)
  - [1.1 Core concepts](#11-core-concepts)
  - [1.2 Key facts and constants](#12-key-facts-and-constants)
  - [1.3 Processes and relationships](#13-processes-and-relationships)
- [Part 2 – `<part 2>`](#part-2--part-2)
  - [2.1 <subsection>](#21-subsection)
  - [2.2 <subsection>](#22-subsection)
- [Appendix – Quick reference](#appendix--quick-reference)

---

## Part 0 – Shared ideas

Before the individual entries, a few concepts recur everywhere:

- **`<term>`** – <what it means and why it is used consistently>.
- **`<term>`** – <definition>.
- **`<term>`** – <definition>.

---

## Part 1 – `<part 1>`

### 1.1 Core concepts

These are the "shapes" of the subject. Replace this example with your own
entries.

#### `<ConceptName>` — `<source:line>`

- **Importance:** **major** — <why this concept is central>.
- **What it is:** <exact definition>.
- **Fields / Parts:**
  - `<name>` – <meaning>.
  - `<name>` – <meaning>.
- **Created by / Comes from:** `<source:line>`.
- **Used by / Appears in:** <where else it matters>.
- **Plain-language use:** <everyday explanation>.

#### `<SecondConcept>` — `<source:line>`

- **Importance:** **mid** — <why it matters>.
- **What it is:** <definition>.
- **Fields / Parts:**
  - `<name>` – <meaning>.
- **Related:** `<other entry>`.
- **Plain-language use:** <everyday explanation>.

---

### 1.2 Key facts and constants

Use this subsection for fixed values, formulas, classifications, or vocabulary.

#### `<KEY_FACT>` — `<source:line>`

- **Importance:** **minor** — <why it is stored as a constant>.
- **What it is:** <the value and what it controls>.
- **Value / Meaning:** `<value>` – <explanation>.
- **Used by:** <where it appears>.
- **Plain-language use:** <the short version>.

---

### 1.3 Processes and relationships

Use this subsection for steps, functions, mechanisms, or cause-and-effect
chains.

#### `<processName>()` — `<source:line>`

- **Importance:** **major** — <why this process is central>.
- **What it does:** <step-by-step behaviour>.
- **Parameters / Inputs:** `<name>: <type>` – <meaning>.
- **Returns / Output:** `<type>` – <meaning>.
- **Called from / Triggered by:** `<source:line>`.
- **Calls / Depends on:** `<helper>`, `<helper>`.
- **Plain-language use:** <everyday explanation>.

#### `<helperName>()` — `<source:line>`

- **Importance:** **mid** — <why it exists>.
- **What it does:** <behaviour>.
- **Parameters / Inputs:** `<name>: <type>` – <meaning>.
- **Returns / Output:** `<type>` – <meaning>.
- **Called from / Triggered by:** `<source:line>`.
- **Calls / Depends on:** `<helper>`.
- **Plain-language use:** <everyday explanation>.

**Reusable card skeleton** – copy any card above and replace the placeholders:

- Heading: `#### \`<EntryName>\` — <source:line>`
- Fields: `- **Importance:** **<major|mid|minor>** — <justification>.`
- Then one `- **Label:** value` line per detail you want on the back.

---

## Part 2 – `<part 2>`

### 2.1 `<subsection>`

Repeat the card pattern from Part 1. Keep headings at `####`, fields as
`- **Label:** value`, and separate major groups with `---`.

#### `<EntryName>` — `<source:line>`

- **Importance:** **mid** — <why it matters>.
- **What it is / does:** <definition or behaviour>.
- **Details / Parameters:** `<name>` – <meaning>.
- **Result / Returns:** `<type>` – <meaning>.
- **Related / Called from:** `<source:line>`.
- **Plain-language use:** <everyday explanation>.

---

### 2.2 `<subsection>`

#### `<EntryName>` — `<source:line>`

- **Importance:** **minor** — <why it matters>.
- **What it is / does:** <definition or behaviour>.
- **Details / Parameters:** `<name>` – <meaning>.
- **Result / Returns:** `<type>` – <meaning>.
- **Plain-language use:** <everyday explanation>.

---

## Appendix – Quick reference

| Name | Location | Value / meaning |
| --- | --- | --- |
| `<name>` | `<source:line>` | <value or meaning>. |
| `<name>` | `<source:line>` | <value or meaning>. |
| `<name>` | `<source:line>` | <value or meaning>. |

---

*End of reference.*
