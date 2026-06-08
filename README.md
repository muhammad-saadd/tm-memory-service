# Transcript Memory Service

A service that ingests conversation transcripts, extracts structured memories using an LLM, stores them in a navigable file tree backed by cloud object storage, and exposes them via unix-style REST endpoints.

## Project Scope

Given a conversation transcript like:
```json
[
  {"id": 1, "name": "Alice", "content": "Hey, I just moved to San Francisco!", "tone": "excited"},
  {"id": 2, "name": "Bob", "content": "Nice! I live there too. Which neighborhood?", "tone": "friendly"}
]
```

The system:
1. Accepts the transcript via API
2. Queues it for background processing
3. Uses OpenAI to extract structured memories (people, topics, events, preferences, organizations, locations)
4. Stores memories as markdown files with YAML frontmatter in S3/MinIO
5. Maintains a JSON index for fast lookups
6. Exposes `ls`, `cat`, and `grep` endpoints to navigate the memory tree

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                              │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    NestJS API                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Transcripts│  │ Memories │  │ Health   │  │ Metrics  │   │
│  │Controller │  │Controller│  │Controller│  │Controller│   │
│  └─────┬────┘  └─────┬────┘  └──────────┘  └──────────┘   │
│        │             │                                      │
│  ┌─────▼────┐  ┌─────▼────┐                                │
│  │Transcripts│  │ Memories │                                │
│  │ Service   │  │ Service  │                                │
│  └─────┬────┘  └─────┬────┘                                │
│        │             │                                      │
│  ┌─────▼────┐  ┌─────▼────┐                                │
│  │Transcripts│  │ Storage  │                                │
│  │Repository │  │ Service  │                                │
│  └─────┬────┘  └─────┬────┘                                │
│        │             │                                      │
│  ┌─────▼────┐        │                                      │
│  │  Queue   │        │                                      │
│  │ Service  │        │                                      │
│  └─────┬────┘        │                                      │
│        │             │                                      │
│  ┌─────▼─────────────▼────┐                                │
│  │    Processor Service    │                                │
│  │  ┌──────┐  ┌────────┐  │                                │
│  │  │ LLM  │  │ Storage│  │                                │
│  │  │Service│  │Service │  │                                │
│  │  └──────┘  └────────┘  │                                │
│  └────────────────────────┘                                │
└─────────────────────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│PostgreSQL│ │ MinIO/S3 │ │ OpenAI   │
│ Database │ │ Storage  │ │   API    │
└──────────┘ └──────────┘ └──────────┘
```

## Repository Structure

```
tm-memory-service/
├── src/
│   ├── main.ts                              # Bootstrap, global guards/interceptors/filters
│   ├── app.module.ts                        # Root module wiring
│   ├── health.controller.ts                 # GET /health
│   ├── metrics.controller.ts                # GET /metrics
│   ├── core/
│   │   ├── common/
│   │   │   ├── filters/
│   │   │   │   └── http-exception.filter.ts # Consistent error responses
│   │   │   ├── interceptors/
│   │   │   │   ├── request-id.interceptor.ts # x-request-id header
│   │   │   │   ├── logging.interceptor.ts    # Request/response logging
│   │   │   │   └── response.interceptor.ts   # JSON envelope wrapper
│   │   │   ├── pipes/
│   │   │   │   └── zod-validation.pipe.ts    # Zod schema validation
│   │   │   └── utils/
│   │   │       └── slug.ts                   # Slug generation
│   │   ├── config/
│   │   │   ├── config.module.ts
│   │   │   └── config.schema.ts             # Zod-validated env vars
│   │   ├── database/
│   │   │   ├── database.module.ts
│   │   │   ├── database.service.ts
│   │   │   ├── database.types.ts            # Kysely types
│   │   │   └── migrations/
│   │   │       └── 001_initial.ts
│   │   └── guards/
│   │       └── api-key.guard.ts             # x-api-key auth
│   ├── memories/
│   │   ├── memories.module.ts
│   │   ├── memories.controller.ts           # ls/cat/grep endpoints
│   │   ├── memories.service.ts              # File tree navigation
│   │   ├── dto/
│   │   │   ├── ls-response.dto.ts           # Pagination types
│   │   │   └── grep-response.dto.ts         # Search result types
│   │   └── __tests__/
│   │       ├── memories.service.spec.ts
│   │       └── memories.controller.spec.ts
│   ├── transcripts/
│   │   ├── transcripts.module.ts
│   │   ├── transcripts.controller.ts        # POST/GET transcript endpoints
│   │   ├── transcripts.service.ts
│   │   ├── transcripts.repository.ts
│   │   ├── dto/
│   │   │   └── create-transcript.dto.ts     # Conversation message schema
│   │   └── __tests__/
│   │       ├── transcripts.service.spec.ts
│   │       └── transcripts.controller.spec.ts
│   └── services/
│       ├── llm/
│       │   ├── llm.module.ts
│       │   ├── llm.service.ts               # OpenAI extraction + merge + evaluation
│       │   ├── llm.types.ts                 # Memory schemas (Zod)
│       │   └── llm.prompts.ts               # System prompts with few-shot examples
│       ├── storage/
│       │   ├── storage.module.ts
│       │   ├── storage.service.ts           # S3/MinIO client
│       │   └── storage.types.ts
│       ├── queue/
│       │   ├── queue.module.ts
│       │   ├── queue.service.ts
│       │   └── jobs.repository.ts           # Job CRUD with optimistic locking
│       └── processor/
│           ├── processor.module.ts
│           └── processor.service.ts         # Background poller with mutex
├── test/
│   └── app.e2e-spec.ts                      # E2E tests
├── docker-compose.yml                       # PostgreSQL + MinIO + App
├── Dockerfile
├── .env.example
└── package.json
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment name |
| `API_KEY` | **Yes** | — | Secret for `x-api-key` header authentication |
| `DB_HOST` | No | `postgres` | PostgreSQL host (docker-compose sets this) |
| `DB_PORT` | No | `5432` | PostgreSQL port (docker-compose sets this) |
| `DB_USER` | **Yes** | — | PostgreSQL user |
| `DB_PASSWORD` | **Yes** | — | PostgreSQL password |
| `DB_NAME` | No | `transcripts` | PostgreSQL database name |
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model to use |
| `STORAGE_ENDPOINT` | **Yes** | — | S3/MinIO endpoint (docker-compose sets this) |
| `STORAGE_REGION` | No | `us-east-1` | S3 region |
| `STORAGE_ACCESS_KEY` | **Yes** | — | S3 access key |
| `STORAGE_SECRET_KEY` | **Yes** | — | S3 secret key |
| `STORAGE_BUCKET` | No | `memories` | S3 bucket name |
| `STORAGE_FORCE_PATH_STYLE` | No | `true` | Use path-style S3 URLs |
| `PROCESSOR_POLL_INTERVAL_MS` | No | `5000` | How often processor checks for jobs |
| `PROCESSOR_MAX_ATTEMPTS` | No | `3` | Max retry attempts per job |

