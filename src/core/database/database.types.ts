import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'failed';
export type JobStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface TranscriptTable {
  id: Generated<number>;
  content: unknown;
  status: TranscriptStatus;
  created_at: string;
  processed_at: string | null;
}

export interface ProcessingJobTable {
  id: Generated<number>;
  transcript_id: number;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  transcripts: TranscriptTable;
  processing_jobs: ProcessingJobTable;
}

export type Transcript = Selectable<TranscriptTable>;
export type NewTranscript = Insertable<TranscriptTable>;
export type TranscriptUpdate = Updateable<TranscriptTable>;

export type ProcessingJob = Selectable<ProcessingJobTable>;
export type NewProcessingJob = Insertable<ProcessingJobTable>;
export type ProcessingJobUpdate = Updateable<ProcessingJobTable>;
