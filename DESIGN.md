---
name: Faultline
description: A friendly illustrated paper docket for tracing evidence, validator judgment, and deterministic settlement.
colors:
  sky: "#9bdce8"
  paper: "#fbf7e8"
  ink: "#24241f"
  secondary-ink: "#494a43"
  accepted-green: "#3f8654"
  accepted-wash: "#dcefdc"
  repair-amber: "#88591b"
  repair-wash: "#f6e6b9"
  breach-red: "#bd3f38"
  breach-wash: "#f7ded6"
  verification-blue: "#347a9d"
  verification-wash: "#d9edf2"
typography:
  display:
    fontFamily: "Kalam, Comic Sans MS, cursive"
    fontSize: "clamp(2.4rem, 5vw, 4.2rem)"
    fontWeight: 700
    lineHeight: 1.02
    textTransform: lowercase
  body:
    fontFamily: "IBM Plex Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "IBM Plex Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "0.68rem"
    fontWeight: 500
rounded:
  controls: "11px"
  paper-card: "20px"
  pill: "999px"
components:
  primary-action:
    backgroundColor: "#f2cf5b"
    textColor: "#24241f"
    rounded: "12px"
    minHeight: "44px"
  folder-tab:
    backgroundColor: "#e9f4ef"
    textColor: "#24241f"
    border: "3px solid #24241f"
    minHeight: "44px"
---

# Design System: Faultline

## Overview

**Creative North Star: “A Little Filing Desk”**

The reviewer opens a cheerful paper docket against a sky-blue desk. A bold dark outline and slightly varied corner radii make the paper feel handled, while its evidence remains precise. Four tabs link to real page sections. Dashed rules separate work; pills make escrow, bonds, outcome, and handoff checks easy to scan. Three original SVG mascots mark Research, Analysis, and Delivery.

The page is cute and welcoming through character, color, and handwritten lowercase headings. It does not use franchise characters or disguise synthetic evidence as live facts. Screenshots under `.impeccable/review` are local design artifacts, not deployment or chain proof.

## Colors

- **Sky** `#9bdce8`: page surround and open canvas.
- **Paper** `#fbf7e8`: primary reading surface.
- **Ink** `#24241f`: outline, headings, and primary text.
- **Secondary ink** `#494a43`: supporting copy and instructions.
- **Accepted green** `#3f8654` / wash `#dcefdc`: accepted or passed checks.
- **Repair amber** `#88591b` / wash `#f6e6b9`: retry and repair.
- **Breach red** `#bd3f38` / wash `#f7ded6`: breach and evidence mismatch.
- **Verification blue** `#347a9d` / wash `#d9edf2`: chain and read status.

Status color always appears with plain text. Dark text on these pale surfaces maintains contrast; secondary copy remains dark enough for reading.

## Typography

**Headings:** Kalam, lowercase, with cursive fallbacks. It gives the page its handwritten voice.

**Body, data, and controls:** IBM Plex Mono. The supplied page intentionally uses a single practical work font for instructions, form fields, hashes, and figures.

Headings carry a clear scale step, while metadata stays compact. Full evidence hashes use line wrapping rather than truncation. Google Fonts load through the global stylesheet; there are no additional font packages.

## Layout and navigation

The app keeps the existing reviewer journey: case register and selected docket; handoff trace; clauses and consensus; evidence-to-settlement rail; receipt; methodology; reviewer controls. The folder tabs anchor to the charter, trace, receipt, and controls sections. At 1050px the detail view stacks. At 720px the register becomes a native picker and the evidence rail stacks. The supported widths include 1440px, 1280px, and 375px without horizontal overflow.

The first view contains honest Studio Net state, selected fixture/live labeling, and only facts present in the charter or fixture. Summary pills show escrow, agent count, bonds at stake, and outcome; they do not invent activity metrics.

## Shapes and depth

The paper has a thick dark outline with gently varied corners. Tabs, status pills, and buttons use dark borders. Dashed lines form dividers. A soft offset shadow lifts the main paper and important controls from the background. Avoid gradients, glass, and generic dashboard widgets.

The agent SVGs are original simple vector characters: Fern (leafy green Research), Pip (blue Analysis), and Posty (orange Delivery). They sit beside the named slot and never replace text. Decorative copies are hidden from assistive technology.

## Handoffs, checks, and responsibility

Each trace row shows submitted/fetched source identity, output and previous-output hashes, evidence links, role, and the contract's recorded `edge_check` when available. Synthetic cases label their expected edge checks explicitly. A successful path names the three checks: hash chain, submission time, and evidence-base URL.

When every handoff passes its edge checks, the responsibility summary appears directly below the trace. It lists fixed roles. Its colorful bars are decorative and have no percentage scale; accompanying text states this. **Plain numbers** hides mascots and bars and reveals a semantic text table with the responsibility roles and clause IDs.

An `EVIDENCE_TAMPERED` assessment is a distinct basis. The changed source row displays the complete submitted and fetched SHA-256 values; a red evidence-integrity note explains that the contract selected the breach deterministically. The separate consensus section retains validator lifecycle, execution, validator, and transaction facts.

## Fixtures and chain facts

Four reviewer fixtures show acceptance, remediation, validator-judged breach, and deterministic evidence tampering. Each preview outcome and settlement calculation is marked expected and synthetic. The tamper manifest has one declared evidence mismatch and matching hashes for every other page. A self-hosted fixture is not independent third-party verification.

Live data remains distinct from previews. If chain reads fail, the UI says so and does not substitute fixture values into the live docket. Transaction lifecycle, GenVM execution, validator votes, outcome basis, and DEMO settlement are shown as separate facts.

## Accessibility

Semantic controls and headings, keyboard navigation, visible focus, 44px minimum touch targets, reduced-motion support, and accessible status names are maintained. The Plain numbers button works from the keyboard and communicates `aria-pressed`. Plain mode replaces decorative mascots, status glyphs, and bars with words and tables.

## Do and don't

- **Do** label expected fixtures, DEMO accounting, edge-check status, and basis in words.
- **Do** keep all recorded hashes available and wrap them on small screens.
- **Do** keep mascot identity secondary to the agent name and evidence facts.
- **Don't** use invented activity stats or percentage blame.
- **Don't** let illustration, color, or a green edge check imply that the content itself is truthful.
- **Don't** treat FINALIZED as proof of successful GenVM execution.
