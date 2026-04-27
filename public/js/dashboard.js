// API 기본 URL
const API_BASE = '/api';

// API Key (수동 검사, 테스트 알림 등 관리 기능에 필요)
const API_KEY = 'subak-monitoring-2024';

/**
 * API 요청 헬퍼 (API Key 포함)
 */
async function apiRequest(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    ...(options.headers || {})
  };

  return fetch(url, {
    ...options,
    headers
  });
}

// 상태 관리
let currentUrls = [];
let currentHistory = [];
let historyPage = 1;
let historyPageSize = 12;
let totalHistoryPages = 1;
let currentHistoryUrlId = '';
let statusFilter = { all: true, success: true, error: true, warning: true };

// DOM 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

/**
 * 앱 초기화
 */
function initializeApp() {
  // 이벤트 리스너 등록
  document.getElementById('runAllBtn').addEventListener('click', runManualCheck);
  document.getElementById('testNotificationBtn').addEventListener('click', sendTestNotification);
  document.getElementById('schedulerToggle').addEventListener('change', toggleScheduler);
  document.getElementById('closeUrlDetailBtn').addEventListener('click', closeUrlDetailModal);
  document.getElementById('closeResultDetailBtn').addEventListener('click', closeResultDetailModal);
  document.getElementById('resultDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'resultDetailModal') {
      closeResultDetailModal();
    }
  });
  document.getElementById('historyUrlFilter').addEventListener('change', (e) => {
    historyPage = 1;
    currentHistoryUrlId = e.target.value;
    loadHistory(e.target.value);
  });

  // 상태 필터 체크박스 이벤트
  document.getElementById('filterAll').addEventListener('change', (e) => {
    if (e.target.checked) {
      // 전체 체크 = 정상+에러+경고 모두 체크
      statusFilter.success = true;
      statusFilter.error = true;
      statusFilter.warning = true;
      document.getElementById('filterSuccess').checked = true;
      document.getElementById('filterError').checked = true;
      document.getElementById('filterWarning').checked = true;
    } else {
      // 전체 해제
      statusFilter.success = false;
      statusFilter.error = false;
      statusFilter.warning = false;
      document.getElementById('filterSuccess').checked = false;
      document.getElementById('filterError').checked = false;
      document.getElementById('filterWarning').checked = false;
    }
    historyPage = 1;
    renderHistoryTable(currentHistory);
    renderPagination();
  });

  document.getElementById('filterSuccess').addEventListener('change', (e) => {
    statusFilter.success = e.target.checked;
    const allChecked = statusFilter.success && statusFilter.error && statusFilter.warning;
    document.getElementById('filterAll').checked = allChecked;
    historyPage = 1;
    renderHistoryTable(currentHistory);
    renderPagination();
  });

  document.getElementById('filterError').addEventListener('change', (e) => {
    statusFilter.error = e.target.checked;
    const allChecked = statusFilter.success && statusFilter.error && statusFilter.warning;
    document.getElementById('filterAll').checked = allChecked;
    historyPage = 1;
    renderHistoryTable(currentHistory);
    renderPagination();
  });

  document.getElementById('filterWarning').addEventListener('change', (e) => {
    statusFilter.warning = e.target.checked;
    const allChecked = statusFilter.success && statusFilter.error && statusFilter.warning;
    document.getElementById('filterAll').checked = allChecked;
    historyPage = 1;
    renderHistoryTable(currentHistory);
    renderPagination();
  });

  // URL 테이블 행 클릭 이벤트 (위임)
  document.getElementById('urlTableBody').addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (row && row.dataset.urlId) {
      showUrlDetail(row.dataset.urlId);
    }
  });

  // 히스토리 테이블 행 클릭 이벤트 (결과 상세 팝업)
  document.getElementById('historyTableBody').addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (row && row.dataset.resultId) {
      const result = currentHistory.find(r => r.id === row.dataset.resultId);
      if (result) {
        showResultDetail(result);
      }
    }
  });

  // 초기 데이터 로드
  refreshAll();

  // 자동 새로고침 (30초마다)
  setInterval(() => {
    refreshStatus();
    loadHistory(currentHistoryUrlId);
    loadNotificationHistory();
  }, 30000);

  // 초기 업데이트 시간 표시
  updateLastUpdateTime();

  // 알림 히스토리 로드
  loadNotificationHistory();

  // 스케줄러 상태 로드
  loadSchedulerStatus();
}

/**
 * 전체 데이터 새로고침
 */
async function refreshAll() {
  await Promise.all([loadUrls(), loadHistory(), updateLastUpdateTime()]);
}

/**
 * 상태만 새로고침
 */
async function refreshStatus() {
  await Promise.all([loadUrls(), updateLastUpdateTime(), loadSchedulerStatus()]);
}

/**
 * URL 목록 로드
 */
