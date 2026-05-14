# Agent Manifest Diplomat

Registration endpoint for the Agent Manifest ecosystem.

## Infrastructure Role

The Diplomat is a serverless registration gateway — not the core specification.
It receives Agent Manifest declarations, validates their structure, and persists
them to the public dataset repository.

It is not a public-facing conceptual repository. It is infrastructure.

## Endpoint

POST /api/register

## Request

Send a valid Agent Manifest JSON as the request body.

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

Note: `registry_updated` is always `false`. Registry regeneration is handled
separately by the dataset repository CI (`build-registry.yml`), which triggers
automatically when a new manifest file is committed.

Error:
```json
{
  "status": "rejected",
  "errors": ["manifest_version must be '1.0'"]
}
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Yes | Personal Access Token with `contents:write` on `DATASET_REPO` |
| `GITHUB_OWNER` | Yes | GitHub org or user that owns the dataset repository |
| `DATASET_REPO` | Yes | Name of the dataset repository |

See `.env.example` for local development defaults.

In production (Vercel), these must be set as environment variables in the
project settings. The function will not write manifests if `GITHUB_TOKEN`
is absent or lacks sufficient permissions.

## Part of the Agent Manifest Ecosystem

https://agent-manifest-spec.org
