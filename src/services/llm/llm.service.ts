import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AppConfig } from '../../core/config/config.schema';
import {
  ExtractedMemory,
  extractedMemoriesSchema,
} from './llm.types';
import {
  EXTRACT_SYSTEM_PROMPT,
  MERGE_SYSTEM_PROMPT,
  EVALUATE_SYSTEM_PROMPT,
  buildExtractPrompt,
  buildMergePrompt,
  buildEvaluatePrompt,
} from './llm.prompts';

const MAX_EVAL_RETRIES = 2;

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.client = new OpenAI({
      apiKey: this.config.get('OPENAI_API_KEY'),
    });
    this.model = this.config.get('OPENAI_MODEL');
    this.logger.log(`LLM client initialized model=${this.model}`);
  }

  async healthCheck(): Promise<void> {
    await this.client.models.list();
  }

  async extractMemories(
    transcriptId: number,
    content: string,
  ): Promise<ExtractedMemory[]> {
    let memories: ExtractedMemory[];
    try {
      memories = await this.extractRaw(transcriptId, content);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        `Memory extraction failed for transcript ${transcriptId}: ${errMsg}`,
      );
    }

    for (let attempt = 0; attempt < MAX_EVAL_RETRIES; attempt++) {
      const evaluation = await this.evaluateMemories(memories, content);
      if (evaluation.pass) {
        this.logger.log(
          `Evaluation passed for transcript ${transcriptId} (score: ${evaluation.score.toFixed(2)})`,
        );
        break;
      }

      this.logger.warn(
        `Evaluation failed for transcript ${transcriptId} (attempt ${attempt + 1}, score: ${evaluation.score.toFixed(2)}): ${evaluation.feedback}`,
      );

      if (attempt < MAX_EVAL_RETRIES - 1) {
        try {
          memories = await this.extractWithFeedback(
            transcriptId,
            content,
            memories,
            evaluation.feedback,
          );
        } catch (err: unknown) {
          this.logger.warn(`Retry extraction failed, returning previous memories: ${err}`);
        }
      }
    }

    return memories;
  }

  private async extractRaw(
    transcriptId: number,
    content: string,
  ): Promise<ExtractedMemory[]> {
    const userMessage = buildExtractPrompt(transcriptId, content);

    this.logger.log(
      `LLM extractMemories: transcriptId=${transcriptId} contentLength=${content.length}`,
    );

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '[]';

    let parsed: unknown;
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new InternalServerErrorException(
        `LLM returned invalid JSON for transcript ${transcriptId}: ${raw.slice(0, 200)}`,
      );
    }

    const memories = (parsed as Record<string, unknown>)?.memories;

    if (!Array.isArray(memories)) {
      throw new InternalServerErrorException(
        `LLM returned non-array memories (type=${typeof memories}) for transcript ${transcriptId}`,
      );
    }

    const result = extractedMemoriesSchema.safeParse(memories);
    if (!result.success) {
      throw new InternalServerErrorException(
        `LLM output failed schema validation for transcript ${transcriptId}: ${result.error.message}`,
      );
    }

    this.logger.log(
      `LLM extractMemories: extracted ${result.data.length} memories from transcript ${transcriptId}`,
    );
    return result.data;
  }

  private async extractWithFeedback(
    transcriptId: number,
    content: string,
    previousMemories: ExtractedMemory[],
    feedback: string,
  ): Promise<ExtractedMemory[]> {
    const userMessage = [
      buildExtractPrompt(transcriptId, content),
      '',
      'PREVIOUS EXTRACTION (had issues):',
      JSON.stringify(previousMemories, null, 2),
      '',
      'FEEDBACK:',
      feedback,
      '',
      'Please extract again, addressing the feedback above.',
    ].join('\n');

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '[]';

    let parsed: unknown;
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.warn(
        `Retry extraction for transcript ${transcriptId} returned invalid JSON, returning previous memories`,
      );
      return previousMemories;
    }

    const memories = (parsed as Record<string, unknown>)?.memories;

    if (!Array.isArray(memories)) {
      this.logger.warn(
        `Retry extraction for transcript ${transcriptId} returned non-array memories, returning previous memories`,
      );
      return previousMemories;
    }

    const result = extractedMemoriesSchema.safeParse(memories);
    if (!result.success) {
      this.logger.warn(
        `Retry extraction for transcript ${transcriptId} failed schema validation, returning previous memories`,
      );
      return previousMemories;
    }

    return result.data;
  }

  private async evaluateMemories(
    memories: ExtractedMemory[],
    transcriptContent: string,
  ): Promise<{ pass: boolean; score: number; feedback: string }> {
    if (memories.length === 0) {
      return { pass: true, score: 1, feedback: 'No memories to evaluate' };
    }

    const userMessage = buildEvaluatePrompt(
      memories[0],
      transcriptContent,
    );

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: EVALUATE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);

      return {
        pass: Boolean(parsed.pass),
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Evaluation LLM call failed: ${errMsg}`);
      return { pass: true, score: 0.7, feedback: 'Evaluation unavailable' };
    }
  }

  async mergeMemory(
    existingContent: string,
    newMemory: ExtractedMemory,
    transcriptId: number,
  ): Promise<string> {
    const userMessage = buildMergePrompt(existingContent, newMemory, transcriptId);

    this.logger.log(`LLM mergeMemory: slug=${newMemory.slug} transcriptId=${transcriptId}`);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: MERGE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
      });

      const merged = completion.choices[0]?.message?.content || '';

      if (!merged.trim()) {
        throw new InternalServerErrorException(
          `LLM returned empty merge result for slug=${newMemory.slug} transcript ${transcriptId}`,
        );
      }

      return merged.trim();
    } catch (err: unknown) {
      if (err instanceof InternalServerErrorException) throw err;
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        `LLM merge failed for slug=${newMemory.slug} transcript ${transcriptId}: ${errMsg}`,
      );
    }
  }
}
