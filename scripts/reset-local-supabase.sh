#!/usr/bin/env bash
set -euo pipefail

supabase stop --no-backup || true
docker rm -f $(docker ps -aq --filter "name=supabase_") 2>/dev/null || true
docker volume ls -q | grep -i supabase | xargs -I{} docker volume rm {} 2>/dev/null || true
supabase start
supabase db reset
echo "LOCAL DB RESET COMPLETE"
