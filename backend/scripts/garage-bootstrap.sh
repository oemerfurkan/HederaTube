#!/bin/sh
# One-shot, idempotent Garage bootstrap: layout, bucket, access key. Runs inside the garage image
# (docker compose service `garage-init`). Prints the key pair once; store it in the api/worker env.
set -eu
BUCKET="${S3_BUCKET:-hederatube}"
KEY_NAME="${GARAGE_KEY_NAME:-hederatube-app}"
until garage status >/dev/null 2>&1; do echo "waiting for garage…"; sleep 2; done
NODE_ID=$(garage status | awk '/^[0-9a-f]{16}/{print $1; exit}')
if garage layout show | grep -q "$NODE_ID"; then
  echo "layout already assigned"
else
  garage layout assign -z dc1 -c "${GARAGE_CAPACITY:-50G}" "$NODE_ID"
  garage layout apply --version 1
fi
garage bucket info "$BUCKET" >/dev/null 2>&1 || garage bucket create "$BUCKET"
if garage key info "$KEY_NAME" >/dev/null 2>&1; then
  echo "key $KEY_NAME exists"
else
  garage key create "$KEY_NAME"
  garage key info "$KEY_NAME" --show-secret
fi
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME"
echo "garage ready: bucket=$BUCKET key=$KEY_NAME"
