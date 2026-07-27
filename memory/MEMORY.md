# MEMORY — index

Projectgeheugen voor Dropships. **Begin bij [START-HERE](ai-must-read/START-HERE.md).**

## Verplicht om te lezen

| Bestand | Waarvoor |
|---|---|
| [ai-must-read/START-HERE.md](ai-must-read/START-HERE.md) | projectsamenvatting, leeswijzer, harde regels |
| [ai-must-read/architecture.md](ai-must-read/architecture.md) | mappenstructuur, uicontrol vs store-platform, flow wizard → CJ → build → deploy |
| [ai-must-read/how-to-cut-a-release.md](ai-must-read/how-to-cut-a-release.md) | wanneer wel/niet een `deploy-*` tag zetten |
| [ai-must-read/release-and-changelog.md](ai-must-read/release-and-changelog.md) | hoe de changelog bijgehouden wordt |

## Onderwerp-dossiers

| Bestand | Waarvoor |
|---|---|
| [dropships-infra-and-ci.md](dropships-infra-and-ci.md) | VPS, DNS, Cloudflare-tunnel, PM2, nginx, self-hosted runner — handmatig opgezet, vaststaand |
| [dropships-pipeline.md](dropships-pipeline.md) | de 11 stages, reviewer-schema, events, API |
| [dropships-components.md](dropships-components.md) | componentbibliotheek, design-DNA, hoe de LLM kiest |
| [dropships-cj-integration.md](dropships-cj-integration.md) | CJ REST + MCP; waarom MCP nooit orders plaatst |
| [dropships-stripe-payments.md](dropships-stripe-payments.md) | checkout → webhook → fulfillment |
| [dropships-auth.md](dropships-auth.md) | 2FA-flow zoals gebouwd en getest — niet aanraken |

## Overig

| Pad | Waarvoor |
|---|---|
| [changelog.md](changelog.md) | wat er wanneer veranderde, nieuwste bovenaan |
| [planned/backlog.md](planned/backlog.md) | wat er nog open staat |
| [logs/](logs/) | verificatie-output van afgeronde fases |

## Buiten `memory/`

- **[../CLAUDE.md](../CLAUDE.md)** is leidend bij tegenspraak. Daar staan de
  projectinstructies en het autoritatieve deploy-protocol.
- `Skillslibrary/` bevat de agent-prompts (SKILL.md per agent).
