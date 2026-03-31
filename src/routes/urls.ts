import { Router } from 'express';
import { urlService } from '../services/url-service';
import { CreateUrlDto, UpdateUrlDto } from '../models/url-config';
import logger from '../utils/logger';
import { requireApiKey } from '../middleware/auth';

const router = Router();

/**
 * GET /api/urls - 전체 URL 목록 조회
 */
router.get('/', async (_req, res) => {
  try {
    const urls = await urlService.findAll();
    return res.json({ success: true, data: urls });
  } catch (error) {
    logger.error('GET /api/urls 오류', { error });
    return res.status(500).json({ success: false, error: 'URL 목록 조회 실패' });
  }
});

/**
 * GET /api/urls/:id - 특정 URL 조회
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const url = await urlService.findById(id);

    if (!url) {
      return res.status(404).json({ success: false, error: 'URL을 찾을 수 없습니다' });
    }

    return res.json({ success: true, data: url });
  } catch (error) {
    logger.error('GET /api/urls/:id 오류', { error });
    return res.status(500).json({ success: false, error: 'URL 조회 실패' });
  }
});

/**
 * POST /api/urls - URL 생성
 */
router.post('/', requireApiKey, async (req, res) => {
  try {
    const dto: CreateUrlDto = req.body;

    // 필수 필드 검증
    if (!dto.name || !dto.url) {
      return res.status(400).json({ success: false, error: 'name과 url은 필수 항목입니다' });
    }

    const newUrl = await urlService.create(dto);
    return res.status(201).json({ success: true, data: newUrl });
  } catch (error) {
    logger.error('POST /api/urls 오류', { error });

    if (error instanceof Error && error.message.includes('URL')) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(500).json({ success: false, error: 'URL 생성 실패' });
  }
});

/**
 * PUT /api/urls/:id - URL 수정
 */
router.put('/:id', requireApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const dto: UpdateUrlDto = req.body;

    const updatedUrl = await urlService.update(id, dto);

    if (!updatedUrl) {
      return res.status(404).json({ success: false, error: 'URL을 찾을 수 없습니다' });
    }

    return res.json({ success: true, data: updatedUrl });
  } catch (error) {
    logger.error('PUT /api/urls/:id 오류', { error });

    if (error instanceof Error && error.message.includes('URL')) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(500).json({ success: false, error: 'URL 수정 실패' });
  }
});

/**
 * DELETE /api/urls/:id - URL 삭제
 */
router.delete('/:id', requireApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await urlService.delete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'URL을 찾을 수 없습니다' });
    }

    return res.json({ success: true, message: 'URL이 삭제되었습니다' });
  } catch (error) {
    logger.error('DELETE /api/urls/:id 오류', { error });
    return res.status(500).json({ success: false, error: 'URL 삭제 실패' });
  }
});

export default router;
