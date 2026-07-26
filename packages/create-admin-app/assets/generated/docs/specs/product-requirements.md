# {{PROJECT_NAME}} Product Requirements

- Status: discovery
- Project slug: `{{PROJECT_SLUG}}`
- Last updated: not set

## Product definition

Describe the company-wide management problem this system should solve. Name the people who use it, the decision or operation it improves, and the existing tools that remain the source of truth.

## First workflow

Define one end-to-end workflow before adding generic modules.

- Trigger:
- Required inputs:
- Decision or action:
- Expected output:
- Success measure:

## In scope

- Add only requirements confirmed for this company.

## Out of scope

- Multi-tenancy or workspace switching
- Roles and granular application permissions
- Generic records, custom fields, or runtime module builders
- Reimplementing information already handled well by an existing platform

## Data sources

For each source, record ownership, access method, stable identifiers, refresh timing, and whether personal or sensitive data is required.

## Acceptance criteria

- The first workflow can be completed end to end.
- Business data has an explicit schema, contract, Worker route, and UI slice.
- Production changes remain reproducible through Git and guarded GitHub Actions.
- `pnpm check` succeeds.

## Open questions

- What is the first recurring decision this system must improve?
- Which existing platform remains authoritative for each input?
- Which calculation or operational state is currently missing?
