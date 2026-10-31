# Marketplace page standard (shared by every PPTB tool)

How the public page of a Power Platform ToolBox tool is written, how bugs are handled and how
versions and updates are told. It is tool-neutral: copy this file as it is into another tool and
write that tool's own `README.md` to it. The constitution of each tool points here.

The marketplace shows the README of the repository, so the README is also the page. Dates in
marketplace updates are written in mixed forms (`16/10/26`, `25-Jan-26`); this file picks one rule.

## 1. The README is the page

The marketplace shows the `README.md` of the repository, so there is **one text, not two**. The
README of every tool has these headings, in this order (same shape as the best tools: title and
intro, features, what it changes, installation, usage, privacy, credits, updates, license).

| # | Heading | Rule |
|---|---------|------|
| 1 | **Title** (`#`) | The display name in `package.json`. No Microsoft product name as the tool's own brand. |
| 2 | **Intro** | Two sentences at most: what the tool is and for whom; the gap it fills or, if inspired by another tool, that it is independent and not adapted or translated. Then one real screenshot with sample data (alt text says what is shown). |
| 3 | **Features** | A short list of things the tool really does, each starting with a verb. |
| 4 | **How this tool differs** | Only when it is inspired by or replaces another tool: what is different. Otherwise omitted. |
| 5 | **What this tool changes** | Exactly this title (Marketplace Policy). What is read, what is written, and whether any environment is touched. |
| 6 | **What it does not cover** | The limits, said plainly. |
| 7 | **Installation** | From the PPTB marketplace; whether a connection is needed (and "none" when it is not). |
| 8 | **Usage** | Numbered steps from opening to the result. |
| 9 | **Privacy and network use** | Where data goes and what is not collected. |
| 10 | **Support and bugs** | Section 3 below. |
| 11 | **Credits** | Inspiration and licences of anything adapted, only with the author's consent to be named. Omitted if none. |
| 12 | **AI Assistance** | The disclosure, when due. |
| 13 | **Updates** | Section 4 below. Newest first. |
| 14 | **License** | One line naming the licence; the `LICENSE` file is in the root. |

Rules for all headings: English; plain words; no emoji; every claim true of the published version
("Claims match behaviour"); a planned feature is never described as shipped.

**Repository files** (what a visitor to the repository expects to find):

| File | Purpose |
|------|---------|
| `README.md` | The page above. |
| `CHANGELOG.md` | Every release, the source of **Updates** (section 4). |
| `LICENSE` | The licence text. |
| `SECURITY.md` | How to report a vulnerability privately (section 3). |
| `.github/ISSUE_TEMPLATE/` | A bug-report form and a feature-request form that ask for what section 3 lists. |
| `specs/`, `.specify/` | Specs and the constitution; not part of the published package. |

Working notes do not live loose in the root; they go under `docs/` or `specs/`.

## 2. Versioning

- Semantic Versioning, `MAJOR.MINOR.PATCH`. While below `1.0.0`, a new capability raises MINOR and a
  fix raises PATCH.
- The version has **one source**: `package.json`. The UI, the page and the changelog read it or
  quote it; nobody types it twice from memory.
- The version of the newest **Updates** entry equals the version published. An entry without a
  published version is under "Unreleased" in `CHANGELOG.md` and is not shown on the page.
- Automatic release tools are optional; here the version is set by `/custom-publish`.
- A release is a tag `vX.Y.Z` on the commit that was published, so a bug report can name an exact
  version and the code of that version can be found.

## 3. Bugs, support and who answers

**Where a bug goes:** the GitHub Issues of the tool's repository. The page names that place and
nothing else; no private channel is the only way to report.

**What a report contains** (the issue template asks for it):

1. Tool name and version (shown in the tool).
2. What you did, what you expected, what happened.
3. Light or dark theme, PPTB version, operating system.
4. For a tool that works on a file: a **generated or anonymised** sample that shows the problem.
   Never a real tenant package, manifest, token or record.

**How a bug is handled:**

1. **Reproduce first.** The report becomes a failing test before the fix (Testing Standard, rule 6).
   A bug that cannot be reproduced is answered with what is missing, not closed silently.
2. **Label** it: `bug`, `enhancement`, `question`, plus `needs-info` when waiting for the reporter.
3. **Fix** it in the smallest change that makes the test pass; the test stays.
4. **Say it in the changelog** as *Fixed*, naming the symptom the user saw and the issue number
   (`#33`). The reporter is thanked by their GitHub handle only if they agree to be named.
5. **Close** the issue when the fixing version is published, and comment with that version.
6. A fix that changes behaviour the previous version had is also listed under *Changed*.

