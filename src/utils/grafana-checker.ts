import axios from 'axios';
import { UrlConfig } from '../models/url-config';
import { GrafanaCheckDetail, GrafanaDataPoint } from '../models/monitor-result';
import logger from './logger';

/**
 * Grafana 공용 대시보드 API 체커
 */
export async function checkGrafanaApi(config: UrlConfig): Promise<{
  isValid: boolean;
  errorMessage?: string;
  responseTime: number;
  grafanaCheckDetail: GrafanaCheckDetail;
}> {
  const startTime = Date.now();
  const grafanaConfig = config.errorConditions?.grafanaApiCheck!;
  const { dashboardUid, hostUrl, panelIds, threshold, timeRangeHours, intervalMs, maxDataPoints, targetServices } = grafanaConfig;

  const to = Date.now();
  const from = to - timeRangeHours * 3600000;

  const allDataPoints: GrafanaDataPoint[] = [];
  const allErrorDataPoints: GrafanaDataPoint[] = [];

  logger.info(`Grafana 공용 API 체크 시작: ${config.name}`, { dashboardUid, panelIds, threshold });

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
          const serviceName = frame.schema?.name || `panel-${panelId}`;
          const values = frame.data?.values;
          if (!values || values.length < 2) continue;

          const timeArray = values[0] as number[];
          const valueArray = values[1] as (number | null)[];

          for (let i = 0; i < valueArray.length; i++) {
            const val = valueArray[i];
            if (val === null || val === undefined) continue;

            // targetServices에 지정된 서비스명과 정확히 일치하는 데이터만 수집
            const isTarget = !targetServices || targetServices.length === 0 ||
              targetServices.some(t => serviceName === t);
            if (!isTarget) continue;

            const timeStr = new Date(timeArray[i]).toISOString();
            const point: GrafanaDataPoint = { service: serviceName, time: timeStr, value: val };

            allDataPoints.push(point);
            if (val >= threshold) {
              allErrorDataPoints.push(point);
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
  const isValid = allErrorDataPoints.length === 0;

  let errorMessage: string | undefined;
  if (!isValid) {
    const summary = allErrorDataPoints.slice(0, 5).map(p =>
      `${p.service} @ ${new Date(p.time).toLocaleString('ko-KR')} = ${p.value}`
    ).join(', ');
    errorMessage = `수치 임계값(${threshold}) 초과 ${allErrorDataPoints.length}건: ${summary}`;
  }

  logger.info(`Grafana 공용 API 체크 완료: ${config.name}`, {
    isValid,
    dataPoints: allDataPoints.length,
    errorDataPoints: allErrorDataPoints.length,
    responseTime: `${responseTime}ms`
  });

  return {
    isValid,
    errorMessage,
    responseTime,
    grafanaCheckDetail: {
      type: 'grafana',
      apiUrl: `${hostUrl}/api/public/dashboards/${dashboardUid}`,
      threshold,
      targetServices: targetServices || [],
      dataPoints: allDataPoints,
      errorDataPoints: allErrorDataPoints
    }
  };
}
