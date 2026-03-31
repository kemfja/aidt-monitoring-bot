import express, { Application } from 'express';
import cors from 'cors';
import path from 'path';
import urlsRouter from './routes/urls';
import monitoringRouter from './routes/monitoring';
import configRouter from './routes/config';
import logger from './utils/logger';

/**
 * Express 앱 생성 및 설정
 */
export function createApp(): Application {
  const app = express();

  // 미들웨어 설정
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 정적 파일 제공
  app.use(express.static(path.join(process.cwd(), 'public')));

  // API 라우팅
  app.use('/api/urls', urlsRouter);
  app.use('/api/monitoring', monitoringRouter);
  app.use('/api/config', configRouter);

  // 기본 라우트 (대시보드)
  app.get('/', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  // 404 처리
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: '찾을 수 없는 경로입니다' });
  });

  // 에러 핸들러
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('서버 오류', { error: err.message });
    res.status(500).json({ success: false, error: '서버 오류가 발생했습니다' });
  });

  return app;
}
