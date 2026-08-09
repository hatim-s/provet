# Environment contract

FND-01 introduces no Provet-specific environment variables, secrets, or
Cloudflare bindings.

Standard process environment values must not alter semantic CLI behavior.
`NO_COLOR` is reserved by the CLI UX standard for presentation only; its
implementation belongs to a later roadmap node.
