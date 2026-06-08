import { Test, TestingModule } from '@nestjs/testing';
import { TranscriptsController } from '../transcripts.controller';
import { TranscriptsService } from '../transcripts.service';
import { CreateTranscriptDto } from '../dto/create-transcript.dto';

describe('TranscriptsController', () => {
  let controller: TranscriptsController;
  let mockService: {
    create: jest.Mock;
    findById: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      create: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TranscriptsController],
      providers: [{ provide: TranscriptsService, useValue: mockService }],
    }).compile();

    controller = module.get<TranscriptsController>(TranscriptsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /transcripts', () => {
    it('should create a transcript', async () => {
      const dto: CreateTranscriptDto = {
        content: [{ id: 1, name: 'Alice', content: 'Hello', tone: 'friendly' }],
      };
      mockService.create.mockResolvedValue({
        id: 1,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      const result = await controller.create(dto);
      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('status', 'pending');
    });
  });

  describe('GET /transcripts/:id', () => {
    it('should return a transcript', async () => {
      mockService.findById.mockResolvedValue({
        id: 1,
        content: [{ id: 1, name: 'Alice', content: 'Hello', tone: 'friendly' }],
        status: 'done',
        createdAt: new Date().toISOString(),
        processedAt: null,
      });

      const result = await controller.findById(1);
      expect(result).toHaveProperty('id', 1);
    });

    it('should throw NotFoundException for missing transcript', async () => {
      mockService.findById.mockRejectedValue(
        new Error('Transcript 999 not found'),
      );

      await expect(controller.findById(999)).rejects.toThrow();
    });
  });
});
