# Shared project instructions

## Development Philosophy

### Writing code
- ALWAYS add docstring comments for major functions, classes and methods, and inline comments
explaning non trivial logic and code
- Always use single export statement and use named exports for everything - functions, hooks, components, classes etc.
- Whenever a `package.json` script is added, removed, renamed, or its command changes, update `docs/SCRIPTS.md` in the same change.
- Never write code inside index.js/index.ts - only use these as exports

#### File placement

- One purpose per file. File name = main export, kebab-case
  (`invoice-service.ts`, not `utils2.ts`, `misc.ts`, `helpers.ts`, `temp.ts`).
- New code goes where its siblings live. Before creating a file, find the closest
  existing file by purpose and place next to it.
- Do not put .test files directly with the source files, extract away into separate test and e2e directories.
- Prefer deep modules and directory structures, no all files landing flat - clean, organised file structure.

#### Naming

- Variables: full words that say what the value IS. `unpaidInvoices`, not `data`, `result`, `arr`, `x`, `temp`.
- Functions: verb-first, say what it does. `fetchUnpaidInvoices()`, not `process()`, `handle()`, `doStuff()`.
- Booleans: read as yes/no. `isExpired`, `hasAccess`, not `flag`, `status2`.
- No abbreviations (`userCount` not `usrCnt`). No numbered names (`data2`, `newHelper`).

#### Before writing new code

Read one neighboring file in the target directory first. Match its structure, naming, and comment density exactly.

#### Banned

- Dead code, commented-out blocks
- Catch-all files (`utils.ts`, `helpers.ts`, `common.ts`) — name the actual purpose
- Copy-paste of an existing function with small edits — extract or reuse instead

#### Before finishing
Reread your diff. Every name: would a stranger know what it holds? Every file: is it next to its siblings?

#### Prefer deep modules
- Follow deep modules, with minimal API surface area with well designed API contracts. Always prefer to use encapsulation,
  abstraction whereever possible. Code should always be shared, including logic, components, contracts, types etc.
- While designing configurations, options, and customisations, never use magic strings or env variables. Expose `options`
  or `config` as a plain object with well-defined keys and types.

### Incremental development
Small increments; every commit compiles (`pnpm typecheck`) and passes owned
tests. Conventional commits. No massive dumps.

### Commands
Dev commands are present in the `package.json`. Whenever creating new scripts, always
put them in `package.json`.

### Database and Migrations
- Never push to actual database without approval from human - strictly HITL
- Always highlight breaking changes, or changes that might require migration to the human

### Environment
- Whenever adding, removing, or renaming an environment variable, secret, or Cloudflare binding,
update `docs/ENV.md` in the same change.

## Computer and Browser Use
- Use the browser use tool and/or Computer use tool to validate your work, or debug issues when the user requests.
- Always try to reproduce the issue, with your best efforts, and then try to fix it. If it cannot be reproduced because of tool failures, report as such and abort. If the issue could not be reproduced, then do not jump to a fix, report that it could not be reproduced and suggest possible fixes to the user.
