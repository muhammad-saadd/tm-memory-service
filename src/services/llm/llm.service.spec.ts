import { Test, TestingModule } from '@nestjs/testing';
import { LLMService } from './llm.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { InternalServerErrorException } from '@nestjs/common';

jest.mock('openai');

describe('LLMService', () => {
  let service: LLMService;
  let mockCreate: jest.Mock;

  beforeEach(async () => {
    mockCreate = jest.fn();
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                OPENAI_API_KEY: 'test-key',
                OPENAI_MODEL: 'gpt-5-nano',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LLMService>(LLMService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractMemories', () => {
    it('should return parsed memories from LLM response', async () => {
      const memories = [
        {
          category: 'people',
          slug: 'alice-chen',
          title: 'Alice Chen',
          tags: ['engineer'],
          content: '## Summary\nAlice is a backend engineer.',
          confidence: 0.85,
        },
      ];

      mockCreate
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ memories }) } }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ pass: true, score: 0.9, feedback: '' }) } }],
        });

      const result = await service.extractMemories(1, 'Hello, I am Alice.');
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('alice-chen');
      expect(result[0].confidence).toBe(0.85);
    });

    it('should handle empty array from LLM', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ memories: [] }) } }],
      });

      const result = await service.extractMemories(1, 'boring content');
      expect(result).toHaveLength(0);
    });

    it('should throw on invalid JSON from LLM', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not json' } }],
      });

      await expect(
        service.extractMemories(1, 'content'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw on wrong schema from LLM', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ memories: [{ wrong: 'field' }] }) } }],
      });

      await expect(
        service.extractMemories(1, 'content'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should retry on low evaluation score', async () => {
      const memories = [
        {
          category: 'people',
          slug: 'alice-chen',
          title: 'Alice Chen',
          tags: ['engineer'],
          content: '## Summary\nAlice is a backend engineer.',
          confidence: 0.8,
        },
      ];

      mockCreate
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ memories }) } }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ pass: false, score: 0.5, feedback: 'Missing role info' }) } }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ memories }) } }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ pass: true, score: 0.85, feedback: '' }) } }],
        });

      const result = await service.extractMemories(1, 'Hello, I am Alice.');
      expect(result).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledTimes(4);
    });
  });

  describe('mergeMemory', () => {
    it('should return merged content from LLM', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'merged content here' } }],
      });

      const result = await service.mergeMemory(
        'existing content',
        { category: 'people', slug: 'alice', title: 'Alice', tags: [], content: 'new info' },
        1,
      );
      expect(result).toBe('merged content here');
    });

    it('should throw on empty LLM response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '' } }],
      });

      await expect(
        service.mergeMemory('existing', { category: 'people', slug: 'a', title: 'A', tags: [], content: 'new' }, 1),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
