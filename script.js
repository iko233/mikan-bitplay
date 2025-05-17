// ==UserScript==
// @name         AutoPlay Button (No CORS Proxy)
// @namespace    https://mikanani.me/
// @version      0.3
// @description  Add instant play button without CORS proxy
// @author       You
// @match        https://mikanani.me/*
// @grant        GM_xmlHttpRequest
// @grant        GM.xmlHttpRequest
// @connect      ${修改为bitplay地址}
// ==/UserScript==

(function () {
  'use strict';

  const host = '${修改为bitplay地址}'

  // 选择正确的跨域请求方法
  function gmRequest(options) {
    if (typeof GM_xmlHttpRequest === 'function') {
      return GM_xmlHttpRequest(options);
    }
    if (window.GM && typeof GM.xmlHttpRequest === 'function') {
      return GM.xmlHttpRequest(options);
    }
    console.error('无法找到 GM_xmlHttpRequest 或 GM.xmlHttpRequest');
  }

  function detectOS() {
    const p = navigator.platform.toLowerCase();
    if (p.includes('win'))   return 'Windows';
    if (p.includes('mac'))   return 'MacOS';
    if (p.includes('linux')) return 'Linux';
    return 'Unknown';
  }

  function addPlayButton() {
    const containers = document.querySelectorAll('.sk-col.res-name.word-wrap');
    containers.forEach(container => {
      if (container.dataset.buttonAdded) return;

      const a = container.querySelector('a[data-clipboard-text]');
      if (!a) return;
      const magnet = a.dataset.clipboardText;
      const m = magnet.match(/btih:([A-Za-z0-9]{32,40})/);
      if (!m) return;
      const infoHash = m[1];

      const btn = document.createElement('button');
      btn.textContent = '▶ 立即播放';
      Object.assign(btn.style, {
        marginLeft: '10px',
        padding: '2px 6px',
        background: '#2196F3',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      });

      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = '加载中…';

        gmRequest({
          method: 'POST',
          url: `${host}/api/v1/torrent/add`,
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ magnet }),
          onload(res) {
            if (res.status >= 200 && res.status < 300) {
              // 延迟一下，确保种子添加完成
              setTimeout(() => {
                const streamURL = `${host}/api/v1/torrent/${infoHash}/stream/0`;
                const os = detectOS();
                if (os === 'MacOS') {
                  window.open(`iina://weblink?url=${streamURL}`);
                } else if (os === 'Windows') {
                  window.open(`potplayer://${streamURL}`);
                } else {
                  alert('检测到未知系统，播放链接：\n' + streamURL);
                }
              }, 500);
            } else {
              alert('添加失败，状态码：' + res.status);
            }
            btn.disabled = false;
            btn.textContent = '▶ 立即播放';
          },
          onerror(err) {
            alert('请求出错：' + err);
            btn.disabled = false;
            btn.textContent = '▶ 立即播放';
          },
          ontimeout() {
            alert('请求超时');
            btn.disabled = false;
            btn.textContent = '▶ 立即播放';
          }
        });
      });

      container.appendChild(btn);
      container.dataset.buttonAdded = '1';
    });

    // 不断监测新内容
    setTimeout(addPlayButton, 1000);
  }

  addPlayButton();
})();
