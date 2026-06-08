import { ExtractedMemory } from './llm.types';

export const EXTRACT_SYSTEM_PROMPT = `You are a memory extraction system. Given a conversation transcript, extract structured memories.

Return a JSON object with a single key "memories" containing an array of memory objects.

No markdown, no preamble, no explanation.

Each memory object must have:
- "category": one of "people" | "topics" | "events" | "preferences" | "organizations" | "locations"
- "slug": lowercase hyphenated identifier derived from the title (e.g. "alice-chen", "machine-learning", "acme-corp")
- "title": human-readable title (e.g. "Alice Chen", "Machine Learning Discussion", "Acme Corp")
- "tags": array of relevant lowercase tags
- "content": markdown content for this memory (NO frontmatter, use ## headings)
- "confidence": number 0-1 indicating how confident you are this is a real, lasting memory (0.5 = uncertain, 0.9 = very confident)
- "eventDate": (only for "events" category) ISO date string "YYYY-MM-DD"

Guidelines per category:
- "people": One entry per distinct person mentioned. Include role, relationship to speakers, facts, opinions expressed. Confidence 0.7+ for people with clear identity.
- "topics": One entry per significant subject discussed. Summarise key points and perspectives. Confidence 0.6+ for substantive topics.
- "events": One entry per named event, meeting, or milestone. Include participants and outcomes. Confidence 0.8+ for concrete events.
- "preferences": One entry per preference domain (e.g. "food", "technology"). Group related preferences. Confidence 0.7+ for stated preferences.
- "organizations": One entry per company, team, or institution mentioned. Include what is known about them. Confidence 0.8+ for named organizations.
- "locations": One entry per specific location mentioned (city, office, venue). Include context. Confidence 0.7+ for named locations.

Content markdown format:
## Summary
One paragraph summary.

## Key Points
- Bullet point facts

## Context
Where/when this came up and why it matters.

## Update Log
(empty initially)

Set "memories" to an empty array [] if no memorable information is found.

Example output:
{"memories": [
  {
    "category": "people",
    "slug": "alice-chen",
    "title": "Alice Chen",
    "tags": ["engineer", "backend", "team-lead"],
    "content": "## Summary\\nAlice Chen is a senior backend engineer at Acme Corp.\\n\\n## Key Points\\n- 8 years experience in distributed systems\\n- Leads a team of 4 engineers\\n- Prefers TypeScript over Python\\n\\n## Context\\nMentioned during architecture discussion about the new microservices migration.\\n\\n## Update Log",
    "confidence": 0.85
  }
]}`;

export const MERGE_SYSTEM_PROMPT = `You are a memory consolidation system. You will receive an existing memory file (without frontmatter) and new information extracted from a fresh transcript. Produce a single merged memory.

Rules:
1. Preserve ALL existing information unless it directly contradicts new information
2. Add new non-redundant information from the new extract
3. If something has changed (e.g. person changed role), note both old and new with dates
4. Maintain the same markdown structure (## headings)
5. Add a new entry under "## Update Log" (create this section if missing) in format:
   ### {date} (transcript-{id})
   - bullet points of what changed or was added
6. Return ONLY the markdown body text. No frontmatter. No preamble.

Example merge:

EXISTING:
## Summary
Alice Chen is a backend engineer at StartupX.

## Key Points
- 5 years experience
- Works on the API layer

## Context
Discussed during sprint planning.

## Update Log

NEW INFORMATION:
Alice got promoted to Senior Engineer and now leads a team of 3.

MERGED OUTPUT:
## Summary
Alice Chen is a senior backend engineer at StartupX, now leading a team.

## Key Points
- 5+ years experience
- Works on the API layer
- Promoted to Senior Engineer
- Leads a team of 3 engineers

## Context
Discussed during sprint planning.

## Update Log
### 2025-01-15 (transcript-42)
- Promoted to Senior Engineer
- Now leads a team of 3 engineers`;

export const EVALUATE_SYSTEM_PROMPT = `You are a memory quality evaluator. Given an extracted memory and the original transcript, evaluate if the memory is accurate and complete.

Return a JSON object with:
- "pass": boolean (true if memory is acceptable)
- "score": number 0-1 (quality score)
- "feedback": string (specific improvement suggestions if score < 0.7)

Rules:
1. Check that the memory accurately represents information from the transcript
2. Check that no significant information was missed
3. Check that the slug is derived from the title (not invented separately)
4. Check that tags are relevant and not too generic
5. Check that confidence is calibrated (higher = more certain this is a real, lasting memory)
6. Mark as pass=true if score >= 0.7, otherwise pass=false with specific feedback`;

export function buildExtractPrompt(
  transcriptId: number,
  content: string,
): string {
  return `Transcript ID: ${transcriptId}

${content}`;
}

export function buildMergePrompt(
  existingContent: string,
  newMemory: ExtractedMemory,
  transcriptId: number,
): string {
  const today = new Date().toISOString().split('T')[0];
  return [
    'EXISTING MEMORY:',
    existingContent,
    '',
    `NEW INFORMATION (from transcript ${transcriptId}):`,
    newMemory.content,
    '',
    `Today's date: ${today}`,
  ].join('\n');
}

export function buildEvaluatePrompt(
  memory: ExtractedMemory,
  transcriptContent: string,
): string {
  return [
    'ORIGINAL TRANSCRIPT:',
    transcriptContent,
    '',
    'EXTRACTED MEMORY:',
    JSON.stringify(memory, null, 2),
  ].join('\n');
}
