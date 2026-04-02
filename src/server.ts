import 'dotenv/config';
import { createApp } from './app';
import { configManager } from './config';
import { scheduler } from './core/scheduler';
import { jsonRepository } from './repositories/json-repository';
import logger from './utils/logger';
import { closeSharedBrowser } from './utils/playwright-checker';

/**
 * 서버 시작
 */
async function startServer(): Promise<void> {
  try {
    // 저장소 초기화
    await jsonRepository.initialize();
    logger.info('저장소 초기화 완료');

    // 앱 생성
    const app = createApp();
    const serverConfig = configManager.getServerConfig();

    // 서버 시작
    app.listen(serverConfig.port, serverConfig.host, () => {
      logger.info(`서버 시작: http://${serverConfig.host}:${serverConfig.port}`);
    });

    // 스케줄러 시작
    scheduler.start();
  } catch (error) {
    logger.error('서버 시작 실패', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('서버 종료 요청 수신');
  scheduler.stop();
  await closeSharedBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('서버 종료 요청 수신');
  scheduler.stop();
  await closeSharedBrowser();
  process.exit(0);
});

// 서버 시작
startServer();
