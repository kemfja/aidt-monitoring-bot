const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    console.log('페이지 접속 중...');
    await page.goto('https://monitoring.aidt.ai:3000/public-dashboards/370cefbc06dd4260b45102ad0684e56e');
    
    // 대기
    await page.waitForTimeout(5000);
    
    // 선택자 확인
    const element = page.locator('.css-xfc7jo').first();
    const count = await element.count();
    console.log(`.css-xfc7jo 요소 개수: ${count}`);
    
    if (count > 0) {
      const text = await element.first().textContent();
      console.log(`텍스트 내용: "${text}"`);
      
      // 클릭 시도
      console.log('요소 클릭 중...');
      await element.first().click();
      await page.waitForTimeout(3000);
      
      // 클릭 후 텍스트 재확인
      const textAfterClick = await element.first().textContent();
      console.log(`클릭 후 텍스트: "${textAfterClick}"`);
      
      // 스크린샷 저장
      await page.screenshot({ path: 'screenshot.png' });
      console.log('스크린샷 저장: screenshot.png');
    }
    
  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await browser.close();
  }
})();
