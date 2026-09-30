// Layout-only fixture using the installed LiveKit structure. No call or media access.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
try {
  await page.goto(`http://localhost:5174/?name=Layout-check&role=student&room=studio-layout-${Date.now()}`);
  await page.locator('.workspace-editor').waitFor();
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'call-layout-fixture';
    fixture.className = 'studio-workspace';
    fixture.style.cssText = 'position:fixed;left:20px;top:20px;width:320px;height:850px;min-height:0;z-index:100;background:#181a17';
    fixture.innerHTML = `<aside class="workspace-dock panel" style="width:100%;height:100%">
      <div class="dock-heading">Call & chat — layout fixture</div><div class="dock-content dock-video"><div id="panel-video" role="tabpanel" aria-label="Together">
      <div class="studio-video-live"><div data-lk-theme="default"><div class="lk-video-conference">
      <div class="lk-video-conference-inner"><div class="lk-grid-layout-wrapper"><div style="width:100%;height:100%;min-height:160px;display:grid;place-items:center;background:#242820;border-radius:8px;color:#bdcaa8">Example video tile</div></div>
      <div class="lk-control-bar"><div class="lk-button-group"><button class="lk-button">Microphone</button><button class="lk-button" aria-label="Microphone options">⌄</button></div><div class="lk-button-group"><button class="lk-button">Camera</button><button class="lk-button" aria-label="Camera options">⌄</button></div><button class="lk-button">Share screen</button><button class="lk-button lk-chat-toggle">Chat</button><button class="lk-disconnect-button">Leave</button></div></div>
      <div class="lk-chat" style="display:grid"><div class="lk-chat-header">Messages<button class="lk-button lk-close-button" aria-label="Close chat">×</button></div><ul class="lk-list lk-chat-messages"><li class="lk-chat-entry" data-message-origin="remote"><span class="meta-data">Example teammate</span><span class="message-body">The controls and message input should remain visible.</span></li></ul><form class="lk-chat-form"><input class="lk-form-control lk-chat-form-input" aria-label="Message" placeholder="Enter a message..."/><button class="lk-button lk-chat-form-button">Send</button></form></div>
      </div></div></div></div></div></aside>`;
    document.body.append(fixture);
  });
  for (const width of [260, 320, 460, 650]) {
    await page.locator('#call-layout-fixture').evaluate((element, width) => { element.style.width = `${width}px`; }, width);
    const failures = await page.locator('#call-layout-fixture').evaluate(root => {
      const failures = [];
      for (const selector of ['.lk-video-conference', '.lk-control-bar', '.lk-chat', '.lk-chat-form']) {
        const element = root.querySelector(selector);
        if (element.scrollWidth > element.clientWidth + 1) failures.push(`${selector} horizontal overflow`);
      }
      const chat = root.querySelector('.lk-chat').getBoundingClientRect();
      for (const selector of ['.lk-close-button', '.lk-chat-form-input', '.lk-chat-form-button']) {
        const rect = root.querySelector(selector).getBoundingClientRect();
        if (rect.left < chat.left || rect.right > chat.right + 1) failures.push(`${selector} clipped`);
      }
      if (root.querySelector('.lk-chat-form-input').getBoundingClientRect().width < 100) failures.push('Chat input is squeezed');
      const control = root.querySelector('.lk-control-bar').getBoundingClientRect();
      if (chat.top < control.bottom - 1) failures.push('Chat overlaps the call controls');
      for (const button of root.querySelectorAll('.lk-control-bar button')) {
        const rect = button.getBoundingClientRect();
        if (rect.left < control.left - 1 || rect.right > control.right + 1) failures.push(`${button.textContent} clipped`);
        if (rect.top < control.top - 1 || rect.bottom > control.bottom + 1) failures.push(`${button.textContent} escapes control bar vertically: ${JSON.stringify({ top: rect.top, bottom: rect.bottom, controlTop: control.top, controlBottom: control.bottom })}`);
      }
      return failures;
    });
    assert.deepEqual(failures, [], `${width}px panel`);
    console.log(`PASS Call/chat layout fixture at ${width}px`);
  }
  await page.locator('#call-layout-fixture').evaluate(element => { element.style.width = '320px'; });
  await page.locator('#call-layout-fixture').screenshot({ path: 'frontend2/verification/call-layout.png' });
} finally { await browser.close(); }
