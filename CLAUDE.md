@AGENTS.md

## Document governance (binding)

| Document | Status | Rule |
|---|---|---|
| `docs/PROJECT_STATE.md` | **Living** | Update after every completed development slice. It describes only what is implemented **now** — never planned work as done. |
| `docs/ROADMAP.md` | **Controlled** | Do not modify it merely because a slice was completed. Change scope or order only after explicit owner approval. |
| `docs/ARCHITECTURE.md` | **Controlled** | Approved architectural decisions are binding. If implementation evidence suggests a change, propose it first (PROJECT_STATE "Proposals") — never silently replace it. |
| `docs/PRODUCT_SPEC.md` | **Controlled** | Product requirements. Do not redefine product behaviour during implementation. |

Never start the next roadmap slice without the owner's explicit approval.
