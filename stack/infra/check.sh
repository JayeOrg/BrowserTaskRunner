#!/bin/bash
set -e

TASK_NAME="$1"

if [ -z "$TASK_NAME" ]; then
    echo "Usage: npm run check <taskName>"
    echo "Example: npm run check botcLogin"
    exit 1
fi

# Compute hash of source files to bust Docker cache when code changes
SOURCE_HASH=$(find stack -type f -name '*.ts' -exec cat {} \; | shasum -a 256 | cut -c1-12)

export TASK_NAME
export SOURCE_HASH
docker-compose -f stack/infra/docker-compose.yml --env-file .env up --build
