import axios from 'axios';
import { UrlConfig } from '../models/url-config';
import { GrafanaCheckDetail, GrafanaDataPoint, LokiStringDataPoint } from '../models/monitor-result';
import logger from './logger';

/**
 * frame에서 서비스명 추출 (schema.name 우선, executedQueryString 대체)
 */
function extractServiceName(frame: any, panelId: number): string {
  // 1) schema.name에서 추출
  if (frame.schema?.name) {
    return frame.schema.name;
  }

  // 2) frame.schema.fields[].config.custom.executedQueryString에서 추출
  const fields = frame.schema?.fields;
  if (Array.isArray(fields)) {
    for (const field of fields) {
      const eqs = field?.config?.custom?.executedQueryString;
      if (typeof eqs === 'string' && eqs.length > 0) {
        return eqs;
      }
    }
  }

  return `panel-${panelId}`;
}

/**
 * 서비스가 지정된 시간대 내에 있는지 확인
 */
function isWithinTimeRange(serviceName: string, dataPointHour: number, dataPointMinute: number, serviceTimeRanges?: { services: string[]; startHour: number; startBufferMinutes?: number; endHour: number }[]): boolean {
  if (!serviceTimeRanges || serviceTimeRanges.length === 0) {
    return true; // 시간대 제한 없음
  }

  const matchedRange = serviceTimeRanges.find(r => r.services.includes(serviceName));
  if (!matchedRange) {
    return true; // 해당 서비스에 대한 시간대 제한 없음
  }

  // startBufferMinutes 처리 (예: startHour=8, startBufferMinutes=20 → 8:20 이후)
  const buffer = matchedRange.startBufferMinutes ?? 0;
  const isAfterStart = dataPointHour > matchedRange.startHour ||
    (dataPointHour === matchedRange.startHour && dataPointMinute >= buffer);

  return isAfterStart && dataPointHour < matchedRange.endHour;
}

/**
 * Grafana 공용 대시보드 API 체커
 */
