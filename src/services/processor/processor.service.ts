import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsRepository } from '../queue/jobs.repository';
import { LLMService } from '../llm/llm.service';
import { StorageService } from '../storage/storage.service';
import { AppConfig } from '../../core/config/config.schema';
import { ProcessingJob } from '../../core/database/database.types';
import { ExtractedMemory, MemoryIndexV2 } from '../llm/llm.types';
import { TranscriptsRepository } from '../../transcripts/transcripts.repository';
import matter from 'gray-matter';

export interface ProcessorMetrics {
  jobsProcessed: number;
  jobsFailed: number;
  memoriesCreated: number;
  memoriesUpdated: number;
  totalProcessingTimeMs: number;
  lastPollAt: string | null;
}

@Injectable()
export class ProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessorService.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private metrics: ProcessorMetrics = {
    jobsProcessed: 0,
    jobsFailed: 0,
    memoriesCreated: 0,
    memoriesUpdated: 0,
    totalProcessingTimeMs: 0,
    lastPollAt: null,
  };

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly jobsRepository: JobsRepository,
    private readonly transcriptsRepository: TranscriptsRepository,
    private readonly llmService: LLMService,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit(): void {
    const pollInterval = this.config.get('PROCESSOR_POLL_INTERVAL_MS');
    this.logger.log(`Processor starting, poll interval=${pollInterval}ms`);
    void this.poll();
    this.intervalId = setInterval(() => void this.poll(), pollInterval);
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getMetrics(): ProcessorMetrics {
    return { ...this.metrics };
  }

  async poll(): Promise<void> {
    if (this.processing) {
      this.logger.debug('Previous poll still running, skipping');
      return;
    }

    this.processing = true;
    this.metrics.lastPollAt = new Date().toISOString();

    try {
      const maxAttempts = this.config.get('PROCESSOR_MAX_ATTEMPTS');

      await this.jobsRepository.resetStuckJobs();

      const job = await this.jobsRepository.findNextPending(maxAttempts);
      if (!job) return;

      this.logger.log(`Processing job ${job.id} for transcript ${job.transcript_id}`);
      await this.jobsRepository.markProcessing(job.id);

      const start = Date.now();

      try {
        await this.processJob(job);
        await this.jobsRepository.markDone(job.id);

        await this.transcriptsRepository.updateStatus(
          job.transcript_id,
          'done',
          new Date().toISOString(),
        );

        const duration = Date.now() - start;
        this.metrics.jobsProcessed++;
        this.metrics.totalProcessingTimeMs += duration;

        this.logger.log(`Job ${job.id} completed in ${duration}ms`);
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        this.logger.error(`Job ${job.id} failed: ${errorMessage}`);

        try {
          await this.jobsRepository.markFailed(job.id, errorMessage);
          await this.transcriptsRepository.updateStatus(
            job.transcript_id,
            'failed',
          );
        } catch (markErr: unknown) {
          const markErrMsg = markErr instanceof Error ? markErr.message : String(markErr);
          this.logger.error(`Failed to mark job ${job.id} as failed: ${markErrMsg}`);
        }

        this.metrics.jobsFailed++;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Poll cycle failed: ${errorMessage}`);
    } finally {
      this.processing = false;
    }
  }

  private async processJob(job: ProcessingJob): Promise<void> {
    const transcript = await this.transcriptsRepository.findById(
      job.transcript_id,
    );

    if (!transcript) {
      throw new Error(`Transcript ${job.transcript_id} not found`);
    }

    const content = JSON.stringify(transcript.content);
    const memories = await this.llmService.extractMemories(
      job.transcript_id,
      content,
    );

    this.logger.log(
      `Extracted ${memories.length} memories from transcript ${job.transcript_id}`,
    );

    for (const memory of memories) {
      await this.writeMemory(job.transcript_id, memory);
    }
  }

  private async writeMemory(
    transcriptId: number,
    memory: ExtractedMemory,
  ): Promise<void> {
    const path = this.buildStoragePath(memory);
    const exists = await this.storageService.objectExists(path);

    let body: string;
    let existingSources: number[] = [];
    let created: string = new Date().toISOString();

    if (exists) {
      const existingContent = await this.storageService.getObject(path);
      const { data: existingData } = matter(existingContent);
      existingSources = (existingData.sources as number[]) || [];
      created = (existingData.created as string) || created;

      body = await this.llmService.mergeMemory(
        existingContent,
        memory,
        transcriptId,
      );

      this.metrics.memoriesUpdated++;
    } else {
      body = memory.content;
      this.metrics.memoriesCreated++;
    }

    const sources = [
      ...new Set([...existingSources, transcriptId]),
    ];

    const fileContent = this.buildFileContent(
      memory,
      transcriptId,
      body,
      sources,
      created,
    );

    await this.storageService.putObject(path, fileContent, 'text/plain');
    await this.updateIndex(memory, transcriptId, path);

    this.logger.log(`Wrote memory: ${path} (sources: ${sources.join(', ')})`);
  }

  private async loadIndex(indexPath: string): Promise<MemoryIndexV2> {
    const emptyIndex: MemoryIndexV2 = {
      lastUpdated: new Date().toISOString(),
      entries: [],
      byCategory: {
        people: [],
        topics: [],
        events: [],
        preferences: [],
        organizations: [],
        locations: [],
      },
    };

    try {
      const raw = await this.storageService.getObject(indexPath);
      return JSON.parse(raw) as MemoryIndexV2;
    } catch (err: unknown) {
      if (err instanceof NotFoundException) {
        this.logger.debug(`No existing ${indexPath}, creating new one`);
        return emptyIndex;
      }
      this.logger.warn(`Failed to read ${indexPath}: ${err}`);
      return emptyIndex;
    }
  }

  private async updateIndex(
    memory: ExtractedMemory,
    transcriptId: number,
    path: string,
  ): Promise<void> {
    const indexPath = `${memory.category}/index.json`;
    const index = await this.loadIndex(indexPath);

    const existingEntry = index.entries.find((e) => e.path === path);
    const now = new Date().toISOString();

    if (existingEntry) {
      existingEntry.sources = [
        ...new Set([...existingEntry.sources, transcriptId]),
      ];
      existingEntry.updated = now;
      existingEntry.tags = [
        ...new Set([...existingEntry.tags, ...memory.tags]),
      ];
      if (memory.confidence !== undefined) {
        existingEntry.confidence = memory.confidence;
      }
    } else {
      index.entries.push({
        path,
        category: memory.category,
        title: memory.title,
        tags: memory.tags,
        sources: [transcriptId],
        confidence: memory.confidence,
        created: now,
        updated: now,
      });
    }

    index.lastUpdated = now;

    if (!index.byCategory) {
      index.byCategory = {
        people: [],
        topics: [],
        events: [],
        preferences: [],
        organizations: [],
        locations: [],
      };
    }
    const categoryPaths = index.byCategory[memory.category] || [];
    if (!categoryPaths.includes(path)) {
      categoryPaths.push(path);
    }
    index.byCategory[memory.category] = categoryPaths;

    await this.storageService.putObject(
      indexPath,
      JSON.stringify(index, null, 2),
      'application/json',
    );

    try {
      const rootIndexPath = 'index.json';
      const rootIndex = await this.loadIndex(rootIndexPath);

      const rootEntry = rootIndex.entries.find((e) => e.path === path);
      if (rootEntry) {
        rootEntry.sources = [...new Set([...rootEntry.sources, transcriptId])];
        rootEntry.updated = now;
        rootEntry.tags = [...new Set([...rootEntry.tags, ...memory.tags])];
      } else {
        rootIndex.entries.push({
          path,
          category: memory.category,
          title: memory.title,
          tags: memory.tags,
          sources: [transcriptId],
          confidence: memory.confidence,
          created: now,
          updated: now,
        });
      }

      rootIndex.lastUpdated = now;
      if (!rootIndex.byCategory) {
        rootIndex.byCategory = {
          people: [],
          topics: [],
          events: [],
          preferences: [],
          organizations: [],
          locations: [],
        };
      }
      const rootCategoryPaths = rootIndex.byCategory[memory.category] || [];
      if (!rootCategoryPaths.includes(path)) {
        rootCategoryPaths.push(path);
      }
      rootIndex.byCategory[memory.category] = rootCategoryPaths;

      await this.storageService.putObject(
        rootIndexPath,
        JSON.stringify(rootIndex, null, 2),
        'application/json',
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to update root index: ${errMsg}`);
    }
  }

  private buildStoragePath(memory: ExtractedMemory): string {
    const slug = memory.slug;

    if (memory.category === 'events') {
      const datePrefix = memory.eventDate || new Date().toISOString().split('T')[0];
      const [year, month] = datePrefix.split('-');
      return `events/${year}/${month}/${datePrefix}-${slug}.md`;
    }

    return `${memory.category}/${slug}.md`;
  }

  private buildFileContent(
    memory: ExtractedMemory,
    transcriptId: number,
    body: string,
    sources: number[],
    created: string,
  ): string {
    const now = new Date().toISOString();
    const frontmatter = {
      id: `${memory.category}/${memory.slug}`,
      category: memory.category,
      title: memory.title,
      tags: memory.tags,
      confidence: memory.confidence,
      sources,
      created,
      updated: now,
    };

    return matter.stringify(body, frontmatter);
  }
}
