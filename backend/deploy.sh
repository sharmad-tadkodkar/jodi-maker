#!/usr/bin/env bash
# Build the image from our Dockerfile and deploy it to Cloud Run (deterministic; no buildpack auto-detect).
set -euo pipefail
cd "$(dirname "$0")"
PROJECT=ai-build-cup-2026
REGION=asia-south1
IMAGE="$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/jodi-api:$(date +%Y%m%d-%H%M%S)"

gcloud builds submit --project "$PROJECT" --region "$REGION" --tag "$IMAGE" -q .
gcloud run deploy jodi-api --image "$IMAGE" --project "$PROJECT" --region "$REGION" \
  --service-account "jodi-api@$PROJECT.iam.gserviceaccount.com" \
  --allow-unauthenticated --min-instances 1 --max-instances 3 --no-cpu-throttling \
  --cpu 1 --memory 1Gi --timeout 600 -q
