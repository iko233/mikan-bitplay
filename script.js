// ==UserScript==
// @name AutoPlay Button (No CORS Proxy)
// @namespace https://mikanani.me/
// @version 0.4
// @description Add instant play button without CORS proxy, supports home and Bangumi pages
// @author You
// @match https://mikanani.me/*
// @grant GM_xmlHttpRequest
// @grant GM.xmlHttpRequest
// @connect ${修改为bitplay地址}
// ==/UserScript==

(function () {
  'use strict';

  const host = '${修改为bitplay地址}';

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
    if (p.includes('win')) return 'Windows';
    if (p.includes('mac')) return 'MacOS';
    if (p.includes('linux')) return 'Linux';
    return 'Unknown';
  }

  // 判断当前页面类型
  function isHomePage() {
    return location.pathname === '/' || location.pathname === '/index';
  }

  function isBangumiPage() {
    return location.pathname.startsWith('/Home/Bangumi/') || location.pathname.startsWith('/Home/Search') || location.pathname.startsWith('/Home/Classic');
  }

  // 创建播放按钮元素
  function createPlayButton(magnet, infoHash) {
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
      handlePlayButtonClick(btn, magnet, infoHash);
    });

    return btn;
  }

  // 处理播放按钮点击事件
  function handlePlayButtonClick(btn, magnet, infoHash) {
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
  }

  // 为首页添加播放按钮
  function addPlayButtonToHomePage() {
    const containers = document.querySelectorAll('.sk-col.res-name.word-wrap');
    containers.forEach(container => {
      if (container.dataset.buttonAdded) return;

      const a = container.querySelector('a[data-clipboard-text]');
      if (!a) return;
      const magnet = a.dataset.clipboardText;
      const m = magnet.match(/btih:([A-Za-z0-9]{32,40})/i);
      if (!m) return;
      const infoHash = m[1];

      const btn = createPlayButton(magnet, infoHash);
      container.appendChild(btn);
      container.dataset.buttonAdded = '1';
    });
  }

  // 为Bangumi详情页添加播放按钮
  function addPlayButtonToBangumiPage() {
    const wrappers = document.querySelectorAll('.magnet-link-wrap');

    wrappers.forEach(wrapper => {
      // 获取紧随其后的磁力链接元素
      let magnetElement = wrapper.nextElementSibling;

      // 确保找到的是带有磁力链接的元素
      if (!magnetElement || !magnetElement.dataset || !magnetElement.dataset.clipboardText) return;

      // 检查是否已经添加了按钮
      if (magnetElement.dataset.buttonAdded) return;

      const magnet = magnetElement.dataset.clipboardText;
      const m = magnet.match(/btih:([A-Za-z0-9]{32,40})/i);
      if (!m) return;
      const infoHash = m[1];

      // 添加播放按钮
      const btn = createPlayButton(magnet, infoHash);

      // 将按钮插入到磁力链接元素之后
      magnetElement.parentNode.insertBefore(btn, magnetElement.nextSibling);
      magnetElement.dataset.buttonAdded = '1';
    });
  }

  // 主函数 - 根据页面类型添加按钮
  function addPlayButtons() {
    if (isHomePage()) {
      addPlayButtonToHomePage();
    } else if (isBangumiPage()) {
      addPlayButtonToBangumiPage();
    }

    // 不断监测新内容
    setTimeout(addPlayButtons, 1000);
  }

  // 启动脚本
  addPlayButtons();
})();
