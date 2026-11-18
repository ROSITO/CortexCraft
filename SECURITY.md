# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Reporting a vulnerability

Please **do not** file a public GitHub issue for security problems.

Prefer one of:

1. [GitHub Private Vulnerability Reporting](https://github.com/ROSITO/CortexCraft/security/advisories/new)
   (recommended when enabled on the repository)
2. A private channel listed in [SUPPORT.md](SUPPORT.md)

Include:

- Affected version / commit
- Reproduction steps
- Impact (data disclosure, local code execution, vault integrity, etc.)
- Any known workaround

You should receive an acknowledgement within **7 days**. We aim to provide a fix
or mitigation timeline within **30 days** for confirmed issues, depending on
severity and complexity.

## Safe harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations and service disruption
- Report promptly and do not exploit the issue beyond what is needed to demonstrate it
- Do not publicly disclose the issue until a fix is available or coordinated

## Application notes

CortexCraft is a **local-first** desktop app over an Obsidian vault:

- Do not submit vault contents, OAuth tokens, or Keychain material in reports
- Claude headless tokens must stay in the OS Keychain / env — never in prefs files committed to git
