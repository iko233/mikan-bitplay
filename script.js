// ==UserScript==
// @name AutoPlay Button
// @namespace https://mikanani.me/
// @version 0.5
// @description Add instant play button without CORS proxy, supports home and Bangumi pages, with multiple server switch
// @author You
// @match https://mikanani.me/*
// @grant GM_xmlHttpRequest
// @grant GM.xmlHttpRequest
// @grant GM_setValue
// @grant GM_getValue
// @grant GM.setValue
// @grant GM.getValue
// @grant GM_registerMenuCommand
// @grant GM.registerMenuCommand
// @connect www.cloudflare.com  //更换为自己服务器地址
// @connect 192.168.1.1  //更换为自己服务器地址
// ==/UserScript==

(function () {
'use strict';

// 服务器配置
const SERVER_LIST = [
    { name: 'Cloudfalre', url: 'https://www.cloudflare.com'},  //更换为自己服务器地址
    { name: 'Local', url: 'http://192.168.1.1'}  //更换为自己服务器地址
];

// 默认服务器索引
const DEFAULT_SERVER_INDEX = 0;

// 存储键名
const STORAGE_KEY = 'bitplay_server_index';

// 存储当前选择的服务器信息
let currentServer = SERVER_LIST[DEFAULT_SERVER_INDEX];

// 检测是否需要使用异步API
const isAsyncAPI = window.GM && typeof GM.getValue === 'function' &&
                   typeof GM_getValue !== 'function';

// GM API 封装，兼容不同的脚本管理器
const GMAPI = {
    setValue: function(key, value) {
        if (typeof GM_setValue === 'function') {
            return GM_setValue(key, value);
        } else if (window.GM && typeof GM.setValue === 'function') {
            return GM.setValue(key, value);
        }
        console.error('无法找到 GM_setValue 或 GM.setValue');
    },

    getValue: function(key, defaultValue) {
        if (typeof GM_getValue === 'function') {
            return GM_getValue(key, defaultValue);
        } else if (window.GM && typeof GM.getValue === 'function') {
            return GM.getValue(key, defaultValue);
        }
        console.error('无法找到 GM_getValue 或 GM.getValue');
        return defaultValue;
    },

    registerMenuCommand: function(name, fn, accessKey) {
        if (typeof GM_registerMenuCommand === 'function') {
            return GM_registerMenuCommand(name, fn, accessKey);
        } else if (window.GM && typeof GM.registerMenuCommand === 'function') {
            return GM.registerMenuCommand(name, fn, accessKey);
        }
        console.error('无法找到 GM_registerMenuCommand 或 GM.registerMenuCommand');
    }
};

// 初始化函数，加载配置
async function initialize() {
    try {
        let serverIndex;

        if (isAsyncAPI) {
            serverIndex = await GMAPI.getValue(STORAGE_KEY, DEFAULT_SERVER_INDEX);
        } else {
            serverIndex = GMAPI.getValue(STORAGE_KEY, DEFAULT_SERVER_INDEX);
        }

        // 确保索引在有效范围内
        if (serverIndex >= 0 && serverIndex < SERVER_LIST.length) {
            currentServer = SERVER_LIST[serverIndex];
        }
    } catch (error) {
        console.error('初始化失败:', error);
        // 使用默认服务器
        currentServer = SERVER_LIST[DEFAULT_SERVER_INDEX];
    }

    // 注册菜单命令
    registerMenuCommands();

    // 添加服务器信息到页面
    addServerInfoToPage();

    // 开始添加播放按钮
    addPlayButtons();
}

// 设置当前服务器索引
async function setServerIndex(index) {
    if (index >= 0 && index < SERVER_LIST.length) {
        if (isAsyncAPI) {
            await GMAPI.setValue(STORAGE_KEY, index);
        } else {
            GMAPI.setValue(STORAGE_KEY, index);
        }
        // 刷新页面使更改生效
        window.location.reload();
    }
}

// 注册菜单命令
function registerMenuCommands() {
    // 为每个服务器创建菜单项
    SERVER_LIST.forEach((server, index) => {
        const prefix = (server.url === currentServer.url) ? '✓ ' : '';

        GMAPI.registerMenuCommand(
            `${prefix}切换到服务器: ${server.name}`,
            () => setServerIndex(index),
            `${index + 1}`
        );
    });
}

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
  // 获取当前选择的服务器URL
  const host = currentServer.url;

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

// 在页面底部添加当前使用的服务器信息
function addServerInfoToPage() {
  const div = document.createElement('div');
  div.textContent = `当前播放服务器: ${currentServer.name}`;
  Object.assign(div.style, {
    position: 'fixed',
    bottom: '10px',
    right: '10px',
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    padding: '5px 10px',
    borderRadius: '5px',
    fontSize: '12px',
    zIndex: '9999'
  });
  document.body.appendChild(div);
}

// 主函数 - 根据页面类型添加按钮
function addPlayButtons() {
  if (isHomePage()) {
    addPlayButtonToHomePage();
    // 不断监测新内容
    setTimeout(addPlayButtons, 1000);
  } else if (isBangumiPage()) {
    addPlayButtonToBangumiPage();
    // 不断监测新内容
    setTimeout(addPlayButtons, 1000);
  }
}

// 启动脚本
if (isAsyncAPI) {
    // 使用异步初始化
    initialize();
} else {
    try {
        // 直接同步获取配置
        const serverIndex = GMAPI.getValue(STORAGE_KEY, DEFAULT_SERVER_INDEX);
        if (serverIndex >= 0 && serverIndex < SERVER_LIST.length) {
            currentServer = SERVER_LIST[serverIndex];
        }
        registerMenuCommands();
        addServerInfoToPage();
        addPlayButtons();
    } catch (error) {
        console.error('初始化失败:', error);
        // 使用默认值
        registerMenuCommands();
        addServerInfoToPage();
        addPlayButtons();
    }
}

})();
