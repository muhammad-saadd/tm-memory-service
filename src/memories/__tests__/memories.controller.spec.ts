import { Test, TestingModule } from '@nestjs/testing';
import { MemoriesController } from '../memories.controller';
import { MemoriesService } from '../memories.service';

describe('MemoriesController', () => {
  let controller: MemoriesController;
  let mockService: {
    ls: jest.Mock;
    cat: jest.Mock;
    grep: jest.Mock;
  };

  const defaultQuery = { page: 1, limit: 50 };

  beforeEach(async () => {
    mockService = {
      ls: jest.fn(),
      cat: jest.fn(),
      grep: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MemoriesController],
      providers: [{ provide: MemoriesService, useValue: mockService }],
    }).compile();

    controller = module.get<MemoriesController>(MemoriesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /memories/ls', () => {
    it('should list root entries', async () => {
      mockService.ls.mockResolvedValue({
        path: '/',
        entries: [
          { name: 'people', type: 'directory' },
          { name: 'topics', type: 'directory' },
        ],
        pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
      });

      const result = await controller.lsRoot(defaultQuery);
      expect(result.entries).toHaveLength(2);
      expect(mockService.ls).toHaveBeenCalledWith('', defaultQuery);
    });
  });

  describe('GET /memories/ls/*path', () => {
    it('should list entries at path', async () => {
      mockService.ls.mockResolvedValue({
        path: '/people',
        entries: [{ name: 'alice.md', type: 'file', size: 100 }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      const result = await controller.ls('people', defaultQuery);
      expect(result.entries).toHaveLength(1);
      expect(mockService.ls).toHaveBeenCalledWith('people', defaultQuery);
    });
  });

  describe('GET /memories/cat/*path', () => {
    it('should return file content', async () => {
      mockService.cat.mockResolvedValue('file content here');

      const result = await controller.cat('people/alice.md');
      expect(result).toBe('file content here');
    });
  });

  describe('GET /memories/grep', () => {
    it('should search files', async () => {
      mockService.grep.mockResolvedValue({
        query: 'alice',
        path: '/',
        scope: 'all',
        totalMatches: 1,
        matches: [{ file: 'people/alice.md', matchCount: 1, score: 4, lines: [] }],
      });

      const result = await controller.grep({ q: 'alice', path: '/', scope: 'all', limit: 50 });
      expect(result.totalMatches).toBe(1);
    });
  });
});
