# Security Policy

## Scope

This policy covers the Tavo.js Plugins monorepo and all four workspaces:
`@tavojs/analytics`, `@tavojs/sitemap`, `@tavojs/auth`, and `@tavojs/fsm`. It
applies whether a workspace is public or private.

## Reporting a vulnerability

Do not open a public GitHub issue for a suspected vulnerability. Report it
privately by emailing [support@tavojs.dev](mailto:support@tavojs.dev).

Include as much of the following as is safe to share:

- the affected package and version or commit;
- a minimal reproduction and the conditions required to trigger the issue;
- the expected security impact;
- relevant provider, deployment, or configuration details with all secrets,
  credentials, tokens, personal data, and confidential values removed; and
- any suggested mitigation or fix.

Use placeholder credentials and test accounts. Do not access, modify, retain, or
destroy data that does not belong to you; degrade service; perform denial-of-
service testing; use social engineering; or test against third-party systems
without authorization. Stop testing if you encounter sensitive data and report
the finding privately.

## Coordinated disclosure

Please allow maintainers a reasonable opportunity to investigate and address a
report before public disclosure. Coordinate disclosure timing and content with
the maintainers, avoid sharing exploit details while users remain exposed, and
keep any non-public information received during the investigation confidential.
Maintainers will assess the report, may request additional information, and will
coordinate remediation and disclosure based on the issue's scope and risk.