## Setup

### Prerequisites
- Docker and Docker Compose
- OpenAI API key

### Quick Start

```bash
# 1. Clone and enter directory
cd tm-memory-service

# 2. Create .env from example
cp .env.example .env

# 3. Edit .env — set at minimum:
#    OPENAI_API_KEY=sk-your-key-here
#    API_KEY=any-secret-string-you-want
#    DB_USER=postgres
#    DB_PASSWORD=postgres
#    STORAGE_ACCESS_KEY=minioadmin
#    STORAGE_SECRET_KEY=minioadmin

# 4. Start everything
docker compose up --build

# 5. In another terminal, test the API
curl -X POST http://localhost:3000/transcripts \
  -H "x-api-key: any-secret-string-you-want" \
  -H "Content-Type: application/json" \
  -d '{
    "content": [
      {"id": 1, "name": "Alice", "content": "Hey, I just moved to San Francisco!", "tone": "excited"},
      {"id": 2, "name": "Bob", "content": "Nice! I live there too. Which neighborhood?", "tone": "friendly"}
    ]
  }'
```

### Running Locally (without Docker)

```bash
# Requires local PostgreSQL and MinIO running
npm install
npx jest --no-coverage  # Run unit tests
npm run start:dev       # Start dev server
```

## API Endpoints

All endpoints except `/health` require the `x-api-key` header.

### System Endpoints

#### Health Check
```bash
curl http://localhost:3000/health
```
Response:
```json
{
  "statusCode": 200,
  "message": null,
  "error": null,
  "requestId": "a1b2c3d4-...",
  "data": {
    "status": "ok",
    "timestamp": "2025-06-08T10:30:00.000Z"
  }
}
```

#### Metrics
```bash
curl http://localhost:3000/metrics \
  -H "x-api-key: your-api-key"
```
Response:
```json
{
  "statusCode": 200,
  "message": null,
  "error": null,
  "requestId": "...",
  "data": {
    "processor": {
      "jobsProcessed": 42,
      "jobsFailed": 2,
      "memoriesCreated": 150,
      "memoriesUpdated": 89,
      "totalProcessingTimeMs": 125000,
      "lastPollAt": "2025-06-08T10:30:00.000Z"
    },
    "timestamp": "2025-06-08T10:30:00.000Z"
  }
}
```

### Transcript Endpoints

