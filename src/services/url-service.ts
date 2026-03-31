import { UrlConfig, CreateUrlDto, UpdateUrlDto } from '../models/url-config';
import { jsonRepository } from '../repositories/json-repository';
import logger from '../utils/logger';

/**
 * URL 관리 서비스
 */
export class UrlService {
  /**
   * 전체 URL 목록 조회
   */
  async findAll(): Promise<UrlConfig[]> {
    try {
      return await jsonRepository.findAllUrls();
    } catch (error) {
      logger.error('URL 목록 조회 실패', { error });
      throw error;
    }
  }

  /**
   * ID로 URL 조회
   */
  async findById(id: string): Promise<UrlConfig | null> {
    try {
      return await jsonRepository.findUrlById(id);
    } catch (error) {
      logger.error('URL 조회 실패', { id, error });
      throw error;
    }
  }

  /**
   * URL 생성
   */
  async create(dto: CreateUrlDto): Promise<UrlConfig> {
    try {
      // URL 유효성 검사
      new URL(dto.url);

      return await jsonRepository.createUrl(dto);
    } catch (error) {
      logger.error('URL 생성 실패', { dto, error });
      throw new Error('잘못된 URL 형식입니다');
    }
  }

  /**
   * URL 수정
   */
  async update(id: string, dto: UpdateUrlDto): Promise<UrlConfig | null> {
    try {
      // URL이 포함된 경우 유효성 검사
      if (dto.url) {
        new URL(dto.url);
      }

      return await jsonRepository.updateUrl(id, dto);
    } catch (error) {
      logger.error('URL 수정 실패', { id, dto, error });
      throw new Error('잘못된 URL 형식입니다');
    }
  }

  /**
   * URL 삭제
   */
  async delete(id: string): Promise<boolean> {
    try {
      return await jsonRepository.deleteUrl(id);
    } catch (error) {
      logger.error('URL 삭제 실패', { id, error });
      throw error;
    }
  }
}

export const urlService = new UrlService();
