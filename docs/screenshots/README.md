# Screenshots

Images used by the root `README.md` (the marketplace page). Rules: `docs/marketplace-page-standard.md`.

## Rules

- **Sample data only.** Use a DEV environment with invented solutions and agents (names like `Helpdesk Assistant`,
  `Sales Coach`). Never a real tenant name, solution, agent, URL or id. A shot is not used if the host shows an
  environment name that is not sample data.
- PNG, the Power Platform ToolBox window with the tool in it (the host window is how the tool is really seen),
  width 1280 to 1920 px, zoom 100 %.
- One theme: the dark theme of Power Platform ToolBox, in `dark/`.
- Name: `NN-slug.png`, exactly as in the table. Do not rename once linked.
- Under 400 KB each. The folder is not part of the npm package (`files` is `dist` and the shrinkwrap only).
- Retake a shot when the screen it shows changes.

## Shot list (the README already links these names)

| File | Screen | What must be visible | Used in README |
|------|--------|----------------------|----------------|
| `01-solutions.png` | Solutions step | the list of solutions with agent counts | under the intro, Usage 1 |
| `02-agents.png` | Agents of the chosen solution | the agents with icon, type, status and the Set the suffix button | Usage 1 |
| `03-suffix.png` | Suffix step, top | the suffix field and the presets | Usage 2 |
| `04-publish.png` | Suffix step, agents table | the name after the rename, publish on import per agent and for all | Usage 2 |
| `05-review.png` | Review step | the Rename and Options panels, "Raise the version" on with the version field | Usage 3 |
| `06-options.png` | Review step, bottom | the Options panel: version change, artifacts produced, What happens next | Usage 3 |
| `07-version-dialog.png` | Dialog before the build | environment, solution, old and new version, Go back and Change the version and build; **the environment URL must be blurred** | Usage 3 |
| `08-preview.png` | Preview step | the five phases completed with the time taken | Usage 4 |
| `09-checks.png` | Checks step, top | Package contents: folders, types and counts | Usage 5 |
| `10-verified.png` | Checks step, bottom | managed and unmanaged side by side, all green, "Packages ready and verified", Save the artifact set | Usage 5 |
| `11-result.png` | Result step | the warning about the unmanaged archive, the version note, Where it is (folder and manifest) | Usage 6 |
| `12-files.png` | The saved folder in the file explorer | the managed zip and manifest.json | Usage 6 |

## How to take them

1. Connect the tool to a DEV environment that holds only sample data (a solution with 2 or 3 agents, one of them a
   GitHub Copilot harness agent, so both type icons show).
2. In Power Platform ToolBox switch to the **dark theme** and size the window to about 1600 px wide, zoom 100 %.
3. Walk the flow once, with the suffix `[UAT]` and "Raise the version" on, and capture each step at the moment
   described in the table (Windows: `Win+Shift+S`, then save as PNG).
4. Capture the whole window, including the host title bar and the green connection bar, as in the reference tool.
5. Save the files here, in `dark/`, with the names above.
6. Check each file is under 400 KB (shrink with any PNG optimiser if not).
7. Commit and **push** before checking the page: the README links are absolute and point to the `main` branch, so an
   image shows only after it is pushed.

## The link format

```markdown
![Suffix step with the agents and the name each will get](https://raw.githubusercontent.com/vincenzosgueradev/copilot-agent-nameplate/main/docs/screenshots/dark/03-suffix.png)
```

Alt text says what is shown.
