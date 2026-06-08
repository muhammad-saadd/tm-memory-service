import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { JobsRepository } from './jobs.repository';

describe('QueueService', () => {
  let service: QueueService;
  let mockJobsRepository: {
    create: jest.Mock;
  };

  beforeEach(async () => {
    mockJobsRepository = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: JobsRepository, useValue: mockJobsRepository },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueue', () => {
    it('should call jobsRepository.create', async () => {
      await service.enqueue(1);
      expect(mockJobsRepository.create).toHaveBeenCalledWith(1);
    });

    it('should not throw on duplicate key (idempotent)', async () => {
      mockJobsRepository.create.mockRejectedValue({
        code: '23505',
        constraint: 'unique',
      });

      await expect(service.enqueue(1)).resolves.toBeUndefined();
    });

    it('should rethrow non-duplicate errors', async () => {
      mockJobsRepository.create.mockRejectedValue(new Error('other'));

      await expect(service.enqueue(1)).rejects.toThrow('other');
    });
  });
});
