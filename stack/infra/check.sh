#!/bin/bash
set -e

TASK_NAME="$1"

if [ -z "$TASK_NAME" ]; then
    echo "Usage: npm run check <taskName>"
    echo "Example: npm run check botcLogin"
    exit 1
fi

export TASK_NAME
docker-compose -f stack/infra/docker-compose.yml --env-file .env up --build
