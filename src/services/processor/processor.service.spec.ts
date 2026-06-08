import { Test, TestingModule } from '@nestjs/testing';
import { ProcessorService } from './processor.service';
import { ConfigService } from '@nestjs/config';
import { JobsRepository } from '../queue/jobs.repository';
import { LLMService } from '../llm/llm.service';
import { StorageService } from '../storage/storage.service';
import { TranscriptsRepository } from '../../transcripts/transcripts.repository';

function createMockTranscriptsRepository(transcript?: { id: number; content: unknown }) {
  return {
    findById: jest.fn().mockResolvedValue(transcript || null),
    updateStatus: jest.fn(),
    create: jest.fn(),
  };
}

describe('ProcessorService', () => {
  let service: ProcessorService;
  let mockConfig: { get: jest.Mock };
  let mockTranscriptsRepository: ReturnType<typeof createMockTranscriptsRepository>;
  let mockJobsRepository: {
    resetStuckJobs: jest.Mock;
    findNextPending: jest.Mock;
    markProcessing: jest.Mock;
    markDone: jest.Mock;
    markFailed: jest.Mock;
  };
  let mockLLM: {
    extractMemories: jest.Mock;
    mergeMemory: jest.Mock;
  };
  let mockStorage: {
    objectExists: jest.Mock;
    getObject: jest.Mock;
    putObject: jest.Mock;
  };

  beforeEach(async () => {
    mockConfig = { get: jest.fn() };
    mockConfig.get.mockImplementation((key: string) => {
      const cfg: Record<string, unknown> = {
        PROCESSOR_POLL_INTERVAL_MS: 5000,
        PROCESSOR_MAX_ATTEMPTS: 3,
      };
      return cfg[key];
    });

    mockTranscriptsRepository = createMockTranscriptsRepository();

    mockJobsRepository = {
      resetStuckJobs: jest.fn(),
      findNextPending: jest.fn(),
      markProcessing: jest.fn(),
      markDone: jest.fn(),
      markFailed: jest.fn(),
    };

    mockLLM = {
      extractMemories: jest.fn(),
      mergeMemory: jest.fn(),
    };

    mockStorage = {
      objectExists: jest.fn(),
      getObject: jest.fn(),
      putObject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessorService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: TranscriptsRepository, useValue: mockTranscriptsRepository },
        { provide: JobsRepository, useValue: mockJobsRepository },
        { provide: LLMService, useValue: mockLLM },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<ProcessorService>(ProcessorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('poll', () => {
    it('should not call LLM when no pending jobs', async () => {
      mockJobsRepository.findNextPending.mockResolvedValue(null);

      await service.poll();

      expect(mockJobsRepository.resetStuckJobs).toHaveBeenCalled();
      expect(mockLLM.extractMemories).not.toHaveBeenCalled();
    });

    it('should process pending job with no memories', async () => {
      mockJobsRepository.findNextPending.mockResolvedValue({
        id: 1,
        transcript_id: 1,
      });
      mockTranscriptsRepository = createMockTranscriptsRepository({
        id: 1,
        content: [{ id: 1, name: 'Alice', content: 'Hello', tone: 'friendly' }],
      });
      service = await createService();
      mockLLM.extractMemories.mockResolvedValue([]);

      await service.poll();

      expect(mockJobsRepository.markProcessing).toHaveBeenCalledWith(1);
      expect(mockJobsRepository.markDone).toHaveBeenCalledWith(1);
    });

    it('should mark job failed on error', async () => {
      mockJobsRepository.findNextPending.mockResolvedValue({
        id: 2,
        transcript_id: 2,
      });
      mockTranscriptsRepository = createMockTranscriptsRepository();
      service = await createService();

      await service.poll();

      expect(mockJobsRepository.markFailed).toHaveBeenCalled();
    });

    it('should skip poll if already processing', async () => {
      mockJobsRepository.findNextPending.mockResolvedValue(null);

      const promise1 = service.poll();
      const promise2 = service.poll();

      await Promise.all([promise1, promise2]);

      expect(mockJobsRepository.resetStuckJobs).toHaveBeenCalledTimes(1);
    });

    it('should return metrics', async () => {
      const metrics = service.getMetrics();
      expect(metrics).toHaveProperty('jobsProcessed');
      expect(metrics).toHaveProperty('jobsFailed');
      expect(metrics).toHaveProperty('memoriesCreated');
      expect(metrics).toHaveProperty('memoriesUpdated');
      expect(metrics).toHaveProperty('totalProcessingTimeMs');
    });
  });

  async function createService(): Promise<ProcessorService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessorService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: TranscriptsRepository, useValue: mockTranscriptsRepository },
        { provide: JobsRepository, useValue: mockJobsRepository },
        { provide: LLMService, useValue: mockLLM },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();
    return module.get<ProcessorService>(ProcessorService);
  }
});
