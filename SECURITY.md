# Security Policy — ecbyts_open

Thank you for helping keep **ecbyts** and its users safe.

## Reporting a vulnerability

**Do not open a public issue, pull request, or discussion for a security
vulnerability.** Public disclosure before a fix puts users at risk.

Report privately through **GitHub Security Advisories** (private) for this
repository:

> https://github.com/calvinsiost/ecbyts_open/security/advisories/new

On GitHub you can also reach this from the repository's **Security** tab →
**Report a vulnerability**. Please include:

- a clear description and the impact you observed;
- step-by-step reproduction (proof of concept);
- affected version/commit and environment;
- an estimated severity (CVSS v4.0 if you can).

A machine-readable version of this policy (RFC 9116) ships at
[app/.well-known/security.txt](./app/.well-known/security.txt).

## Scope

This repository is the **Guest Mode** (no-backend) build of ecbyts. In scope:
the source in this repository and the app as served locally by `npm start`.

Out of scope: any private backend or commercial infrastructure (which is not
part of this repository), and third-party providers (they run their own
programs). Guest Mode has no login, no payments and no server-side AI, so
those attack surfaces are intentionally absent here.

## Response

We aim to acknowledge a valid report quickly and to coordinate disclosure:
please give us a reasonable window to ship a fix before any public write-up.

## Safe harbor

Good-faith research within this scope — no data destruction, no privacy
violations, no service disruption, and no more access than needed to
demonstrate the issue — will not be pursued. Thank you for reporting
responsibly.
