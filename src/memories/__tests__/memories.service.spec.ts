import { Test, TestingModule } from '@nestjs/testing';
import { MemoriesService } from '../memories.service';
import { StorageService } from '../../services/storage/storage.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('MemoriesService', () => {
  let service: MemoriesService;
  let mockStorage: {
    listObjects: jest.Mock;
    getObject: jest.Mock;
    objectExists: jest.Mock;
  };

  const defaultQuery = { page: 1, limit: 50 };

  beforeEach(async () => {
    mockStorage = {
      listObjects: jest.fn(),
      getObject: jest.fn(),
      objectExists: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoriesService,
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<MemoriesService>(MemoriesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ls', () => {
    it('should return root entries', async () => {
      mockStorage.objectExists.mockResolvedValue(false);

      const result = await service.ls('', defaultQuery);
      expect(result.path).toBe('/');
      expect(result.entries.length).toBeGreaterThanOrEqual(4);
      const names = result.entries.map((e: { name: string }) => e.name);
      expect(names).toContain('people');
      expect(result.pagination).toBeDefined();
      expect(result.pagination?.page).toBe(1);
    });

    it('should list files at path', async () => {
      mockStorage.listObjects.mockResolvedValue({
        objects: [{ key: 'people/alice.md', size: 100, lastModified: new Date() }],
        prefixes: [],
      });

      const result = await service.ls('/people', defaultQuery);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].name).toBe('alice.md');
    });

    it('should throw NotFoundException for empty path', async () => {
      mockStorage.listObjects.mockResolvedValue({
        objects: [],
        prefixes: [],
      });

      await expect(service.ls('/nonexistent', defaultQuery)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should paginate results', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        key: `people/person-${i}.md`,
        size: 100,
        lastModified: new Date(),
      }));
      mockStorage.listObjects.mockResolvedValue({ objects: entries, prefixes: [] });

      const result = await service.ls('/people', { page: 2, limit: 10 });
      expect(result.entries).toHaveLength(10);
      expect(result.pagination?.total).toBe(100);
      expect(result.pagination?.totalPages).toBe(10);
    });
  });

  describe('cat', () => {
    it('should return file content', async () => {
      mockStorage.getObject.mockResolvedValue('file content');

      const result = await service.cat('/people/alice.md');
      expect(result).toBe('file content');
    });

    it('should throw NotFoundException for missing file', async () => {
      mockStorage.getObject.mockRejectedValue(
        new NotFoundException('not found'),
      );

      await expect(service.cat('/missing.md')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('grep', () => {
    it('should find matching lines', async () => {
      mockStorage.listObjects.mockResolvedValue({
        objects: [{ key: 'people/alice.md', size: 100, lastModified: new Date() }],
        prefixes: [],
      });
      mockStorage.getObject.mockResolvedValue(
        'line 1\nAlice is here\nline 3\nAlice again',
      );

      const result = await service.grep({ q: 'Alice', path: '/', scope: 'all', limit: 50 });
      expect(result.totalMatches).toBe(2);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].lines).toHaveLength(2);
    });

    it('should be case-insensitive', async () => {
      mockStorage.listObjects.mockResolvedValue({
        objects: [{ key: 'test.md', size: 10, lastModified: new Date() }],
        prefixes: [],
      });
      mockStorage.getObject.mockResolvedValue('ALICE is here');

      const result = await service.grep({ q: 'alice', path: '/', scope: 'all', limit: 50 });
      expect(result.totalMatches).toBe(1);
    });

    it('should support regex patterns', async () => {
      mockStorage.listObjects.mockResolvedValue({
        objects: [{ key: 'test.md', size: 10, lastModified: new Date() }],
        prefixes: [],
      });
      mockStorage.getObject.mockResolvedValue('Alice and Bob are here');

      const result = await service.grep({ q: 'Ali|Bob', path: '/', scope: 'all', limit: 50 });
      expect(result.totalMatches).toBe(1);
      expect(result.matches[0].lines[0].content).toContain('Alice');
    });

    it('should throw BadRequestException for invalid regex', async () => {
      await expect(
        service.grep({ q: '[invalid', path: '/', scope: 'all', limit: 50 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return empty matches when nothing found', async () => {
      mockStorage.listObjects.mockResolvedValue({
        objects: [{ key: 'test.md', size: 10, lastModified: new Date() }],
        prefixes: [],
      });
      mockStorage.getObject.mockResolvedValue('nothing here');

      const result = await service.grep({ q: 'zzznotfound', path: '/', scope: 'all', limit: 50 });
      expect(result.totalMatches).toBe(0);
      expect(result.matches).toHaveLength(0);
    });

    it('should search frontmatter only', async () => {
      mockStorage.listObjects.mockResolvedValue({
        objects: [{ key: 'test.md', size: 10, lastModified: new Date() }],
        prefixes: [],
      });
      mockStorage.getObject.mockResolvedValue(
        '---\ntitle: Alice\n---\nAlice is in body',
      );

      const result = await service.grep({ q: 'Alice', path: '/', scope: 'frontmatter', limit: 50 });
      expect(result.totalMatches).toBe(1);
      expect(result.matches[0].lines[0].section).toBe('frontmatter');
    });

    it('should search body only', async () => {
      mockStorage.listObjects.mockResolvedValue({
        objects: [{ key: 'test.md', size: 10, lastModified: new Date() }],
        prefixes: [],
      });
      mockStorage.getObject.mockResolvedValue(
        '---\ntitle: Bob\n---\nAlice is in body',
      );

      const result = await service.grep({ q: 'Alice', path: '/', scope: 'body', limit: 50 });
      expect(result.totalMatches).toBe(1);
      expect(result.matches[0].lines[0].section).toBe('body');
    });
  });
});
