import { ZodValidationPipe } from './zod-validation.pipe';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    count: z.number().positive(),
  });

  const pipe = new ZodValidationPipe(schema);

  it('should return parsed data for valid input', () => {
    const result = pipe.transform({ name: 'test', count: 5 });
    expect(result).toEqual({ name: 'test', count: 5 });
  });

  it('should throw BadRequestException for invalid input', () => {
    expect(() => pipe.transform({ name: '', count: -1 })).toThrow(
      BadRequestException,
    );
  });

  it('should include validation errors in the exception', () => {
    try {
      pipe.transform({ name: '', count: -1 });
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const response = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response.errors).toBeDefined();
      expect(Array.isArray(response.errors)).toBe(true);
    }
  });

  it('should return the parsed data for valid nested objects', () => {
    const nestedSchema = z.object({
      user: z.object({
        name: z.string(),
        age: z.number(),
      }),
    });
    const nestedPipe = new ZodValidationPipe(nestedSchema);
    const result = nestedPipe.transform({ user: { name: 'Alice', age: 30 } });
    expect(result).toEqual({ user: { name: 'Alice', age: 30 } });
  });
});