async function loadUrls() {
  try {
    const response = await apiRequest(`${API_BASE}/urls`);
    const result = await response.json();

    if (result.success) {
      currentUrls = result.data;
      renderUrlTable(result.data);
      updateHistoryUrlFilter(result.data);
    }
  } catch (error) {
    console.error('URL 목록 로드 실패:', error);
  }
}

/**
 * URL 필터 업데이트
 */
function updateHistoryUrlFilter(urls) {
  const select = document.getElementById('historyUrlFilter');
  const currentValue = select.value;

  select.innerHTML = '<option value="">전체 URL</option>' +
    urls.map(url => `<option value="${url.id}">${escapeHtml(url.name)}</option>`).join('');

  if (currentValue) {
    select.value = currentValue;
  }
}

/**
 * URL 테이블 렌더링
 */
function renderUrlTable(urls) {
  const tbody = document.getElementById('urlTableBody');

  if (urls.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading">등록된 URL이 없습니다</td></tr>';
    return;
  }

  tbody.innerHTML = urls.map(url => {
    const statusClass = url.enabled ? 'status-enabled' : 'status-disabled';
    const statusText = url.enabled ? '활성' : '비활성';
    const conditionSummary = getConditionSummary(url.errorConditions);

    return `
      <tr class="clickable" data-url-id="${url.id}">
        <td>${escapeHtml(url.name)}</td>
        <td><code>${escapeHtml(truncateUrl(url.url, 40))}</code></td>
        <td>${conditionSummary}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
}

/**
 * 에러 조건 요약
 */
function getConditionSummary(conditions) {
  if (!conditions) return '-';

  const parts = [];

  if (conditions.grafanaApiCheck) {
    parts.push('Grafana API');
  }
  if (conditions.expectedStatusCodes) {
    parts.push(`상태: ${conditions.expectedStatusCodes.join(', ')}`);
  }
  if (conditions.maxResponseTime) {
    parts.push(`시간: ${conditions.maxResponseTime}ms`);
  }
  if (conditions.errorKeywords) {
    parts.push(`키워드: ${conditions.errorKeywords.length}개`);
  }
  if (conditions.cssSelectorChecks && conditions.cssSelectorChecks.length > 0) {
    parts.push(`CSS: ${conditions.cssSelectorChecks.length}개`);
  }

  return parts.length > 0 ? parts.slice(0, 2).join(' + ') + (parts.length > 2 ? '...' : '') : '-';
}

/**
 * 히스토리 로드
 */
async function loadHistory(urlId = '') {
  try {
    let results = [];
    let totalCount = 0;

    if (urlId) {
      // 특정 URL의 기록
      const response = await apiRequest(`${API_BASE}/monitoring/url/${urlId}/history?limit=999`);
      const result = await response.json();
      if (result.success) {
        results = result.data;
        totalCount = results.length;
      }
    } else {
      // 전체 URL의 최근 기록
      const response = await apiRequest(`${API_BASE}/monitoring/results?limit=999`);
      const result = await response.json();
      if (result.success) {
        results = result.data;
        totalCount = results.length;
      }
    }

    currentHistory = results;
    totalHistoryPages = Math.ceil(totalCount / historyPageSize);
    renderHistoryTable(results);
    renderPagination();
  } catch (error) {
    console.error('히스토리 로드 실패:', error);
  }
}

/**
 * 히스토리 테이블 렌더링 (12개 행)
 */
function renderHistoryTable(results) {
  const tbody = document.getElementById('historyTableBody');

  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading">기록이 없습니다</td></tr>';
    return;
  }

  // 상태 필터링
  let filteredResults = results;
  const allChecked = statusFilter.success && statusFilter.error && statusFilter.warning;
  if (allChecked) {
    filteredResults = results;
  } else {
    filteredResults = results.filter(r => {
      if (statusFilter.success && r.status === 'success') return true;
      if (statusFilter.error && r.status === 'error') return true;
      if (statusFilter.warning && r.status === 'warning') return true;
      return false;
    });
  }

  // 필터링 후 페이지네이션 계산
  totalHistoryPages = Math.ceil(filteredResults.length / historyPageSize);
  const startIndex = (historyPage - 1) * historyPageSize;
  const endIndex = startIndex + historyPageSize;
  const pageResults = filteredResults.slice(startIndex, endIndex);

  if (pageResults.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading">해당 조건의 기록이 없습니다</td></tr>';
    renderPagination();
    return;
  }

  tbody.innerHTML = pageResults.map(r => {
    const urlName = r.urlName || '알 수 없음';
    const statusClass = r.status === 'success' ? 'success' : r.status === 'warning' ? 'warning' : 'error';
    const statusText = r.status === 'success' ? '정상' : r.status === 'warning' ? '경고' : '에러';

    return `
      <tr class="${r.status} clickable" data-url-id="${r.urlId}" data-result-id="${r.id}">
        <td>${escapeHtml(urlName)}</td>
        <td>${r.responseTime}ms</td>
        <td>${formatDateTime(r.timestamp)}</td>
        <td><span class="status-${statusClass}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
}

/**
 * 페이지네이션 렌더링
 */
function renderPagination() {
  const pagination = document.getElementById('pagination');

  if (totalHistoryPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  pagination.innerHTML = `
    <button ${historyPage === 1 ? 'disabled' : ''} onclick="changePage(${historyPage - 1})">이전</button>
    <span class="page-info">${historyPage} / ${totalHistoryPages}</span>
    <button ${historyPage === totalHistoryPages ? 'disabled' : ''} onclick="changePage(${historyPage + 1})">다음</button>
  `;
}

/**
 * 페이지 변경
 */
function changePage(page) {
  if (page < 1 || page > totalHistoryPages) return;
  historyPage = page;
  renderHistoryTable(currentHistory);
  renderPagination();
}

/**
 * 수동 검사 실행
 */
async function runManualCheck() {
  const btn = document.getElementById('runAllBtn');
  const status = document.getElementById('checkStatus');
  const results = document.getElementById('checkResults');

  btn.disabled = true;
  status.textContent = '실행 중...';
  status.className = 'status-tag running';
  results.innerHTML = '';

  try {
    const response = await apiRequest(`${API_BASE}/monitoring/run`, { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      status.textContent = '완료';
      status.className = 'status-tag success';

      // 잠시 대기 후 결과 표시
      setTimeout(async () => {
        await showCheckResults();
        // 히스토리도 새로고침
        await loadHistory(currentHistoryUrlId);
        // 업데이트 시간 갱신
        await updateLastUpdateTime();
      }, 2000);
    } else {
      status.textContent = '실패';
      status.className = 'status-tag error';
    }
  } catch (error) {
    status.textContent = '에러';
    status.className = 'status-tag error';
    console.error('수동 검사 실패:', error);
  } finally {
    btn.disabled = false;
  }
}

/**
 * 검사 결과 표시
 */
async function showCheckResults() {
  const results = document.getElementById('checkResults');

  try {
    // 각 URL의 최근 결과 가져오기
    const urlPromises = currentUrls.map(async (url) => {
      if (!url.enabled) return null;

      const response = await apiRequest(`${API_BASE}/monitoring/url/${url.id}/history?limit=1`);
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        return {
          url,
          result: result.data[0]
        };
      }
      return null;
    });

    const urlResults = await Promise.all(urlPromises);

    results.innerHTML = urlResults
      .filter(r => r !== null)
      .map(item => {
        const isError = item.result.status === 'error';
        const isWarning = item.result.status === 'warning';
        const statusClass = isError ? 'error' : isWarning ? 'warning' : '';
        const statusText = isError ? '에러' : isWarning ? '경고' : '정상';
        return `
          <div class="check-result-item ${statusClass}">
            <div class="check-result-header">
              <span class="check-result-name">${escapeHtml(item.url.name)}</span>
              <span class="check-result-status ${item.result.status}">
                ${statusText}
              </span>
            </div>
            <div class="check-result-details">
              상태코드: ${item.result.statusCode || '-'} |
              응답시간: ${item.result.responseTime}ms
              ${item.result.errorMessage ? ` | ${escapeHtml(item.result.errorMessage)}` : ''}
            </div>
          </div>
        `;
      })
      .join('');
  } catch (error) {
    console.error('결과 표시 실패:', error);
  }
}

/**
 * URL 상세 모달 표시
 */
function showUrlDetail(urlId) {
  const url = currentUrls.find(u => u.id === urlId);
  if (!url) return;

  document.getElementById('urlDetailTitle').textContent = url.name;

  const content = document.getElementById('urlDetailContent');
  content.innerHTML = `
    <div class="detail-section">
      <h3>기본 정보</h3>
      <div class="detail-row">
        <span class="detail-label">이름</span>
        <span class="detail-value">${escapeHtml(url.name)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">URL</span>
        <span class="detail-value"><a href="${escapeHtml(url.url)}" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(url.url)}</code></a></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">메서드</span>
        <span class="detail-value">${url.method}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">활성화</span>
        <span class="detail-value">${url.enabled ? '예' : '아니오'}</span>
      </div>
    </div>

    <div class="detail-section">
      <h3>에러 조건</h3>
      ${renderErrorConditions(url.errorConditions)}
    </div>
  `;

  document.getElementById('urlDetailModal').classList.add('active');
}

/**
 * 에러 조건 렌더링
 */
function renderErrorConditions(conditions) {
  if (!conditions) return '<p>설정된 에러 조건이 없습니다.</p>';

  let html = '';

  // 상태 코드 검사
  if (conditions.expectedStatusCodes) {
    html += `
      <div class="condition-item">
        <div class="condition-type">상태 코드 검사</div>
        <div class="condition-detail-row">
          <span class="condition-label">조건:</span>
          <span class="condition-value">HTTP 상태 코드가 다음 중 하나여야 함</span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">예상 값:</span>
          <span class="condition-value">${conditions.expectedStatusCodes.join(', ')}</span>
        </div>
      </div>
    `;
  }

  // 응답 시간 검사
  if (conditions.maxResponseTime) {
    html += `
      <div class="condition-item">
        <div class="condition-type">응답 시간 검사</div>
        <div class="condition-detail-row">
          <span class="condition-label">조건:</span>
          <span class="condition-value">응답 시간이 다음을 초과하면 에러</span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">임계값:</span>
          <span class="condition-value">${conditions.maxResponseTime}ms</span>
        </div>
      </div>
    `;
  }

  // 에러 키워드 검사
  if (conditions.errorKeywords && conditions.errorKeywords.length > 0) {
    html += `
      <div class="condition-item">
        <div class="condition-type">에러 키워드 검사 (HTML 본문)</div>
        <div class="condition-detail-row">
          <span class="condition-label">조건:</span>
          <span class="condition-value">HTML 본문에 다음 키워드가 포함되면 에러</span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">키워드:</span>
          <span class="condition-value">${conditions.errorKeywords.map(k => `<code>${escapeHtml(k)}</code>`).join(', ')}</span>
        </div>
      </div>
    `;
  }

  // CSS 선택자 검사 (테이블 형식)
  if (conditions.cssSelectorChecks && conditions.cssSelectorChecks.length > 0) {
    html += `<div class="condition-item"><div class="condition-type">CSS 선택자 검사</div>`;
    html += `<table class="condition-table">`;
    html += `<thead><tr><th>선택자</th><th>조건</th><th>값</th></tr></thead>`;
    html += `<tbody>`;

    conditions.cssSelectorChecks.forEach(check => {
      const valueLabel = getValueLabel(check);
      html += `<tr>`;
      html += `<td><code>${escapeHtml(check.selector)}</code></td>`;
      html += `<td>${check.checkType}</td>`;
      html += `<td>${valueLabel || '-'}</td>`;
      html += `</tr>`;
      if (check.errorMessage) {
        html += `<tr><td colspan="3" class="error-msg-row">에러 메시지: ${escapeHtml(check.errorMessage)}</td></tr>`;
      }
    });

    html += `</tbody></table></div>`;
  }

  // Grafana API 체크
  if (conditions.grafanaApiCheck) {
    const g = conditions.grafanaApiCheck;
    const opText = g.thresholdOperator === 'eq' ? '일치' : '이상';
    const isStringMode = g.checkMode === 'stringPresence';
    html += `
      <div class="condition-item">
        <div class="condition-type">${isStringMode ? 'Loki 로그 체크' : 'Grafana API 체크'}</div>
        <div class="condition-detail-row">
          <span class="condition-label">대시보드 UID:</span>
          <span class="condition-value"><code>${escapeHtml(g.dashboardUid || '-')}</code></span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">호스트:</span>
          <span class="condition-value"><code>${escapeHtml(g.hostUrl || '-')}</code></span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">패널 ID:</span>
          <span class="condition-value">${g.panelIds ? g.panelIds.join(', ') : '-'}</span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">체크 모드:</span>
          <span class="condition-value">${isStringMode ? '문자열 존재 확인' : '임계값 비교'}</span>
        </div>
        ${isStringMode ? `
        <div class="condition-detail-row">
          <span class="condition-label">에러 조건:</span>
          <span class="condition-value" style="color: #dc3545;">문자열에 <code>[error]</code> 포함 시 에러</span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">경고 조건:</span>
          <span class="condition-value" style="color: #e67e22;">문자열에 <code>[warning]</code> 포함 시 경고</span>
        </div>
        ` : `
        <div class="condition-detail-row">
          <span class="condition-label">임계값:</span>
          <span class="condition-value">${g.threshold !== undefined ? g.threshold : '-'} ${opText} 시 에러</span>
        </div>
        `}
        <div class="condition-detail-row">
          <span class="condition-label">시간 범위:</span>
          <span class="condition-value">초기 가동/재부팅 시 ${g.timeRangeHours ? g.timeRangeHours + '시간' : '-'}${g.scheduledTimeRangeHours ? ', 정각 체크 시 ' + g.scheduledTimeRangeHours + '시간' : ''}</span>
        </div>
        ${g.targetServices && g.targetServices.length > 0 ? `
        <div class="condition-detail-row">
          <span class="condition-label">대상 서비스:</span>
          <span class="condition-value">${g.targetServices.map(s => `<code>${escapeHtml(s)}</code>`).join(', ')}</span>
        </div>
        ` : ''}
        ${g.serviceTimeRanges && g.serviceTimeRanges.length > 0 ? `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ddd;">
          <div style="font-weight: 600; margin-bottom: 8px; color: #555;">에러 판단 로직</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
                <th style="padding: 6px 8px; text-align: left; font-weight: 600;">대상 서비스</th>
                <th style="padding: 6px 8px; text-align: center; font-weight: 600;">판단 시간대</th>
                <th style="padding: 6px 8px; text-align: center; font-weight: 600;">에러 조건</th>
              </tr>
            </thead>
            <tbody>
          ${g.serviceTimeRanges.map(r => {
            const startMin = r.startBufferMinutes ? String(r.startBufferMinutes).padStart(2, '0') : '00';
            return `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 6px 8px;"><code>${r.services.map(s => escapeHtml(s)).join('</code>, <code>')}</code></td>
                <td style="padding: 6px 8px; text-align: center;">${String(r.startHour).padStart(2, '0')}:${startMin} ~ ${String(r.endHour).padStart(2, '0')}:00</td>
                <td style="padding: 6px 8px; text-align: center;">값이 ${g.threshold}${opText}하면 에러</td>
              </tr>`;
          }).join('')}
          ${(() => {
            const timed = new Set(g.serviceTimeRanges.flatMap(r => r.services));
            const untimed = g.targetServices.filter(s => !timed.has(s));
            return untimed.length > 0 ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 6px 8px;"><code>${untimed.map(s => escapeHtml(s)).join('</code>, <code>')}</code></td>
                <td style="padding: 6px 8px; text-align: center;">-</td>
                <td style="padding: 6px 8px; text-align: center;">시간 제한 없이 값이 ${g.threshold}${opText}하면 에러</td>
              </tr>` : '';
          })()}
            </tbody>
          </table>
        </div>
        ` : ''}
      </div>
    `;
  }

  return html || '<p>설정된 에러 조건이 없습니다.</p>';
}

/**
 * 값 라벨 생성
 */
function getValueLabel(check) {
  if (check.expectedValue !== undefined) {
    return `<code>${escapeHtml(check.expectedValue)}</code>`;
  }
  if (check.expectedValues && check.expectedValues.length > 0) {
    return check.expectedValues.map(v => `<code>${escapeHtml(v)}</code>`).join(', ');
  }
  return '';
}

/**
 * URL 상세 모달 닫기
 */
function closeUrlDetailModal() {
  document.getElementById('urlDetailModal').classList.remove('active');
}

/**
 * 알림 히스토리 로드
 */
async function loadNotificationHistory() {
  try {
    // 히스토리는 현재 모니터링 결과를 기반으로 표시
    const response = await apiRequest(`${API_BASE}/monitoring/results?limit=50`);
    const result = await response.json();

    if (result.success) {
      // 에러 상태만 필터링
      const errorResults = result.data.filter((r) => r.status === 'error');
      renderNotificationHistory(errorResults.slice(0, 20)); // 최대 20개 표시
    }
  } catch (error) {
    console.error('알림 히스토리 로드 실패:', error);
  }
}

/**
 * 알림 히스토리 렌더링
 */
function renderNotificationHistory(results) {
  const listEl = document.getElementById('notificationHistoryList');

  if (results.length === 0) {
    listEl.innerHTML = '<p style="color: #999;">발송된 알림이 없습니다.</p>';
    return;
  }

  listEl.innerHTML = results.map(r => `
    <div class="notification-item">
      <div class="notification-header">
        <span class="notification-name">${escapeHtml(r.urlName)}</span>
        <span class="notification-time">${formatDateTime(r.timestamp)}</span>
      </div>
      <div class="notification-details">
        상태코드: ${r.statusCode ?? 'N/A'} | 응답시간: ${r.responseTime}ms
        ${r.errorMessage ? `<br>에러: ${escapeHtml(r.errorMessage)}` : ''}
      </div>
    </div>
  `).join('');
}

/**
 * URL 축약
 */
function truncateUrl(url, maxLength) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

/**
 * 날짜시간 포맷
 */
function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 최신 업데이트 시간 표시
 */
async function updateLastUpdateTime() {
  try {
    const response = await apiRequest(`${API_BASE}/monitoring/status`);
    const result = await response.json();

    if (result.success && result.data.lastChecked) {
      const lastUpdateEl = document.getElementById('lastUpdate');
      lastUpdateEl.textContent = `최신 업데이트: ${formatDateTime(result.data.lastChecked)}`;
    } else {
      const lastUpdateEl = document.getElementById('lastUpdate');
      lastUpdateEl.textContent = '아직 업데이트가 없습니다';
    }
  } catch (error) {
    console.error('업데이트 시간 로드 실패:', error);
  }
}

/**
 * 모니터링 결과 상세 모달 표시
 */
function showResultDetail(result) {
  const modal = document.getElementById('resultDetailModal');
  const title = document.getElementById('resultDetailTitle');
  const content = document.getElementById('resultDetailContent');

  title.textContent = result.urlName || '체크 결과 상세';

  const statusClass = result.status === 'success' ? 'success' : result.status === 'warning' ? 'warning' : 'error';
  const statusText = result.status === 'success' ? '정상' : result.status === 'warning' ? '경고' : '에러';

  let html = `
    <div class="detail-section">
      <h3>기본 정보</h3>
      <div class="detail-row">
        <span class="detail-label">이름</span>
        <span class="detail-value">${escapeHtml(result.urlName)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">응답 시간</span>
        <span class="detail-value">${result.responseTime}ms</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">체크 시간</span>
        <span class="detail-value">${formatDateTime(result.timestamp)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">상태</span>
        <span class="detail-value"><span class="status-badge status-${statusClass}">${statusText}</span></span>
      </div>
      ${result.errorMessage ? `
      <div class="detail-row">
        <span class="detail-label">에러 메시지</span>
        <span class="detail-value" style="color: #dc3545;">${escapeHtml(result.errorMessage)}</span>
      </div>
      ` : ''}
      ${result.checkedUrl ? `
      <div class="detail-row">
        <span class="detail-label">체크 URL</span>
        <span class="detail-value"><a href="${escapeHtml(result.checkedUrl)}" target="_blank" rel="noopener" style="color: #0d6efd; word-break: break-all;">${escapeHtml(result.checkedUrl)}</a></span>
      </div>
      ` : ''}
    </div>
  `;

  // Grafana API 체크 상세 표시
  if (result.grafanaCheckDetail) {
    html += renderGrafanaCheckDetail(result.grafanaCheckDetail);
  }

  // CSS 선택자 수집 값 표시
  if (result.selectorValues && result.selectorValues.length > 0) {
    html += renderSelectorValues(result.selectorValues);
  }

  content.innerHTML = html;
  modal.classList.add('active');
}

/**
 * CSS 선택자 수집 값 렌더링
 */
function renderSelectorValues(selectorValues) {
  let html = `
    <div class="detail-section">
      <h3>수집된 CSS 선택자 값</h3>
  `;

  selectorValues.forEach(sv => {
    if (sv.type === 'pinpoint') {
      html += `
        <div class="condition-item">
          <div class="condition-detail-row">
            <span class="condition-label">선택자:</span>
            <span class="condition-value"><code>${escapeHtml(sv.selector)}</code></span>
          </div>
          <div class="condition-detail-row">
            <span class="condition-label">값:</span>
            <span class="condition-value"><strong>${escapeHtml(sv.value || '(값 없음)')}</strong></span>
          </div>
        </div>
      `;
    } else if (sv.type === 'edutem') {
      html += `
        <div class="condition-item">
          <div class="condition-type">에듀템 데이터 블록 값 (${sv.values.length} / ${sv.totalBlocks})</div>
          <div class="condition-detail-row">
            <span class="condition-label">선택자:</span>
            <span class="condition-value"><code>${escapeHtml(sv.selector)}</code></span>
          </div>
        </div>
        <div class="data-values-container">
          ${sv.values.length > 0
            ? sv.values.map((val, idx) => `
                <div class="data-value-item">
                  <span class="data-value-index">${idx + 1}</span>
                  <span class="data-value-text">${escapeHtml(val || '(빈 값)')}</span>
                </div>
              `).join('')
            : '<p style="color: #999; padding: 10px;">수집된 값이 없습니다.</p>'
          }
        </div>
      `;
    }
  });

  html += '</div>';
  return html;
}

/**
 * Grafana API 체크 상세 렌더링
 */
function renderGrafanaCheckDetail(detail) {
  const { apiUrl, threshold, thresholdOperator, targetServices, dataPoints, errorDataPoints, checkMode, stringDataPoints, errorStringDataPoints } = detail;

  // 문자열 존재 체크 모드
  if (checkMode === 'stringPresence') {
    return renderStringPresenceDetail(detail);
  }

  const opText = thresholdOperator === 'eq' ? '일치' : '이상';

  // targetServices에 해당하는 데이터만 필터링
  const targetSet = targetServices && targetServices.length > 0 ? new Set(targetServices) : null;
  const filteredData = targetSet
    ? dataPoints.filter(p => targetSet.has(p.service))
    : dataPoints;
  const filteredErrors = targetSet
    ? errorDataPoints.filter(p => targetSet.has(p.service))
    : errorDataPoints;

  let html = `
    <div class="detail-section">
      <h3>Grafana API 체크 상세</h3>
      <div class="condition-item">
        <div class="condition-detail-row">
          <span class="condition-label">API URL:</span>
          <span class="condition-value"><code>${escapeHtml(apiUrl)}</code></span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">임계값:</span>
          <span class="condition-value"><strong>${threshold} ${opText}</strong></span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">전체 데이터:</span>
          <span class="condition-value">${filteredData.length}건</span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">에러 데이터:</span>
          <span class="condition-value" style="color: ${filteredErrors.length > 0 ? '#dc3545' : '#28a745'};">
            <strong>${filteredErrors.length}건</strong>
          </span>
        </div>
      </div>
  `;

  // 에러 데이터 서비스별 요약 + 상세 테이블
  if (filteredErrors.length > 0) {
    // 서비스별 에러 건수 집계
    const serviceCounts = new Map();
    for (const p of filteredErrors) {
      serviceCounts.set(p.service, (serviceCounts.get(p.service) || 0) + 1);
    }
    const summary = Array.from(serviceCounts.entries())
      .map(([service, count]) => `${escapeHtml(service)}(${count})`)
      .join(', ');

    html += `
      <div style="margin-top: 10px; padding: 10px; background: #fff5f5; border-radius: 5px; border-left: 3px solid #dc3545;">
        <strong style="color: #dc3545;">에러 발생 ${filteredErrors.length}건:</strong> ${summary}
      </div>
      <h4 style="color: #dc3545; margin: 10px 0 5px;">임계값 ${opText} 데이터</h4>
      <table class="condition-table">
        <thead><tr><th>서비스</th><th>시간</th><th>값</th></tr></thead>
        <tbody>
          ${filteredErrors.map(p => `
            <tr style="background: #fff5f5;">
              <td>${escapeHtml(p.service)}</td>
              <td>${formatDateTime(p.time)}</td>
              <td><strong style="color: #dc3545;">${p.value}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // 전체 데이터 포인트 (스크롤)
  html += `
      <h4 style="margin: 10px 0 5px;">전체 데이터 (${filteredData.length}건)</h4>
      <div class="data-values-container">
        <table class="condition-table" style="margin: 0;">
          <thead><tr><th>번호</th><th>서비스</th><th>시간</th><th>값</th></tr></thead>
          <tbody>
            ${filteredData.map((p, idx) => {
              const isError = thresholdOperator === 'eq' ? p.value === threshold : p.value >= threshold;
              return `
                <tr style="${isError ? 'background: #fff5f5;' : ''}">
                  <td>${idx + 1}</td>
                  <td>${escapeHtml(p.service)}</td>
                  <td>${formatDateTime(p.time)}</td>
                  <td style="${isError ? 'color: #dc3545; font-weight: bold;' : ''}">${p.value}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return html;
}

/**
 * 문자열 존재 체크 상세 렌더링 (Loki)
 */
function renderStringPresenceDetail(detail) {
  const { apiUrl, stringDataPoints, errorStringDataPoints } = detail;
  const allStrings = stringDataPoints || [];
  const errorStrings = errorStringDataPoints || [];

  // 에러/경고 분류
  const errorItems = errorStrings.filter(p => p.line.includes('[error]'));
  const warningItems = errorStrings.filter(p => p.line.includes('[warning]'));

  let html = `
    <div class="detail-section">
      <h3>Loki 로그 체크 상세</h3>
      <div class="condition-item">
        <div class="condition-detail-row">
          <span class="condition-label">API URL:</span>
          <span class="condition-value"><code>${escapeHtml(apiUrl)}</code></span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">전체 로그:</span>
          <span class="condition-value">${allStrings.length}건</span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">에러 로그:</span>
          <span class="condition-value" style="color: ${errorItems.length > 0 ? '#dc3545' : '#28a745'};">
            <strong>${errorItems.length}건</strong>
          </span>
        </div>
        <div class="condition-detail-row">
          <span class="condition-label">경고 로그:</span>
          <span class="condition-value" style="color: ${warningItems.length > 0 ? '#e67e22' : '#28a745'};">
            <strong>${warningItems.length}건</strong>
          </span>
        </div>
      </div>
  `;

  // 에러 로그 표시
  if (errorItems.length > 0) {
    html += `
      <h4 style="color: #dc3545; margin: 10px 0 5px;">에러 로그 (${errorItems.length}건)</h4>
      <div class="data-values-container">
        ${errorItems.map((p, idx) => `
          <div style="padding: 8px 10px; margin: 4px 0; background: #fff5f5; border-left: 3px solid #dc3545; border-radius: 3px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all;">
            <div style="color: #999; margin-bottom: 4px;">${formatDateTime(p.time)}</div>
            ${escapeHtml(p.line)}
          </div>
        `).join('')}
      </div>
    `;
  }

  // 경고 로그 표시
  if (warningItems.length > 0) {
    html += `
      <h4 style="color: #e67e22; margin: 10px 0 5px;">경고 로그 (${warningItems.length}건)</h4>
      <div class="data-values-container">
        ${warningItems.map((p, idx) => `
          <div style="padding: 8px 10px; margin: 4px 0; background: #fff8e1; border-left: 3px solid #e67e22; border-radius: 3px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all;">
            <div style="color: #999; margin-bottom: 4px;">${formatDateTime(p.time)}</div>
            ${escapeHtml(p.line)}
          </div>
        `).join('')}
      </div>
    `;
  }

  // 전체 로그 (에러/경고 제외)
  const normalItems = allStrings.filter(p => !p.line.includes('[error]') && !p.line.includes('[warning]'));
  if (normalItems.length > 0) {
    html += `
      <h4 style="margin: 10px 0 5px;">기타 로그 (${normalItems.length}건)</h4>
      <div class="data-values-container">
        ${normalItems.map((p, idx) => `
          <div style="padding: 8px 10px; margin: 4px 0; background: #f8f9fa; border-left: 3px solid #dee2e6; border-radius: 3px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all;">
            <div style="color: #999; margin-bottom: 4px;">${formatDateTime(p.time)}</div>
            ${escapeHtml(p.line)}
          </div>
        `).join('')}
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

/**
 * 모니터링 결과 상세 모달 닫기
 */
function closeResultDetailModal() {
  document.getElementById('resultDetailModal').classList.remove('active');
}

/**
 * 테스트 알림 발송
 */
async function sendTestNotification() {
  const btn = document.getElementById('testNotificationBtn');
  const originalText = btn.textContent;

  // 버튼 비활성화 및 로딩 표시
  btn.disabled = true;
  btn.textContent = '발송 중...';

  try {
    const response = await apiRequest(`${API_BASE}/monitoring/test-notification`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.success) {
      alert(result.message || '테스트 알림이 발송되었습니다.');
      // 알림 히스토리 새로고침
      await loadNotificationHistory();
    } else {
      alert(result.error || '알림 발송 실패');
    }
  } catch (error) {
    console.error('테스트 알림 발송 실패:', error);
    alert('알림 발송 중 오류가 발생했습니다.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/**
 * 스케줄러 상태 로드
 */
async function loadSchedulerStatus() {
  try {
    const response = await apiRequest(`${API_BASE}/monitoring/scheduler/status`);
    const result = await response.json();

    if (result.success) {
      const toggle = document.getElementById('schedulerToggle');
      const label = document.getElementById('schedulerToggleLabel');
      toggle.checked = result.data.active;
      label.textContent = result.data.active ? '자동 검사 ON' : '자동 검사 OFF';
      label.className = result.data.active ? 'toggle-label' : 'toggle-label inactive';
    }
  } catch (error) {
    console.error('스케줄러 상태 로드 실패:', error);
  }
}

/**
 * 스케줄러 ON/OFF 토글
 */
async function toggleScheduler(e) {
  const toggle = e.target;
  const label = document.getElementById('schedulerToggleLabel');
  const status = document.getElementById('checkStatus');
  const results = document.getElementById('checkResults');
  const active = toggle.checked;

  // 즉시 UI 업데이트
  label.textContent = active ? '자동 검사 ON' : '자동 검사 OFF';
  label.className = active ? 'toggle-label' : 'toggle-label inactive';
  toggle.disabled = true;

  if (active) {
    // ON 전환: 실행 중 상태 표시
    status.textContent = '실행 중...';
    status.className = 'status-tag running';
    results.innerHTML = '';
  } else {
    status.textContent = '중지됨';
    status.className = 'status-tag ready';
    results.innerHTML = '';
  }

  try {
    const response = await apiRequest(`${API_BASE}/monitoring/scheduler/toggle`, {
      method: 'POST',
      body: JSON.stringify({ active })
    });
    const result = await response.json();

    if (!result.success) {
      // 실패 시 원래 상태로 복구
      toggle.checked = !active;
      label.textContent = !active ? '자동 검사 ON' : '자동 검사 OFF';
      label.className = !active ? 'toggle-label' : 'toggle-label inactive';
      status.textContent = '실패';
      status.className = 'status-tag error';
    } else if (active) {
      // ON 전환 완료: 검사 결과 표시
      status.textContent = '완료';
      status.className = 'status-tag success';
      await showCheckResults();
      await loadHistory(currentHistoryUrlId);
      await updateLastUpdateTime();
    }
  } catch (error) {
    console.error('스케줄러 토글 실패:', error);
    toggle.checked = !active;
    label.textContent = !active ? '자동 검사 ON' : '자동 검사 OFF';
    label.className = !active ? 'toggle-label' : 'toggle-label inactive';
    status.textContent = '에러';
    status.className = 'status-tag error';
  } finally {
    toggle.disabled = false;
  }
}
