import { Controller, Get, Param, Query } from '@nestjs/common';
import { MemoriesService } from './memories.service';
import { ZodValidationPipe } from '../core/common/pipes/zod-validation.pipe';
import { grepQuerySchema, GrepQuery } from './dto/grep-response.dto';
import { lsQuerySchema, LsQuery } from './dto/ls-response.dto';

@Controller('memories')
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @Get('ls')
  lsRoot(
    @Query(new ZodValidationPipe(lsQuerySchema))
    query: LsQuery,
  ) {
    return this.memoriesService.ls('', query);
  }

  @Get('ls/*path')
  ls(
    @Param('path') path: string,
    @Query(new ZodValidationPipe(lsQuerySchema))
    query: LsQuery,
  ) {
    return this.memoriesService.ls(path || '', query);
  }

  @Get('cat/*path')
  cat(@Param('path') path: string) {
    return this.memoriesService.cat(path);
  }

  @Get('grep')
  grep(
    @Query(new ZodValidationPipe(grepQuerySchema))
    query: GrepQuery,
  ) {
    return this.memoriesService.grep(query);
  }
}
