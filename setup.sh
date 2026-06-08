#!/bin/bash
set -e
cp .env.example .env
echo "Edit .env and set OPENAI_API_KEY, then run: docker compose up --build"
