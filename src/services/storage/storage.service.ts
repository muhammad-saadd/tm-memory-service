import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { AppConfig } from '../../core/config/config.schema';
import { ListResult, StorageObject } from './storage.types';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.bucket = this.config.get('STORAGE_BUCKET');
    this.client = new S3Client({
      endpoint: this.config.get('STORAGE_ENDPOINT'),
      region: this.config.get('STORAGE_REGION'),
      credentials: {
        accessKeyId: this.config.get('STORAGE_ACCESS_KEY'),
        secretAccessKey: this.config.get('STORAGE_SECRET_KEY'),
      },
      forcePathStyle: this.config.get('STORAGE_FORCE_PATH_STYLE'),
    });
    this.logger.log(`Storage client initialized for bucket=${this.bucket}`);
  }

  async healthCheck(): Promise<void> {
    await this.client.send(
      new HeadBucketCommand({ Bucket: this.bucket }),
    );
  }

  async putObject(
    key: string,
    body: string,
    contentType = 'text/plain',
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      this.logger.debug(`putObject: ${key} (${body.length} bytes)`);
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      this.logger.error(`putObject failed for ${key}: ${error.message || err}`);
      throw err;
    }
  }

  async getObject(key: string): Promise<string> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      const stream = response.Body as Readable;
      return await this.streamToString(stream);
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
        throw new NotFoundException(`Object not found: ${key}`);
      }
      this.logger.error(`getObject failed for ${key}: ${err}`);
      throw err;
    }
  }

  async listObjects(
    prefix: string,
    delimiter = '/',
  ): Promise<ListResult> {
    const normalizedPrefix = prefix ? `${prefix.replace(/\/$/, '')}/` : '';

    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: normalizedPrefix,
          Delimiter: delimiter,
        }),
      );

      const objects: StorageObject[] = (response.Contents || []).map((c) => ({
        key: c.Key || '',
        size: c.Size || 0,
        lastModified: c.LastModified || new Date(),
        contentType: 'text/plain',
      }));

      const prefixes = (response.CommonPrefixes || []).map(
        (p) => p.Prefix || '',
      );

      return { objects, prefixes };
    } catch (err: unknown) {
      this.logger.error(`listObjects failed for prefix=${normalizedPrefix}: ${err}`);
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      this.logger.debug(`deleteObject: ${key}`);
    } catch (err: unknown) {
      this.logger.error(`deleteObject failed for ${key}: ${err}`);
      throw err;
    }
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return false;
      }
      this.logger.error(`objectExists check failed for ${key}: ${err}`);
      throw err;
    }
  }

  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf-8');
    } catch (err: unknown) {
      this.logger.error(`Stream read failed: ${err}`);
      throw err;
    }
  }
}
