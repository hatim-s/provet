# Environment contract

FND-01 introduces no Provet-specific environment variables, secrets, or
Cloudflare bindings.

Standard process environment values do not alter FND-01 help/version semantics.
`NO_COLOR` is reserved by the CLI UX standard for presentation only; its
implementation belongs to a later roadmap node.

## Standard host inputs

- `PATH` is read only when constructing the injected system Git port so its
  bounded subprocess can locate `git`. Config-free `--help` and `--version`
  execution never invokes that port.
- Git subprocesses receive only `PATH` plus fixed locale and no-prompt values;
  the remaining host environment is not forwarded.