#### Create Transcript
```bash
curl -X POST http://localhost:3000/transcripts \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "content": [
      {"id": 1, "name": "Alice", "content": "Hello, I am Alice.", "tone": "friendly"},
      {"id": 2, "name": "Bob", "content": "Nice to meet you, Alice.", "tone": "professional"}
    ]
  }'
```
Response:
```json
{
  "statusCode": 201,
  "message": null,
  "error": null,
  "requestId": "...",
  "data": {
    "id": 1,
    "status": "pending",
    "createdAt": "2025-06-08T10:30:00.000Z"
  }
}
```

#### Get Transcript
```bash
curl http://localhost:3000/transcripts/1 \
  -H "x-api-key: your-api-key"
```
Response:
```json
{
  "statusCode": 200,
  "message": null,
  "error": null,
  "requestId": "...",
  "data": {
    "id": 1,
    "content": [
      {"id": 1, "name": "Alice", "content": "Hello, I am Alice.", "tone": "friendly"}
    ],
    "status": "done",
    "createdAt": "2025-06-08T10:30:00.000Z",
    "processedAt": "2025-06-08T10:30:05.000Z"
  }
}
```

### Memory Endpoints

#### List Directory
```bash
# List root
curl http://localhost:3000/memories/ls \
  -H "x-api-key: your-api-key"

# List with pagination
curl "http://localhost:3000/memories/ls?page=1&limit=10" \
  -H "x-api-key: your-api-key"

# List subdirectory
curl http://localhost:3000/memories/ls/people \
  -H "x-api-key: your-api-key"
```
Response:
```json
{
  "statusCode": 200,
  "message": null,
  "error": null,
  "requestId": "...",
  "data": {
    "path": "/",
    "entries": [
      {"name": "people", "type": "directory"},
      {"name": "topics", "type": "directory"},
      {"name": "events", "type": "directory"},
      {"name": "preferences", "type": "directory"},
      {"name": "organizations", "type": "directory"},
      {"name": "locations", "type": "directory"}
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 6,
      "totalPages": 1
    }
  }
}
```

#### Read Memory File
```bash
curl http://localhost:3000/memories/cat/people/alice-chen.md \
  -H "x-api-key: your-api-key"
```
Response:
```json
{
  "statusCode": 200,
  "message": null,
  "error": null,
  "requestId": "...",
  "data": "---\nid: \"people/alice-chen\"\ncategory: people\ntitle: Alice Chen\ntags:\n  - engineer\n  - backend\nconfidence: 0.85\nsources:\n  - 1\ncreated: \"2025-06-08T10:30:00.000Z\"\nupdated: \"2025-06-08T10:30:00.000Z\"\n---\n\n## Summary\nAlice Chen is a senior backend engineer.\n\n## Key Points\n- 8 years experience\n- Leads a team of 4\n\n## Context\nMentioned during architecture discussion.\n\n## Update Log"
}
```

#### Search Memories
```bash
# Basic search
curl "http://localhost:3000/memories/grep?q=San+Francisco" \
  -H "x-api-key: your-api-key"

# Search with scope and limit
curl "http://localhost:3000/memories/grep?q=engineer&scope=body&limit=10" \
  -H "x-api-key: your-api-key"

# Search with regex
curl "http://localhost:3000/memories/grep?q=Alice|Bob" \
  -H "x-api-key: your-api-key"

# Search in specific directory
curl "http://localhost:3000/memories/grep?q=meeting&path=events" \
  -H "x-api-key: your-api-key"
```
Query Parameters:
| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `q` | Yes | — | Search query (supports regex) |
| `path` | No | `/` | Directory to search in |
| `scope` | No | `all` | `all`, `frontmatter`, or `body` |
| `limit` | No | `50` | Max results (1-100) |

Response:
```json
{
  "statusCode": 200,
  "message": null,
  "error": null,
  "requestId": "...",
  "data": {
    "query": "San Francisco",
    "path": "/",
    "scope": "all",
    "totalMatches": 2,
    "matches": [
      {
        "file": "people/alice-chen.md",
        "category": "people",
        "tags": ["location", "city"],
        "matchCount": 2,
        "score": 5,
        "lines": [
          {"lineNumber": 5, "content": "Moved to San Francisco", "section": "body"},
          {"lineNumber": 12, "content": "Lives in SF Mission District", "section": "body"}
        ]
      }
    ]
  }
}
```

## File Tree Structure

```
memories/
├── index.json                          ← Global index (all entries)
├── people/
│   ├── index.json                      ← Category index
│   └── alice-chen.md
├── topics/
│   ├── index.json
│   └── machine-learning.md
├── events/
│   ├── index.json
│   └── 2025/
│       └── 06/
│           └── 2025-06-08-standup.md   ← YYYY/MM subdirectories
├── preferences/
│   ├── index.json
│   └── food.md
├── organizations/
│   ├── index.json
│   └── acme-corp.md
└── locations/
    ├── index.json
    └── san-francisco.md
```

