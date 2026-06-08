import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  ParseIntPipe,
} from '@nestjs/common';
import { TranscriptsService } from './transcripts.service';
import { ZodValidationPipe } from '../core/common/pipes/zod-validation.pipe';
import { CreateTranscriptDto, createTranscriptSchema } from './dto/create-transcript.dto';

@Controller('transcripts')
export class TranscriptsController {
  constructor(private readonly transcriptsService: TranscriptsService) {}

  @Post('/')
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createTranscriptSchema))
    dto: CreateTranscriptDto,
  ) {
    return this.transcriptsService.create(dto);
  }

  @Get('/:id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.transcriptsService.findById(id);
  }
}
