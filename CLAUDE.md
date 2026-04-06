# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Claude Code plugin marketplace (`from2001-useful-skills`) that provides various utility skills including document translation and image generation. Each skill is a self-contained package with a `SKILL.md` workflow definition and Python helper scripts.

## Repository Structure

- `.claude-plugin/marketplace.json` — Plugin registry; defines available skills, versions, and metadata
- `.claude/skills/<skill-name>/SKILL.md` — Skill definition (YAML frontmatter + workflow instructions); auto-recognized locally
- `.claude/skills/<skill-name>/scripts/` — Python helper scripts used during skill execution
- `.claude/skills/<skill-name>/README.md` — User-facing documentation

## Skills

### translate-pptx
Translates PowerPoint files by unpacking PPTX to XML, extracting `<a:t>` text elements, and replacing them with translations. Uses a shared `scripts/office/` module for unpack/pack/clean/validate operations with XSD schema validation.

**Dependencies:** `defusedxml`, `lxml`, `markitdown[pptx]`

### translate-pdf
Translates PDF files using PyMuPDF (fitz) to extract text spans with bounding boxes, then redacts originals and overlays translated text. Uses built-in CJK fonts (`japan`, `china-s`, `china-t`, `korea`) for East Asian languages.

**Dependencies:** `pymupdf`, `markitdown[pdf]`

## Adding a New Skill

1. Each skill lives in `.claude/skills/<skill-name>/` with a required `SKILL.md`
2. Python scripts go in `scripts/`
3. `.skill` files (ZIP archives) are **not** needed — marketplace installs directly from the repository
4. **Always update both of these when adding a new skill:**
   - `.claude-plugin/marketplace.json` — add an entry to the `plugins` array and increment the top-level `version`
   - `README.md` — add the new skill to the skills list

## Versioning

- `marketplace.json` has a top-level `version` and per-plugin `version` fields
- When adding a new skill: increment the top-level `version`
- When modifying an existing skill: increment that plugin's `version`
- Use semver: patch for bug fixes, minor for new features, major for breaking changes

## Conventions

- All comments and documentation in English
- Python scripts use `defusedxml` (not `xml.dom.minidom`) for safe XML parsing
- Skill workflows use temporary directories (`tempfile.mkdtemp()`) and clean up after completion
