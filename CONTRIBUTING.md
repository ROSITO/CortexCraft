# Contributing to CortexCraft

Thanks for helping. This document is the single source of truth for how to
contribute. By participating you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- Bug reports and reproducible issues
- Feature proposals (discussion first for large changes)
- Documentation improvements
- Code: Rust (`src-tauri`), TypeScript/React (`src`), MCP/CLI

## Before you start

1. Search [existing issues](https://github.com/ROSITO/CortexCraft/issues) to avoid duplicates.
2. For non-trivial work, open an issue describing the problem and proposed approach.
3. Keep changes focused — one concern per pull request.

## Development setup

### Prerequisites

- macOS (primary target; Apple importers need macOS)
- Node.js 20+ and npm
- Rust stable (edition matching `src-tauri/Cargo.toml`)
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Optional: Claude headless

CortexCraft can pilot an external `vault-pipeline` `keeper/` (Claude Code CLI).
That stack is **not** required to run the app or contribute to core UI/vault features.

### Build & run

```bash
git clone https://github.com/ROSITO/CortexCraft.git
cd CortexCraft
npm install
npm run tauri dev
```

Typecheck / library tests:

```bash
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

### Local release bundle

```bash
npm run tauri build
```

### Multi-OS GitHub releases (storytold / ArtCraft pattern)

Workflows under `.github/workflows/cortexcraft-{macos,windows,linux}-publish.yml` mirror [storytold/artcraft](https://github.com/storytold/artcraft) publish jobs (Tauri matrix → draft GitHub Release).

1. Merge the commit you want onto `release` (or trigger **workflow_dispatch** on each workflow).
2. Wait for macOS / Windows / Linux jobs to attach assets to the draft `vX.Y.Z` release.
3. Review the draft, then publish it.

Optional org secrets for notarized macOS: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` (same idea as ArtCraft).

### craft-libs note

The Rust crate depends on `craft-settings` / related packages from the ArtCraft
`craft-libs` git pin (see `src-tauri/Cargo.toml` and README). Contributors need
network access to that dependency to compile. If the pin is private for you,
open an issue — we track making builds fully public.

## Pull request process

1. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
2. Keep PRs small and reviewable.
3. Fill out the pull request template.
4. Ensure `tsc` and relevant `cargo` checks pass locally.
5. Do **not** commit secrets, vault paths, API tokens, or personal notes.
6. One maintainer review is required before merge (squash preferred).

### Commit messages

Prefer Conventional Commits style:

- `feat:` new user-facing capability
- `fix:` bug fix
- `docs:` documentation only
- `chore:` tooling, ignore, packaging
- `refactor:` no behavior change

## Security issues

Do **not** open a public issue for vulnerabilities. See [SECURITY.md](SECURITY.md).

## License

Contributions are licensed under the [MIT License](LICENSE).
