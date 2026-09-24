---
name: Faultline
description: A friendly editorial dossier for tracing evidence, validator judgment, and settlement.
colors:
  primary: "#3e7068"
  primary-wash: "#e3eee8"
  analysis-blue: "#445e78"
  analysis-wash: "#e8edf2"
  repair-amber: "#9a6a22"
  repair-wash: "#f4ecd9"
  breach-red: "#ae503a"
  breach-wash: "#f4e4dd"
  paper: "#f3eee4"
  surface: "#fbf9f4"
  warm-surface: "#f7f2e9"
  field-surface: "#fffefa"
  ink: "#262823"
  ink-secondary: "#55574f"
  ink-tertiary: "#696a62"
  rule: "#d7cfc1"
  rule-strong: "#b9ad9b"
typography:
  display:
    fontFamily: "Newsreader Variable, Newsreader, Georgia, serif"
    fontSize: "clamp(2.8rem, 5vw, 4.75rem)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Newsreader Variable, Newsreader, Georgia, serif"
    fontSize: "1.9rem"
    fontWeight: 500
    lineHeight: 1.12
  body:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "0.68rem"
    fontWeight: 600
    letterSpacing: "0.045em"
rounded:
  sm: "5px"
  md: "7px"
  lg: "12px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "9px 15px"
    height: "44px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 15px"
    height: "44px"
---

# Design System: Faultline

## Overview

**Creative North Star: “The Editorial Docket”**

Faultline reads like a carefully kept case file: warm paper, graphite text, fine rules, numbered metadata, evidence links, and a single selected docket. The interface is calm and legible, with just enough friendly character in the circular agent seals, colored stamp dots, and plain-spoken copy. Its light playfulness never turns evidence or chain state into decoration.

Keep this system editorial and mostly flat. Screenshots in .impeccable/review are generated review artifacts, not product imagery, brand assets, or proof of a live chain result.

**Key Characteristics:** Warm dossier surfaces; restrained state colors; serif headlines with precise sans and mono details; literal data-state labels; subtle friendly marks.

## Colors

The palette pairs paper and graphite with quiet green, blue, amber, and red signals.

### Primary
- **Archive green:** Use for links, accepted outcomes, and the Research slot marker.
- **Analysis blue:** Reserve for the Analysis slot and verification/source keys.
- **Repair amber:** Use for repair-needed outcomes, preview-state badges, and the Delivery slot marker.
- **Breach red:** Use for breach outcomes, errors, and primary responsibility.

### Neutral
- **Paper and sheet:** The page is paper; reading surfaces use the lighter sheet and warm-sheet tones.
- **Graphite ink:** Use the darkest ink for headings and primary copy. Secondary ink carries supporting explanations and body text. Tertiary ink is for metadata; do not use it for essential instructions or long reading copy.
- **Rules:** Fine warm-gray rules divide docket sections and metadata. Use the stronger rule for control boundaries and table headings.

**The State Color Rule.** Color reinforces explicit text and labels; it never carries outcome meaning alone.

## Typography

**Display Font:** Newsreader Variable, with Newsreader and Georgia fallbacks

**Body Font:** IBM Plex Sans Variable, with IBM Plex Sans fallback

**Label/Mono Font:** IBM Plex Mono, with SFMono-Regular and Consolas fallbacks

**Character:** Newsreader brings an editorial voice to titles; IBM Plex Sans keeps explanations and controls direct. Mono text makes hashes, timestamps, and compact docket labels easy to scan.

### Hierarchy
- **Display** (500, responsive 2.8–4.75rem, 0.98 line height): Product title and principal editorial headline.
- **Headline** (500, 1.9rem, 1.12 line height): Section headings; the selected docket title is enlarged to 2.25rem on desktop.
- **Body** (400, 15px / 1.5): Reading copy and explanations; supporting paragraphs stay at a comfortable measure.
- **Label** (600, around 0.68rem, tracked uppercase where stamped): Docket IDs, hashes, section labels, and compact status stamps.

## Layout

The page is a single dossier. A capped 1440px content area begins with a horizontal masthead and two-part introduction, then a workbench: case register on the left and selected docket on the right. The docket proceeds through metadata, three handoff rows, clause inspection and validator facts, evidence-to-settlement steps, the settlement table, methodology, and reviewer controls.

At 1050px, metadata becomes two columns and the details stack. At 720px, the masthead becomes compact, the network label shortens, wallet address leaves the header, and the desktop register becomes a full-width native case picker above the docket. Trace rows and the evidence rail stack to suit the narrow screen. At 380px, titles and trace columns tighten further. The 390px mobile review capture has no horizontal overflow.

## Elevation & Depth

The interface is flat by default. Paper tone changes, thin dividers, and selection borders establish hierarchy; a faint shadow appears only beneath the selected case. Keep shadows rare and quiet.

## Shapes

Use softly rounded controls and restrained dossier geometry: fields and the mobile picker have 5px corners, buttons and status messages 7px, and form panels 12px. Outcome stamps are squarer; status chips are pill-shaped. Agent seals are circular, with a small offset color dot. Thin rules do most of the structural work.

## Components

### Buttons and fields
Primary actions are graphite-filled with light text; quiet actions are transparent with a visible border. Hover shifts the primary action toward green. Keep controls at least 44px tall. Inputs use a light field surface, warm border, and a clearly visible 3px focus outline; labels stay visible rather than relying on placeholders.

### Status and outcome stamps
Use direct wording such as “Studio Next unavailable,” “LIVE READ PENDING,” “EXPECTED · BREACHED,” “On chain,” and “Pending.” Green means accepted/success, amber means repair or synthetic preview, and red means breach/error. The network pill reports connectivity separately from a charter outcome.

### Agent seals and trace
Research, Analysis, and Delivery each have a letter inside a circular seal and a small colored dot: green, blue, and amber respectively. Keep the slot name beside the seal, so the role remains clear without color. Hashes and dates are secondary mono details; links remain plain and identifiable.

### Preview and live data
The three reviewer fixtures are synthetic. Their outcomes and settlement rows are labeled as expected fixture calculations, never as contract results; they do not represent validator transactions. Live reads, transaction lifecycle, validator votes, GenVM execution, and contract settlement remain distinct facts. If a live read is unavailable or no contract is configured, say so and leave live values unavailable; fixture content must not substitute for the selected live charter. The screenshots in .impeccable/review show the local preview state and are not evidence of deployment or execution.

### Accessibility
Use semantic headings and controls, visible keyboard focus, status roles for changing network/transaction messages, reduced-motion behavior, and touch targets of at least 44px. Keep status and responsibility legible without color.

## Do's and Don'ts

### Do:
- **Do** keep the case register and selected docket hierarchy clear at desktop and mobile widths.
- **Do** use secondary ink for supporting copy and tertiary ink only for metadata.
- **Do** pair each status color with plain text and keep preview, pending, offline, and live states distinct.
- **Do** preserve the compact serif/sans/mono hierarchy and circular three-slot seals.

### Don't:
- **Don't** present synthetic fixtures or expected calculations as live proof.
- **Don't** merge consensus/finality, GenVM execution, and deterministic settlement into one success signal.
- **Don't** invent values for unavailable chain facts.
- **Don't** introduce gradients, glass panels, neon crypto styling, or decorative evidence illustrations.
