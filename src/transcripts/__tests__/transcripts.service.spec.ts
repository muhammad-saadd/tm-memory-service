import { Test, TestingModule } from '@nestjs/testing';
import { TranscriptsService } from '../transcripts.service';
import { TranscriptsRepository } from '../transcripts.repository';
import { QueueService } from '../../services/queue/queue.service';
import { NotFoundException } from '@nestjs/common';

describe('TranscriptsService', () => {
  let service: TranscriptsService;
  let mockRepository: {
    create: jest.Mock;
    findById: jest.Mock;
  };
  let mockQueue: {
    enqueue: jest.Mock;
  };

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
    };
    mockQueue = { enqueue: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscriptsService,
        { provide: TranscriptsRepository, useValue: mockRepository },
        { provide: QueueService, useValue: mockQueue },
      ],
    }).compile();

    service = module.get<TranscriptsService>(TranscriptsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create transcript and enqueue job', async () => {
      mockRepository.create.mockResolvedValue({
        id: 1,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      const result = await service.create({
        content: [{ id: 1, name: 'Alice', content: 'Hello', tone: 'friendly' }],
      });

      expect(result.id).toBe(1);
      expect(result.status).toBe('pending');
      expect(mockQueue.enqueue).toHaveBeenCalledWith(1);
    });
  });

  describe('findById', () => {
    it('should return transcript for existing id', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 1,
        content: [{ id: 1, name: 'Alice', content: 'Hello', tone: 'friendly' }],
        status: 'done',
        created_at: new Date().toISOString(),
        processed_at: null,
      });

      const result = await service.findById(1);
      expect(result.id).toBe(1);
    });

    it('should throw NotFoundException for missing id', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });
});
