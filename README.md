# ArnOrg

**English** · [Türkçe](README.tr.md)

A software company built from Claude Code agents. You open a project; the CEO agent writes the plan, hires the team, hands out the work and reports back to you. Every tool call of every agent passes through ArnOrg's gate.

![Headquarters](docs/gorseller/en/karargah.png)

## Highlights

- **Desktop app for Windows and Linux**, plus a server mode.
- **Runs on your Claude subscription** (Pro, Max or Team). Agents use the Claude Code sign-in on your machine; ArnOrg never hands them an API key. The top bar shows the 5-hour and weekly window usage. Agents pause at the threshold the board sets and pick up where they left off when the window reopens.
- **Guided first run.** A setup assistant walks you through:
  - installing and signing in to Claude Code (browser sign-in, paste the code back if asked);
  - git and your git identity;
  - the GitHub CLI: downloaded for you, browser sign-in, set up as git's credential helper;
  - where projects live and which language to use.
  
  Then the CEO holds a short kickoff with you in #ceo: what you're building, your preferences, the constitution, the first hires and the first plan.
- **Projects without typing paths.**
  - New projects go to `~/ArnOrg/<name>`.
  - An existing folder opens with the system folder picker.
  - **Open from GitHub**: pick a repository and branch, and ArnOrg clones it for you.
  - ArnOrg can also create the GitHub repository (private or public).
  - Pick the working branch (main or any other) and keep it in sync with GitHub.
- **Constitution.** You draft it with the CEO. Every agent, the CEO included, follows it. Articles that a machine can check are enforced at the gate before any other policy, and agents are reminded whenever it changes.
- **Agents with minds of their own.** Every employee:
  - keeps a small personal memory;
  - makes and keeps promises;
  - writes down team skills;
  - searches past conversations;
  - hands knowledge over to teammates.
  
  Hooks remind each agent who they are, what they're working on and what the constitution says: every 25 tool calls or 30 minutes, and after the context is compacted. News from teammates (a promise kept, a dependency finished, a hand-over) arrives on their next turn.
- **Global intelligence.** ArnOrg learns rules across projects from your preferences, your corrections and the lessons agents write down.
  - A candidate rule becomes a standard once evidence backs it, or once it shows up in a second project.
  - Duplicate rules are merged and weak ones retired.
  - Each agent receives the rules within its role and authority.
  - You can review, edit or switch off any rule.
- **Headquarters.** A one-to-one chat with the CEO in #ceo and live channels with typing indicators and clickable links. #general announces when work starts, goes to review and finishes.
- **Approvals.**
  - Approval types: hiring, dismissal, merges to main, constitution changes, tool requests and deliveries.
  - Each one shows its reasoning and what happens if you approve.
  - An **Auto-approve** checkbox approves for you, limited to the types you choose.
- **Important moments reach you anywhere.** A pop-up appears on whichever screen you're on. When the window is in the background, you also get a desktop notification and the taskbar flashes.
- **A team that changes over time.** The CEO can propose new hires or a dismissal later in the project. A dismissal needs your approval, and the person's work and knowledge pass to a successor.
- **Delivery.** When the project is done, the CEO hands it over with test steps, the run command and the address. Your feedback goes back to the CEO as work.
- **Everything else from 0.0.1:**
  - per-project memory under `.arnorg/`;
  - a git worktree per agent; only work the board approves reaches the main branch;
  - live audit with policies, interjection and stopping;
  - the Office, a live 2D view of the company;
  - a built-in VS Code workbench;
  - local code intelligence;
  - a stall guard and period reports.
  
  Agent commits use your git identity; no Claude signature is added.
- **English and Turkish.** The interface and the agents work in the language you choose.

## Screens

| Screen | |
|---|---|
| First run | ![First run](docs/gorseller/en/ilk-kurulum.png) |
| Office | ![Office](docs/gorseller/en/ofis.png) |
| Channels | ![Channels](docs/gorseller/en/kanallar.png) |
| Approvals | ![Approvals](docs/gorseller/en/onaylar.png) |
| Intelligence | ![Intelligence](docs/gorseller/en/zeka.png) |
| Open from GitHub | ![Open from GitHub](docs/gorseller/en/github.png) |
| Team and agent panel | ![Team](docs/gorseller/en/ekip.png) |
| Code intelligence | ![Code intelligence](docs/gorseller/en/kod-zekasi.png) |
| Code (VS Code workbench) | ![Code](docs/gorseller/en/kod.png) |

