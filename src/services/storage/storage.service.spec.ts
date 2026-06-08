import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';

jest.mock('@aws-sdk/client-s3');

describe('StorageService', () => {
  let service: StorageService;
  let mockSend: jest.Mock;

  beforeEach(async () => {
    mockSend = jest.fn();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, unknown> = {
                STORAGE_BUCKET: 'test-bucket',
                STORAGE_ENDPOINT: 'http://localhost:9000',
                STORAGE_REGION: 'us-east-1',
                STORAGE_ACCESS_KEY: 'test-key',
                STORAGE_SECRET_KEY: 'test-secret',
                STORAGE_FORCE_PATH_STYLE: true,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('putObject', () => {
    it('should call PutObjectCommand with correct params', async () => {
      await service.putObject('test/key.md', 'content');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArgs = mockSend.mock.calls[0];
      expect(callArgs[0]).toBeInstanceOf(PutObjectCommand);
    });
  });

  describe('getObject', () => {
    it('should return string content for existing key', async () => {
      const stream = Readable.from(['hello world']);
      mockSend.mockResolvedValue({ Body: stream });

      const result = await service.getObject('test/key.md');
      expect(result).toBe('hello world');
    });

    it('should throw NotFoundException for missing key', async () => {
      mockSend.mockRejectedValue({ name: 'NoSuchKey' });

      await expect(service.getObject('missing.md')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listObjects', () => {
    it('should return objects and prefixes', async () => {
      mockSend.mockResolvedValue({
        Contents: [{ Key: 'people/alice.md', Size: 100, LastModified: new Date() }],
        CommonPrefixes: [{ Prefix: 'people/' }],
      });

      const result = await service.listObjects('people', '/');
      expect(result.objects).toHaveLength(1);
      expect(result.prefixes).toContain('people/');
    });

    it('should handle empty results', async () => {
      mockSend.mockResolvedValue({ Contents: [], CommonPrefixes: [] });

      const result = await service.listObjects('empty', '/');
      expect(result.objects).toHaveLength(0);
      expect(result.prefixes).toHaveLength(0);
    });
  });

  describe('objectExists', () => {
    it('should return true for existing object', async () => {
      mockSend.mockResolvedValue({});

      const result = await service.objectExists('existing.md');
      expect(result).toBe(true);
    });

    it('should return false for non-existing object', async () => {
      mockSend.mockRejectedValue({ name: 'NotFound' });

      const result = await service.objectExists('missing.md');
      expect(result).toBe(false);
    });
  });

  describe('deleteObject', () => {
    it('should call DeleteObjectCommand', async () => {
      await service.deleteObject('to-delete.md');
      expect(mockSend).toHaveBeenCalledWith(
        expect.any(DeleteObjectCommand),
      );
    });
  });
});
