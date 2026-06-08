import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { StorageService } from '../services/storage/storage.service';
import { LsResponseDto, LsQuery } from './dto/ls-response.dto';
import { GrepResponseDto, GrepQuery } from './dto/grep-response.dto';
import { MemoryCategory } from '../services/llm/llm.types';
import matter from 'gray-matter';

@Injectable()
export class MemoriesService {
  private readonly logger = new Logger(MemoriesService.name);

  private readonly KNOWN_PREFIXES: MemoryCategory[] = [
    'people',
    'topics',
    'events',
    'preferences',
    'organizations',
    'locations',
  ];

  constructor(private readonly storageService: StorageService) {}

  async ls(rawPath: string, query: LsQuery): Promise<LsResponseDto> {
    const path = this.normalizePath(rawPath);

    if (path === '') {
      const entries: LsResponseDto['entries'] = [];

      for (const prefix of this.KNOWN_PREFIXES) {
        entries.push({ name: prefix, type: 'directory' });
      }

      try {
        const indexExists = await this.storageService.objectExists('index.json');
        if (indexExists) {
          const indexObj = await this.storageService.getObject('index.json');
          entries.push({
            name: 'index.json',
            type: 'file',
            size: Buffer.byteLength(indexObj),
          });
        }
      } catch (err: unknown) {
        if (err instanceof NotFoundException) {
          this.logger.debug('index.json not found, skipping');
        } else {
          this.logger.warn(`Failed to check index.json: ${err}`);
        }
      }

      const total = entries.length;
      const start = (query.page - 1) * query.limit;
      const paginatedEntries = entries.slice(start, start + query.limit);

      return {
        path: '/',
        entries: paginatedEntries,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    }

    this.assertSafePath(path);

    const result = await this.storageService.listObjects(path, '/');

    const entries: LsResponseDto['entries'] = [];

    for (const prefix of result.prefixes) {
      const name = prefix.replace(`${path}/`, '').replace(/\/$/, '');
      if (name) {
        entries.push({ name, type: 'directory' });
      }
    }

    for (const obj of result.objects) {
      const name = obj.key.split('/').pop() || obj.key;
      if (name) {
        entries.push({
          name,
          type: 'file',
          size: obj.size,
          updated: obj.lastModified.toISOString(),
        });
      }
    }

    if (entries.length === 0) {
      throw new NotFoundException(`No entries found at path: ${rawPath}`);
    }

    const total = entries.length;
    const start = (query.page - 1) * query.limit;
    const paginatedEntries = entries.slice(start, start + query.limit);

    return {
      path: `/${path}`,
      entries: paginatedEntries,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async cat(rawPath: string): Promise<string> {
    const path = this.normalizePath(rawPath);
    this.assertSafePath(path);
    return this.storageService.getObject(path);
  }

  async grep(query: GrepQuery): Promise<GrepResponseDto> {
    let regex: RegExp;
    try {
      regex = new RegExp(query.q, 'gi');
    } catch {
      throw new BadRequestException(`Invalid regex pattern: ${query.q}`);
    }

    const path = this.normalizePath(query.path);
    const prefix = path === '' ? '' : `${path}/`;
    const result = await this.storageService.listObjects(prefix, '');

    const matches: GrepResponseDto['matches'] = [];
    let totalMatches = 0;

    const files = result.objects.filter(
      (o) => o.key.endsWith('.md') || o.key.endsWith('.json'),
    );

    for (const file of files) {
      if (matches.length >= query.limit) break;

      let content: string;
      try {
        content = await this.storageService.getObject(file.key);
      } catch (err: unknown) {
        this.logger.warn(`Skipping file ${file.key} during grep: ${err}`);
        continue;
      }

      const fileMatch = this.searchFile(file.key, content, regex, query.scope);
      if (fileMatch) {
        matches.push(fileMatch);
        totalMatches += fileMatch.matchCount;
      }
    }

    matches.sort((a, b) => b.score - a.score);

    return {
      query: query.q,
      path: `/${path}`,
      scope: query.scope,
      totalMatches,
      matches: matches.slice(0, query.limit),
    };
  }

  private searchFile(
    key: string,
    content: string,
    regex: RegExp,
    scope: 'all' | 'frontmatter' | 'body',
  ): GrepResponseDto['matches'][0] | null {
    const fileLines: GrepResponseDto['matches'][0]['lines'] = [];
    let score = 0;
    let category: string | undefined;
    let tags: string[] | undefined;

    const { data: frontmatterData, content: bodyContent } = matter(content);
    const bodyStartLine = content.indexOf(bodyContent);
    const bodyLineOffset = bodyStartLine >= 0
      ? content.slice(0, bodyStartLine).split('\n').length
      : 0;

    category = frontmatterData.category as string | undefined;
    tags = (frontmatterData.tags as string[] | undefined) || undefined;

    if (scope === 'all' || scope === 'frontmatter') {
      const frontmatterLines = content.slice(0, bodyStartLine >= 0 ? bodyStartLine : content.length).split('\n');
      for (let i = 0; i < frontmatterLines.length; i++) {
        regex.lastIndex = 0;
        if (regex.test(frontmatterLines[i])) {
          fileLines.push({
            lineNumber: i + 1,
            content: frontmatterLines[i].trim(),
            section: 'frontmatter',
          });
          score += 3;
        }
      }
    }

    if (scope === 'all' || scope === 'body') {
      const bodyLines = bodyContent.split('\n');
      for (let i = 0; i < bodyLines.length; i++) {
        regex.lastIndex = 0;
        if (regex.test(bodyLines[i])) {
          fileLines.push({
            lineNumber: bodyLineOffset + i + 1,
            content: bodyLines[i].trim(),
            section: 'body',
          });
          score += 1;
        }
      }
    }

    if (fileLines.length === 0) return null;

    if (category) score += 2;
    if (tags && tags.length > 0) score += 1;

    return {
      file: key,
      category,
      tags,
      matchCount: fileLines.length,
      score,
      lines: fileLines,
    };
  }

  private normalizePath(rawPath: string): string {
    return decodeURIComponent(rawPath).replace(/^\/+|\/+$/g, '');
  }

  private assertSafePath(path: string): void {
    if (path.includes('..') || path.includes('\0')) {
      throw new BadRequestException('Path traversal not allowed');
    }
  }
}
