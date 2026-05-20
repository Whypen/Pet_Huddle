#!/usr/bin/env bash
set -euo pipefail

EDGE_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_edge_runtime_' | head -n 1 || true)"

if [[ -z "${EDGE_CONTAINER}" ]]; then
  echo "No local Supabase Edge Runtime container found. Run 'supabase start' first."
  exit 1
fi

EDGE_MEMORY="${EDGE_MEMORY:-2048m}"
EDGE_SWAP="${EDGE_SWAP:-2048m}"
EDGE_CPUS="${EDGE_CPUS:-2}"

echo "Hardening ${EDGE_CONTAINER}"
echo "  memory=${EDGE_MEMORY} swap=${EDGE_SWAP} cpus=${EDGE_CPUS}"

docker update \
  --memory "${EDGE_MEMORY}" \
  --memory-swap "${EDGE_SWAP}" \
  --cpus "${EDGE_CPUS}" \
  --restart unless-stopped \
  "${EDGE_CONTAINER}" >/dev/null

echo
docker inspect "${EDGE_CONTAINER}" --format \
  'Status={{.State.Status}} RestartCount={{.RestartCount}} OOMKilled={{.State.OOMKilled}} Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}}'

echo
echo "Recent edge runtime logs:"
docker logs --tail 40 "${EDGE_CONTAINER}" || true
