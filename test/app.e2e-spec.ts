import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from '../src/core/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/core/common/interceptors/response.interceptor';
import { ApiKeyGuard } from '../src/core/guards/api-key.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('App (e2e)', () => {
  let app: INestApplication;
  const API_KEY = 'test-api-key';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          const config: Record<string, unknown> = {
            PORT: 3000,
            NODE_ENV: 'test',
            API_KEY,
            DB_HOST: 'localhost',
            DB_PORT: 5432,
            DB_USER: 'postgres',
            DB_PASSWORD: 'postgres',
            DB_NAME: 'transcripts_test',
            OPENAI_API_KEY: 'test-key',
            OPENAI_MODEL: 'gpt-4o-mini',
            STORAGE_ENDPOINT: 'http://localhost:9000',
            STORAGE_REGION: 'us-east-1',
            STORAGE_ACCESS_KEY: 'minioadmin',
            STORAGE_SECRET_KEY: 'minioadmin',
            STORAGE_BUCKET: 'memories',
            STORAGE_FORCE_PATH_STYLE: true,
            PROCESSOR_POLL_INTERVAL_MS: 5000,
            PROCESSOR_MAX_ATTEMPTS: 3,
          };
          return config[key];
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalGuards(
      new ApiKeyGuard(moduleFixture.get(ConfigService)),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST /transcripts', () => {
    it('should create a transcript', async () => {
      const response = await request(app.getHttpServer())
        .post('/transcripts')
        .set('x-api-key', API_KEY)
        .send({
          content: [
            { id: 1, name: 'Alice', content: 'Hello, I am Alice.', tone: 'friendly' },
            { id: 2, name: 'Bob', content: 'Nice to meet you, Alice.', tone: 'professional' },
          ],
        })
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('status', 'pending');
    });

    it('should return 401 for missing API key', async () => {
      await request(app.getHttpServer())
        .post('/transcripts')
        .send({
          content: [
            { id: 1, name: 'Alice', content: 'Hello.', tone: 'friendly' },
          ],
        })
        .expect(401);
    });

    it('should return 400 for empty content', async () => {
      const response = await request(app.getHttpServer())
        .post('/transcripts')
        .set('x-api-key', API_KEY)
        .send({ content: [] })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 for missing content', async () => {
      await request(app.getHttpServer())
        .post('/transcripts')
        .set('x-api-key', API_KEY)
        .send({})
        .expect(400);
    });
  });

  describe('GET /transcripts/:id', () => {
    it('should return transcript after creation', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/transcripts')
        .set('x-api-key', API_KEY)
        .send({
          content: [
            { id: 1, name: 'Alice', content: 'Hello.', tone: 'friendly' },
          ],
        })
        .expect(201);

      const id = createResponse.body.data.id;

      const getResponse = await request(app.getHttpServer())
        .get(`/transcripts/${id}`)
        .set('x-api-key', API_KEY)
        .expect(200);

      expect(getResponse.body.data).toHaveProperty('id', id);
      expect(getResponse.body.data).toHaveProperty('content');
      expect(getResponse.body.data).toHaveProperty('status');
    });

    it('should return 404 for nonexistent transcript', async () => {
      await request(app.getHttpServer())
        .get('/transcripts/999999')
        .set('x-api-key', API_KEY)
        .expect(404);
    });
  });

  describe('GET /memories/ls', () => {
    it('should list root directories', async () => {
      const response = await request(app.getHttpServer())
        .get('/memories/ls')
        .set('x-api-key', API_KEY)
        .expect(200);

      expect(response.body.data).toHaveProperty('entries');
      expect(response.body.data.entries.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('GET /memories/grep', () => {
    it('should return 400 for missing q parameter', async () => {
      await request(app.getHttpServer())
        .get('/memories/grep')
        .set('x-api-key', API_KEY)
        .expect(400);
    });

    it('should accept regex query', async () => {
      const response = await request(app.getHttpServer())
        .get('/memories/grep?q=test')
        .set('x-api-key', API_KEY)
        .expect(200);

      expect(response.body.data).toHaveProperty('query', 'test');
      expect(response.body.data).toHaveProperty('matches');
    });
  });
});