**Security:** a vulnerability is reported privately through the repository's security advisory page,
never in a public issue.

**Answer times** are not promised on the page. The page promises only the order above.

## 4. Updates (the list on the page)

The README's **Updates** section is the published part of `CHANGELOG.md`, rewritten shorter for people
who read a marketplace page, not a repository.

**Entry format**

```
### X.Y.Z - YYYY-MM-DD

- Added <what the user can now do>.
- Changed <what behaves differently now, and why it matters>.
- Fixed <the symptom that was seen> (#33).
- Removed <what is gone and what to do instead>.
- Thanks to @handle for #20.
```

**Rules**

- **Date:** `YYYY-MM-DD`. Mixed forms such as `16/10/26` and `25-Jan-26` exist; only the
  ISO form cannot be read two ways.
- **Newest first**, one heading per published version, never one per day of work.
- **Verbs in this order:** Added, Changed, Fixed, Removed, Security. Each bullet is one sentence that
  starts with the verb and says what changed **for the person who uses the tool**.
- A fix states the symptom ("the crop box was one pixel off"), not the cause in the code.
- An issue is linked by number (`#33`) when there is one; the title may follow it
  (`#17 Calculated field support`) when the title explains the change.
- A release that asks something of the user (a setting to change, a file to reopen) carries an
  **Upgrade notes** line first.
- No internal work (refactors, test changes, spec edits) unless the user can notice it.
- Nothing is announced before it is published, and nothing is removed from the list afterwards; a wrong
  entry is corrected by a new entry.

**Source of truth:** `CHANGELOG.md` is written first (Release Changelog rules of the constitution).
The README Updates section is derived from it at release time, never the other way round.

## 5. Checklist before a release

- [ ] Version in `package.json` = newest Updates entry = tag to be created.
- [ ] The Updates entry is written from the changelog and every bullet passes section 4.
- [ ] Every README heading (features, changes, does not cover, privacy) still matches the build.
- [ ] Screenshot shows the current version of the screen.
- [ ] Every issue fixed in this version is named in the entry and will be closed with the version.
- [ ] After `npm publish`: the tool's row in **My Tools** shows the new version (section 6); if not, **Trigger Update**.
- [ ] The GitHub description and topics are still true (Principle VI).

## 6. Marketplace: from npm to the page (My Tools)

Where the author sees and drives a listed tool: **My Tools**, https://www.powerplatformtoolbox.com/tools (signed in).
One row per tool: category, version, status, verified status, downloads, rating, MAU, actions.

| Status | Meaning | Action in the row |
|--------|---------|-------------------|
| **Active** | Listed and installable. | **View**, and **More**: Get Verified, Update categories, **Trigger Update**, Deprecate, Delete. |
| **Needs Changes** | Rejected at intake (downloads, rating and MAU show `--`). | **Resubmit**, after fixing the cause and publishing a fixed version. |

What the PPTB documentation says (https://docs.powerplatformtoolbox.com/tool-development/publishing and
https://docs.powerplatformtoolbox.com/policies/marketplace):

- First time: publish to npm, test with Install from npm, then fill the **Tool Submission Form** (npm package name,
  up to three categories). Automated checks, then a manual review, typically 48 to 72 hours.
- The registry **syncs automatically with npm**: a new version is picked up and installed users are notified.
- Limits: 2 submissions in intake at a time for established publishers, 1 for new ones.
- The policy applies to **every version**, so each release must comply with it.
- **Verified** is separate from intake: request it from **More** after acceptance.
- Not written anywhere (found out in 2026-10): whether a new npm version is reviewed again, and how a rejected tool
  is re-reviewed. Ask in the PPTB Discord.

How we work after each release:

1. Publish to npm, then check the tool's row in My Tools: the **version** column must show the new number.
2. If it still shows the old one, press **More, Trigger Update**: the row shows "Updating" and then the new version.
3. Open the tool's public page and check the logo, the description and the README with its screenshots.
4. After a **Needs Changes**: fix, publish a new version, then press **Resubmit** on the row.

Written down 2026-10-31 from the My Tools page and the PPTB docs. Confirmed the same day with Agent Nameplate:
after publishing 1.1.3 the row still showed v1.1.2; **More, Trigger Update** made it show "Updating" and then
v1.1.3, Active, within a few minutes. Whether the registry would have picked the version up by itself later was not
tested.

A fix that only changes the README or the images still needs a new npm version: the page reads the README from the
repository (`readmeUrl`), but the logo and description come from `package.json` in the published package.
