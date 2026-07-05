![Status](https://img.shields.io/badge/status-operational-1a1917?style=flat-square)
![Gateway](https://img.shields.io/badge/gateway-lightweight-1a1917?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)

# Agent Manifest Diplomat

Public registration gateway for Agent Manifest declarations.

-----

## What this is

The Diplomat is a serverless registration gateway. It receives submitted Agent Manifest declarations, performs lightweight pre-write checks, and writes accepted manifests to the public dataset repository.

It is infrastructure, not a public-facing conceptual repository. The gateway performs lightweight pre-write checks only — it does not perform full v1.0 schema validation (see [Validation boundary](#validation-boundary)).

-----

## What this is not

- **Not a runtime.** The Diplomat does not execute, observe, or supervise any agent.
- **Not an enforcement engine.** Acceptance into the dataset is not enforcement of declared boundaries.
- **Not a scoring system.** The Diplomat does not rank, rate, score, or compare declarations.
- **Not the full v1.0 validator.** The gateway performs lightweight pre-write checks only; accepted manifests are persisted without full schema validation at write time.
- **Not a compliance authority.** Inclusion of a declaration in the dataset is not a compliance statement about the declaring system.

-----

## Validation boundary

The Diplomat performs five lightweight pre-write checks at the gateway:

- `manifest_version` must equal `"1.0"`
- `agent_id` is required (and must match `^[a-zA-Z0-9._-]+$`)
- `agent_name` is required
- `agent_version` is required
- `purpose` is required

The Diplomat does not validate submissions against the full [`schema.json`](https://agent-manifest-spec.org/spec/v1.0/schema.json). It is intentionally narrow — it receives submissions, applies the checks above, and persists accepted manifests to `manifests/YYYY/MM/<agent_id>.json` in the [dataset repository](https://github.com/agent-manifest/agent-manifest-dataset). Manifests submitted through the dataset's issue-based registration path are fully validated by that workflow; manifests accepted by this gateway rely on the pre-write checks above.

-----

## Endpoint

```
POST https://agent-manifest-diplomat.vercel.app/api/register
```

-----

## Request

Send a valid Agent Manifest JSON as the request body.

-----

## Response

Success:
```json
{
  "status": "accepted",
  "agent_id": "your-agent-id",
  "stored_at": "manifests/2026/03/your-agent-id.json",
  "registry_updated": false
}
```

Accepted manifests are persisted to `manifests/YYYY/MM/<agent_id>.json` in the
dataset repository, as reported by `stored_at`.

Note: `registry_updated` is always `false` — the Diplomat writes only the
manifest file and never updates `registry.json` as part of the request. The
registry index is synchronized asynchronously in the dataset repository: its
`Agent Registry` workflow (`build-registry.yml`) regenerates `registry.json`
automatically whenever a push changes `manifests/**` or `registry.json`, so
the index reflects a new registration shortly after the manifest is committed.

Error:
```json
{
  "status": "rejected",
  "errors": ["manifest_version must be '1.0'"]
}
```

-----

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Yes | Personal Access Token with `contents:write` on `DATASET_REPO` |
| `GITHUB_OWNER` | Yes | GitHub org or user that owns the dataset repository |
| `DATASET_REPO` | Yes | Name of the dataset repository |

See `.env.example` for local development defaults.

In production, these must be set as environment variables in the deployment
settings. The function will not write manifests if `GITHUB_TOKEN` is absent
or lacks sufficient permissions.

-----

## Canonical links

- **Specification** — https://agent-manifest-spec.org
- **Schema (v1.0)** — https://agent-manifest-spec.org/spec/v1.0/schema.json
- **Dataset** — https://github.com/agent-manifest/agent-manifest-dataset

-----

## License

MIT License. See [`LICENSE`](./LICENSE).

---

**Part of the [Agent Manifest](https://agent-manifest-spec.org) ecosystem**

[Spec](https://github.com/agent-manifest/agent-manifest) ·
[Registry](https://github.com/agent-manifest/agent-manifest-registry) ·
[Dataset](https://github.com/agent-manifest/agent-manifest-dataset) ·
[Ambassador](https://github.com/agent-manifest/agent-manifest-ambassador) ·
[Diplomat](https://github.com/agent-manifest/agent-manifest-diplomat) ·
[Boundary Handshake](https://github.com/agent-manifest/boundary-handshake) ·
[∈ Principle](https://github.com/agent-manifest/e-principle)

MIT
