import { Request, Response, NextFunction } from 'express';

/**
 * API Key 인증 미들웨어
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  const validKey = process.env.API_KEY || 'subak-monitoring-2024';

  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: 'API Key가 필요합니다. 요청 헤더에 x-api-key를 포함해주세요.'
    });
    return;
  }

  if (apiKey !== validKey) {
    res.status(403).json({
      success: false,
      error: '유효하지 않은 API Key입니다.'
    });
    return;
  }

  next();
}
