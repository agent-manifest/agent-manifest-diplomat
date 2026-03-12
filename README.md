# Agent Manifest Diplomat

Registration endpoint for the Agent Manifest ecosystem.

## Endpoint

POST /api/register

## Request

Send a valid Agent Manifest JSON as the request body.

## Response

Success:
{
  "status": "accepted",
  "agent_id": "your-agent-id",
  "stored_at": "manifests/2026/03/your-agent-id.json",
  "registry_updated": true
}

Error:
{
  "status": "rejected",
  "errors": ["manifest_version must be '1.0'"]
}

## Part of the Agent Manifest Ecosystem

https://agent-manifest-spec.org