export async function checkGrafanaApi(config: UrlConfig, isStartup = true): Promise<{
  isValid: boolean;
  errorMessage?: string;
  responseTime: number;
  grafanaCheckDetail: GrafanaCheckDetail;
  detectedStatus?: 'success' | 'error' | 'warning';
}> {
  const startTime = Date.now();
  const grafanaConfig = config.errorConditions?.grafanaApiCheck!;
  const { dashboardUid, hostUrl, panelIds, threshold, thresholdOperator, timeRangeHours, scheduledTimeRangeHours, intervalMs, maxDataPoints, targetServices, serviceTimeRanges, checkMode } = grafanaConfig;
  const isThresholdExceeded = thresholdOperator === 'eq'
    ? (val: number) => val === threshold
    : (val: number) => val >= threshold;

  // 시작 시에는 전체 범위, 정시 체크 시에는 scheduledTimeRangeHours 사용
  const effectiveTimeRange = (!isStartup && scheduledTimeRangeHours != null)
    ? scheduledTimeRangeHours
    : timeRangeHours;

  const to = Date.now();
  const from = to - effectiveTimeRange * 3600000;

  const allDataPoints: GrafanaDataPoint[] = [];
  const allErrorDataPoints: GrafanaDataPoint[] = [];
  const allStringDataPoints: LokiStringDataPoint[] = [];
  const allErrorStringDataPoints: LokiStringDataPoint[] = [];

  const isStringMode = checkMode === 'stringPresence';

  logger.info(`Grafana 공용 API 체크 시작: ${config.name}`, { dashboardUid, panelIds, threshold, timeRangeHours: effectiveTimeRange, isStartup, checkMode: checkMode || 'threshold' });

  // 각 패널 순차 조회
  for (const panelId of panelIds) {
    const apiUrl = `${hostUrl}/api/public/dashboards/${dashboardUid}/panels/${panelId}/query`;

    const requestBody = {
      intervalMs,
      maxDataPoints,
      timeRange: {
        from: String(from),
        to: String(to),
        timezone: 'browser'
      }
    };

    try {
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      if (response.status !== 200) {
        logger.warn(`Grafana 패널 ${panelId} 응답 오류: HTTP ${response.status}`);
        continue;
      }

      // 응답 파싱
      const results = response.data?.results || {};

      for (const refId of Object.keys(results)) {
        const refResult = results[refId];
        if (!refResult?.frames) continue;

        for (const frame of refResult.frames) {
          const values = frame.data?.values;
          if (!values || values.length < 2) continue;

          if (isStringMode) {
            // 문자열 존재 체크 모드: Time/Line 필드 인덱스 동적 탐색
            const fields = frame.schema?.fields || [];
            let timeIdx = -1;
            let lineIdx = -1;
            let labelIdx = -1;

            for (let fi = 0; fi < fields.length; fi++) {
              const name = fields[fi]?.name;
              if (name === 'Time') timeIdx = fi;
              else if (name === 'Line') lineIdx = fi;
              else if (name === 'labels') labelIdx = fi;
            }

            if (timeIdx < 0 || lineIdx < 0) {
              logger.info(`Grafana 패널 ${panelId}: Time/Line 필드 없음, 스킵`);
              continue;
            }

            const timeArray = values[timeIdx] as number[];
            const lineArray = values[lineIdx] as string[];
            const labelArray = labelIdx >= 0 ? values[labelIdx] as Record<string, string>[] : null;

            for (let i = 0; i < lineArray.length; i++) {
              const line = lineArray[i];
              if (!line || typeof line !== 'string') continue;
              if (timeArray[i] < from) continue;

              const dataPointTime = new Date(timeArray[i]);
              const point: LokiStringDataPoint = {
                time: dataPointTime.toISOString(),
                line,
                labels: labelArray ? labelArray[i] : undefined
              };

              allStringDataPoints.push(point);

              // [error] 또는 [warning] 포함 시 에러/경고 데이터로 수집
              if (line.includes('[error]') || line.includes('[warning]')) {
                allErrorStringDataPoints.push(point);
              }
            }
          } else {
            // 기존 임계값 체크 모드
            const serviceName = extractServiceName(frame, panelId);

            const timeArray = values[0] as number[];
            const valueArray = values[1] as (number | null)[];

            for (let i = 0; i < valueArray.length; i++) {
              const val = valueArray[i];
              if (val === null || val === undefined) continue;

              // 요청 시간 범위 밖의 데이터 제외 (Grafana가 범위를 무시하고 전체 반환하는 경우 대응)
              if (timeArray[i] < from) continue;

              // targetServices에 지정된 서비스명과 정확히 일치하는 데이터만 수집
              const isTarget = !targetServices || targetServices.length === 0 ||
                targetServices.some(t => serviceName === t);
              if (!isTarget) continue;

              const dataPointTime = new Date(timeArray[i]);
              const timeStr = dataPointTime.toISOString();
              const point: GrafanaDataPoint = { service: serviceName, time: timeStr, value: val };

              allDataPoints.push(point);

              // 임계값 조건 + 시간대 조건 충족 시 에러
              if (isThresholdExceeded(val) && isWithinTimeRange(serviceName, dataPointTime.getHours(), dataPointTime.getMinutes(), serviceTimeRanges)) {
                allErrorDataPoints.push(point);
              }
            }
          }
        }
      }

      logger.info(`Grafana 패널 ${panelId} 조회 완료`);
    } catch (error: any) {
      logger.warn(`Grafana 패널 ${panelId} 조회 실패: ${error?.message}`);
    }
  }

  const responseTime = Date.now() - startTime;

  // 문자열 모드 결과 처리
  let isValid: boolean;
  let errorMessage: string | undefined;
  let detectedStatus: 'success' | 'error' | 'warning' | undefined;

  if (isStringMode) {
    // [error] / [warning] 포함 여부로 상태 판단
    const hasError = allErrorStringDataPoints.some(p => p.line.includes('[error]'));
    const hasWarning = allErrorStringDataPoints.some(p => p.line.includes('[warning]'));

    if (hasError) {
      isValid = false;
      detectedStatus = 'error';
      errorMessage = `에러 로그 ${allErrorStringDataPoints.filter(p => p.line.includes('[error]')).length}건 감지`;
    } else if (hasWarning) {
      isValid = false;
      detectedStatus = 'warning';
      errorMessage = `경고 로그 ${allErrorStringDataPoints.filter(p => p.line.includes('[warning]')).length}건 감지`;
    } else {
      isValid = true;
      detectedStatus = 'success';
    }

    logger.info(`Grafana 공용 API 체크 완료: ${config.name}`, {
      isValid,
      detectedStatus,
      stringDataPoints: allStringDataPoints.length,
      errorStringDataPoints: allErrorStringDataPoints.length,
      responseTime: `${responseTime}ms`
    });
  } else {
    // 기존 임계값 모드
    isValid = allErrorDataPoints.length === 0;

    if (!isValid) {
      const serviceCounts = new Map<string, number>();
      for (const p of allErrorDataPoints) {
        serviceCounts.set(p.service, (serviceCounts.get(p.service) || 0) + 1);
      }
      const summary = Array.from(serviceCounts.entries())
        .map(([service, count]) => `${service}(${count})`)
        .join(', ');
      errorMessage = `에러 발생 ${allErrorDataPoints.length}건: ${summary}`;
    }

    logger.info(`Grafana 공용 API 체크 완료: ${config.name}`, {
      isValid,
      dataPoints: allDataPoints.length,
      errorDataPoints: allErrorDataPoints.length,
      responseTime: `${responseTime}ms`
    });
  }

  return {
    isValid,
    errorMessage,
    responseTime,
    detectedStatus: isStringMode ? detectedStatus : undefined,
    grafanaCheckDetail: {
      type: 'grafana',
      apiUrl: `${hostUrl}/api/public/dashboards/${dashboardUid}`,
      threshold,
      thresholdOperator: thresholdOperator || 'gte',
      targetServices: targetServices || [],
      dataPoints: allDataPoints,
      errorDataPoints: allErrorDataPoints,
      checkMode: checkMode || 'threshold',
      stringDataPoints: allStringDataPoints,
      errorStringDataPoints: allErrorStringDataPoints
    }
  };
}