### Memory File Format

```markdown
---
id: "people/alice-chen"
category: people
title: Alice Chen
tags:
  - engineer
  - backend
  - team-lead
confidence: 0.85
sources:
  - 1
  - 42
created: "2025-06-08T10:30:00.000Z"
updated: "2025-06-15T14:22:00.000Z"
---

## Summary
Alice Chen is a senior backend engineer at Acme Corp.

## Key Points
- 8 years experience in distributed systems
- Leads a team of 4 engineers
- Prefers TypeScript over Python

## Context
Mentioned during architecture discussion about the new microservices migration.

## Update Log
### 2025-06-15 (transcript-42)
- Promoted to Senior Engineer
- Now leads a team of 4 engineers
```

## Architectural Decisions

### Why Polling Over Event-Driven
The processor uses a polling pattern (`setInterval` + DB query) instead of event-driven (Redis pub/sub, webhooks). This was chosen because:
- Simpler to deploy and debug
- No additional infrastructure dependencies
- The `resetStuckJobs` mechanism handles reliability
- Adequate for expected load (< 100 transcripts/minute)

### Why Per-Category Index Files
Instead of a single `index.json` at the root, each category has its own `index.json`:
- Reduces write contention (multiple processors writing to different files)
- Faster reads when listing a specific category
- Root `index.json` is still maintained as a convenience aggregate

### Why Regex Grep Over Full-Text Search
The grep endpoint does a brute-force S3 scan of all `.md`/`.json` files under the requested path, filtering lines against a regex. This is fine for up to ~1000 files. Beyond that, an Elasticsearch or Meilisearch sidecar would be needed for sub-second search. The current approach avoids extra infrastructure and handles the expected scale.

### Why LLM Evaluation + Retry
The system evaluates LLM output quality before accepting it:
- First extraction → evaluate → if score < 0.7, retry with feedback
- Max 2 retries to prevent infinite loops
- Falls back to previous extraction if retry fails
- Gracefully degrades if evaluation LLM call fails (treats as pass)

### Why Markdown Files
Memories are stored as markdown with YAML frontmatter:
- Human-readable and editable
- Git-friendly if exported
- Frontmatter provides structured metadata for indexing
- Body content is searchable via grep

## Assumptions

1. **Single-instance deployment**: The mutex in `ProcessorService` prevents overlap within a single process, but multi-instance deployments would need distributed locking
2. **Moderate scale**: Designed for < 100 transcripts/minute, not high-throughput streaming
3. **English transcripts**: Prompts and schemas assume English content
4. **OpenAI availability**: The system depends on OpenAI API for extraction and merge
5. **S3 consistency**: Object storage provides eventual consistency for reads after writes

## Tradeoffs Considered

| Decision | Chose | Over | Why |
|----------|-------|------|-----|
| Polling | ✓ | Event-driven | Simpler, fewer dependencies |
| Regex grep | ✓ | Full-text search (Elasticsearch) | No extra infra, good enough for < 1000 files |
| LLM merge | ✓ | Append-only | Preserves context, avoids duplicates |
| Per-category indexes | ✓ | Single global index | Reduces write contention |
| Markdown files | ✓ | Raw JSON | Human-readable, searchable |
| Zod validation | ✓ | Class-validator | Runtime type safety, lighter |

## What to Do Next (1-2 Days)

### Day 1: Production Hardening

1. **Add integration tests** (3-4 hours)
   - Use `testcontainers` for real PostgreSQL + MinIO
   - Test full flow: create transcript → process → search memory
   - Test concurrent job processing
   - Test error recovery (LLM failure, storage failure)

2. **Add request validation** (1-2 hours)
   - Limit transcript size (max messages, max content length)
   - Add `Content-Type` validation on POST endpoints
   - Add request timeout (abort if processing takes too long)

3. **Add structured logging** (1-2 hours)
   - Use `pino` or `winston` for JSON logs
   - Add correlation IDs to all log entries
   - Log LLM token usage and costs

### Day 2: Operational Readiness

4. **Add health check details** (1 hour)
   - Check PostgreSQL connectivity
   - Check MinIO connectivity
   - Check OpenAI API key validity
   - Return degraded status if any dependency is down

5. **Add Docker health checks** (30 min)
   - Update `docker-compose.yml` with proper health checks
   - Add `depends_on` conditions

6. **Add graceful shutdown** (1 hour)
   - Wait for in-flight jobs to complete
   - Close DB connections cleanly
   - Drain request queue

7. **Add basic monitoring** (1-2 hours)
   - Export metrics to Prometheus format
   - Add Grafana dashboard for job processing
   - Alert on high failure rate

8. **Write deployment docs** (1 hour)
   - Production environment variables
   - Scaling considerations
   - Backup strategy for S3 bucket
