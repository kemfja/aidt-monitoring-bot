import * as cheerio from 'cheerio';
import { CssSelectorCheck } from '../models/url-config';

/**
 * HTML 파싱 및 CSS 선택자 체크 결과
 */
export interface SelectorCheckResult {
  isValid: boolean;
  errorMessage?: string;
  selector: string;
  actualValue?: string;
}

/**
 * HTML 파서 유틸
 */
export class HtmlParser {
  /**
   * CSS 선택자 체크 실행
   */
  checkSelectors(html: string, checks: CssSelectorCheck[]): SelectorCheckResult[] {
    const $ = cheerio.load(html);
    const results: SelectorCheckResult[] = [];

    for (const check of checks) {
      const result = this.checkSelector($, check);
      results.push(result);
    }

    return results;
  }

  /**
   * 단일 CSS 선택자 체크 (모든 요소 확인)
   */
  private checkSelector($: any, check: CssSelectorCheck): SelectorCheckResult {
    const $elements = $(check.selector);

    // 요소를 찾지 못한 경우
    if ($elements.length === 0) {
      return {
        isValid: false,
        errorMessage: `요소를 찾을 수 없음: ${check.selector}`,
        selector: check.selector,
      };
    }

    const result: SelectorCheckResult = {
      selector: check.selector,
      isValid: true,
    };

    // 모든 요소를 순회하며 텍스트 수집
    const elements: string[] = [];
    $elements.each((_i: number, elem: any) => {
      const text = $(elem).text().trim();
      if (text) {
        elements.push(text);
      }
    });

    // 체크 타입에 따른 검증
    switch (check.checkType) {
      case 'equals':
        const expectedEqValue = check.expectedValues?.[0] || check.expectedValue;
        if (elements.length === 0 || elements[0] !== expectedEqValue) {
          result.isValid = false;
          result.errorMessage = check.errorMessage || `'${elements[0] || 'N/A'}' != '${expectedEqValue}'`;
        }
        result.actualValue = elements[0];
        break;

      case 'notEquals':
        // 첫 번째 요소가 expectedValue와 다르면 에러
        if (elements.length > 0) {
          const firstValue = elements[0];
          const expected = check.expectedValues?.[0] || check.expectedValue;
          if (firstValue !== expected) {
            result.isValid = false;
            result.errorMessage = check.errorMessage || `값 '${firstValue}'는 '${expected}'와(과) 같지 않음`;
          }
        }
        result.actualValue = elements[0];
        break;

      case 'contains':
        const expectedContainsValue = check.expectedValues?.[0] || check.expectedValue;
        if (elements.length === 0 || (expectedContainsValue && !elements[0].includes(expectedContainsValue))) {
          result.isValid = false;
          result.errorMessage = check.errorMessage || `'${elements[0] || 'N/A'}'에 '${expectedContainsValue}'가 포함되지 않음`;
        }
        result.actualValue = elements[0];
        break;

      case 'notContains':
        const expectedNotContainsValue = check.expectedValues?.[0] || check.expectedValue;
        if (elements.some(e => expectedNotContainsValue && e.includes(expectedNotContainsValue))) {
          result.isValid = false;
          result.errorMessage = check.errorMessage || `텍스트에 '${expectedNotContainsValue}'가 포함됨`;
        }
        result.actualValue = elements.join(', ');
        break;

      case 'greaterThan':
        if (elements.length > 0 && check.expectedNumber !== undefined) {
          const numValue = this.parseNumber(elements[0]);
          if (numValue === null || numValue <= check.expectedNumber) {
            result.isValid = false;
            result.errorMessage = check.errorMessage || `${numValue} <= ${check.expectedNumber}`;
          }
        }
        result.actualValue = elements[0];
        break;

      case 'lessThan':
        if (elements.length > 0 && check.expectedNumber !== undefined) {
          const numValue = this.parseNumber(elements[0]);
          if (numValue === null || numValue >= check.expectedNumber) {
            result.isValid = false;
            result.errorMessage = check.errorMessage || `${numValue} >= ${check.expectedNumber}`;
          }
        }
        result.actualValue = elements[0];
        break;

      case 'anyOf':
        // 요소 중 하나라도 목록에 있으면 통과
        if (check.expectedValues && check.expectedValues.length > 0) {
          if (!elements.some(e => check.expectedValues!.includes(e))) {
            result.isValid = false;
            result.errorMessage = check.errorMessage || `일치하는 값 없음: ${elements.join(', ')}`;
          }
        }
        result.actualValue = elements.join(', ');
        break;

      case 'noneOf':
        // 요소 중 하나라도 목록에 있으면 에러
        if (check.expectedValues && check.expectedValues.length > 0) {
          const found = elements.filter(e => check.expectedValues!.includes(e));
          if (found.length > 0) {
            result.isValid = false;
            result.errorMessage = check.errorMessage || `허용되지 않은 값 발견: ${found.join(', ')}`;
          }
        }
        result.actualValue = elements.join(', ');
        break;
    }

    return result;
  }

  /**
   * 문자열을 숫자로 파싱
   */
  private parseNumber(value: string): number | null {
    // 쉼표 제거 후 파싱
    const cleaned = value.replace(/,/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
}

export const htmlParser = new HtmlParser();