## Install

Installers are on the [Releases](https://github.com/fyildirim-debug/ArnOrg/releases) page:

| System | File |
|---|---|
| Windows 10/11 · x64 | `ArnOrg-Kurulum-<version>-x64.exe` (setup wizard), or `ArnOrg-<version>-x64.msi` for managed deployment |
| Linux · x64 | `ArnOrg-<version>-x86_64.AppImage` (no install), `ArnOrg-<version>-amd64.deb`, `ArnOrg-<version>-x86_64.rpm` |
| Linux · arm64 | `ArnOrg-<version>-arm64.AppImage`, `ArnOrg-<version>-arm64.deb`, `ArnOrg-<version>-aarch64.rpm` |

You need a Claude subscription (Pro, Max or Team). The first-run assistant checks Claude Code, git and the GitHub CLI and helps you install and sign in to whatever is missing. The installers are unsigned: on the Windows SmartScreen prompt choose **More info → Run anyway**. The AppImage needs FUSE 2 (Ubuntu 24.04: `sudo apt install libfuse2t64`).

## Run from source

Requirements: Node.js 22+, git, and a Claude Code sign-in on the machine (the app's setup assistant can do the sign-in for you). Agents use that sign-in; even if an API key is set in the environment, ArnOrg doesn't pass it to them. On Windows, Git for Windows is recommended.

```bash
npm install
npm run build          # Studio + core
npm run serve          # http://127.0.0.1:47820, the terminal prints a link with the access key
```

Desktop app:

```bash
npm run build && npm run masaustu    # core + Studio inside Electron
npm run paketle                      # packages for the current platform (Linux: AppImage, deb, rpm; Windows: NSIS, MSI)
```

Release packages are built on GitHub Actions for Windows and Linux and published as a GitHub release; see [`paketler/masaustu/README.md`](paketler/masaustu/README.md).

Cutting a release (notes live in [`docs/surumler/`](docs/surumler)):

```bash
npm run surum -- 0.0.3                 # root and all packages, lock file, ARNORG_SURUMU
# write the notes to docs/surumler/v0.0.3.md and commit
git tag -a v0.0.3 -m "ArnOrg 0.0.3"
git push origin main v0.0.3            # surum.yml builds the packages and publishes the release
```

Instead of pushing a tag you can run **Actions → Sürüm → Run workflow** on GitHub with `v0.0.3` in the `surum` field; the tag is placed on the latest commit of main. If the tag doesn't match the package versions, or the notes are missing, the workflow stops before packaging.

Development:

```bash
npm run dev            # core, restarts on change
npm run dev:studyo     # interface (Vite); /api and /ws go to the core
npm run sahte -w @arnorg/studyo   # fake core without Claude, for interface work (ARNORG_DIL=en for English data)
npm test               # unit and integration tests (no Claude calls)
```

Server mode: `node paketler/cekirdek/dist/cli.js serve --host 0.0.0.0 --izinli-host arnorg.example.com --veri /var/lib/arnorg`. When exposing it, put an identity layer such as Cloudflare Access in front.

To try things with a light model on every agent (uses less of your subscription window): `ARNORG_MODEL_ZORLA=haiku npm run serve`.

## Documents

The design documents are in Turkish:

- Plan: [`docs/ONIZLEME.md`](docs/ONIZLEME.md)
- API contract: [`docs/API.md`](docs/API.md)
- Claude Code protocols and audit: [`docs/PROTOKOLLER.md`](docs/PROTOKOLLER.md)
- Release notes: [`docs/surumler/`](docs/surumler)

## Layout

```
paketler/
  ortak/      types shared by the core and Studio
  cekirdek/   arnorg-server: agent sessions (Agent SDK), audit gate, company, API
  studyo/     React interface
  masaustu/   Electron shell and packaging
```

## Author

Made by **Furkan YILDIRIM** · [furkanyildirim.com](https://furkanyildirim.com)
