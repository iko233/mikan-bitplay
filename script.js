// ==UserScript==
// @name 蜜柑计划增加在线播放按钮
// @namespace https://mikanani.me/
// @version 2.0
// @description 蜜柑计划增加在线播放按钮
// @author Iko
// @match https://mikanani.me/*
// @grant GM.xmlHttpRequest
// @grant GM.setValue
// @grant GM.getValue
// @grant GM.registerMenuCommand
// @connect bitplay.to
// @icon https://mikanani.me/images/favicon.ico?v=2
// ==/UserScript==

(function () {
    'use strict';

    // 服务器配置列表
    const SERVER_LIST = [
        { name: 'bitplay', url: 'https://bitplay.to', ping: 0 }
    ];

    const DEFAULT_SERVER_INDEX = 0;
    const STORAGE_KEY = 'bitplay_server_index';
    const TORRENT_REFRESH_INTERVAL = 10 * 60 * 1000; // 10分钟种子刷新间隔

    let currentServer = SERVER_LIST[DEFAULT_SERVER_INDEX];
    let serverInfoDiv = null;
    let torrentIntervals = {}; // 存储种子定时器
    let mutationObserver = null; // DOM变化监听器

    // 检测操作系统类型
    function detectOS() {
        const platform = navigator.platform.toLowerCase();
        console.log("platform:",platform);
        if (platform.includes('win')) return 'Windows';
        if (platform.includes('mac')) return 'MacOS';
        if (platform.includes('linux')) return 'Linux';
        if (platform.includes('ipad')) return 'ipad';
        return 'Unknown';
    }

    // 页面类型检测函数
    function isHomePage() {
        return location.pathname === '/' || location.pathname === '/index';
    }

    function isBangumiPage() {
        return location.pathname.startsWith('/Home/Bangumi/') ||
               location.pathname.startsWith('/Home/Search') ||
               location.pathname.startsWith('/Home/Classic');
    }

    // 网络请求封装
    function makeRequest(options) {
        console.log('=== 发起网络请求 ===');
        console.log('方法:', options.method);
        console.log('URL:', options.url);

        const originalOnload = options.onload;
        const originalOnerror = options.onerror;
        const originalOntimeout = options.ontimeout;

        options.onload = function(response) {
            console.log('=== 收到网络响应 ===');
            console.log('状态码:', response.status);
            if (originalOnload) originalOnload(response);
        };

        options.onerror = function(error) {
            console.log('=== 网络请求错误 ===');
            console.log('错误信息:', error);
            if (originalOnerror) originalOnerror(error);
        };

        options.ontimeout = function() {
            console.log('=== 网络请求超时 ===');
            if (originalOntimeout) originalOntimeout();
        };

        return GM.xmlHttpRequest(options);
    }

    // Ping测试功能（仅测试当前服务器）
    async function measurePing(url) {
        try {
            const startTime = performance.now();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            await fetch(url + '/', {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const endTime = performance.now();
            return Math.round(endTime - startTime);
        } catch (error) {
            console.log(`Ping测试失败: ${url}`, error);
            return 9999;
        }
    }

    async function testCurrentServerPing() {
        console.log('开始测试当前服务器ping...');
        const ping = await measurePing(currentServer.url);
        currentServer.ping = ping;
        console.log(`服务器 ${currentServer.name} ping: ${ping}ms`);
        updateServerDisplay();
    }

    function updateServerDisplay() {
        if (serverInfoDiv) {
            const pingText = currentServer.ping === 9999 ? '超时' : `${currentServer.ping}ms`;
            const pingColor = currentServer.ping < 100 ? '#4CAF50' :
                             currentServer.ping < 300 ? '#FF9800' : '#F44336';
            serverInfoDiv.innerHTML = `
                当前播放服务器: ${currentServer.name}
                <span style="color: ${pingColor}; font-weight: bold;">(${pingText})</span>
            `;
        }
    }

    // 服务器管理
    async function setServerIndex(index) {
        if (index >= 0 && index < SERVER_LIST.length) {
            try {
                await GM.setValue(STORAGE_KEY, index);
                window.location.reload();
            } catch (error) {
                console.error('保存服务器配置失败:', error);
                alert('切换服务器失败，请稍后重试');
            }
        }
    }

    function registerMenuCommands() {
        SERVER_LIST.forEach((server, index) => {
            const prefix = (server.url === currentServer.url) ? '✓ ' : '';
            GM.registerMenuCommand(
                `${prefix}切换到服务器: ${server.name}`,
                () => setServerIndex(index),
                `${index + 1}`
            );
        });
    }

    // 种子管理
    function setupTorrentRefresh(magnet, infoHash) {
        if (torrentIntervals[infoHash]) {
            clearInterval(torrentIntervals[infoHash]);
        }
        torrentIntervals[infoHash] = setInterval(() => {
            refreshTorrent(magnet, infoHash);
        }, TORRENT_REFRESH_INTERVAL);
        console.log(`已为种子 ${infoHash} 设置定时刷新，间隔10分钟`);
    }

    function refreshTorrent(magnet, infoHash) {
        makeRequest({
            method: 'POST',
            url: `${currentServer.url}/api/v1/torrent/add`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ magnet }),
            onload(res) {
                if (res.status >= 200 && res.status < 300) {
                    console.log(`种子 ${infoHash} 刷新成功`);
                } else {
                    console.error(`种子 ${infoHash} 刷新失败，状态码：${res.status}`);
                }
            },
            onerror(err) {
                console.error(`种子 ${infoHash} 刷新出错：${err}`);
            }
        });
    }

    // 批量下载所有文件
    function downloadAllFiles(files, infoHash) {
        let currentIndex = 0;

        function downloadNext() {
            if (currentIndex < files.length) {
                const file = files[currentIndex];
                console.log(`正在下载第 ${currentIndex + 1}/${files.length} 个文件: ${file.name}`);
                downloadFile(infoHash, file.index, file.name);
                currentIndex++;

                // 0.5秒后下载下一个文件
                setTimeout(downloadNext, 500);
            } else {
                console.log('所有文件下载完成');
            }
        }

        downloadNext();
    }

    // 文件选择对话框
    function createFileSelectionDialog(files, infoHash, actionType) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });

        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            backgroundColor: '#fff',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '600px',
            maxHeight: '70%',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
        });

        const title = document.createElement('h3');
        title.textContent = actionType === 'download' ? '请选择要下载的文件' : '请选择要播放的文件';
        title.style.marginTop = '0';
        title.style.marginBottom = '20px';
        title.style.color = '#333';
        dialog.appendChild(title);

        const fileList = document.createElement('div');
        files.forEach((file, index) => {
            const fileItem = document.createElement('div');
            Object.assign(fileItem.style, {
                padding: '12px',
                margin: '8px 0',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s'
            });

            fileItem.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 4px;">${file.name}</div>
                <div style="color: #666; font-size: 12px;">大小: ${formatSize(file.size)}</div>
            `;

            fileItem.addEventListener('mouseenter', () => {
                fileItem.style.backgroundColor = '#f5f5f5';
                fileItem.style.borderColor = '#007cba';
            });

            fileItem.addEventListener('mouseleave', () => {
                fileItem.style.backgroundColor = '';
                fileItem.style.borderColor = '#ddd';
            });

            fileItem.addEventListener('click', () => {
                overlay.remove();
                if (actionType === 'download') {
                    downloadFile(infoHash, file.index, file.name);
                } else if (actionType === 'web_play') {
                    playFileInBrowser(currentServer.url, infoHash, file.index, file.name);
                } else if (actionType === 'local_play') {
                    playFileWithLocalPlayer(currentServer.url, infoHash, file.index, file.name);
                }
            });

            fileList.appendChild(fileItem);
        });

        dialog.appendChild(fileList);

        // 按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';

        // 如果是下载操作且有多个文件，添加"下载全部"按钮
        if (actionType === 'download' && files.length > 1) {
            const downloadAllButton = document.createElement('button');
            downloadAllButton.textContent = '⬇ 下载全部';
            Object.assign(downloadAllButton.style, {
                padding: '8px 16px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
            });

            downloadAllButton.addEventListener('click', () => {
                overlay.remove();
                downloadAllFiles(files, infoHash);
            });

            buttonContainer.appendChild(downloadAllButton);
        }

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        Object.assign(cancelButton.style, {
            padding: '8px 16px',
            backgroundColor: '#ccc',
            color: '#333',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        });

        cancelButton.addEventListener('click', () => {
            overlay.remove();
        });

        buttonContainer.appendChild(cancelButton);
        dialog.appendChild(buttonContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    // 格式化文件大小
    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 新的下载文件函数
    function downloadFile(infoHash, fileIndex, fileName) {
        const downloadURL = `https://bitplay.bitchigo.icu/api/v1/torrent/${infoHash}/stream/${fileIndex}/${fileName}.mp4`;
        console.log(`下载文件: ${downloadURL}`);
        window.open(downloadURL, '_blank');
    }

    // 获取文件列表
    function getFileList(infoHash, callback, btn, defaultText, actionType) {
        makeRequest({
            method: 'GET',
            url: `${currentServer.url}/api/v1/torrent/${infoHash}`,
            onload(listRes) {
                if (listRes.status >= 200 && listRes.status < 300) {
                    try {
                        const files = JSON.parse(listRes.responseText);
                        if (files && Array.isArray(files)) {
                            callback(files, infoHash, btn, defaultText, actionType);
                        } else {
                            handleButtonError(btn, '文件列表格式错误', defaultText);
                        }
                    } catch (error) {
                        handleButtonError(btn, '解析文件列表失败：' + error.message, defaultText);
                    }
                } else {
                    handleButtonError(btn, '获取文件列表失败，状态码：' + listRes.status, defaultText);
                }
            },
            onerror: () => handleButtonError(btn, '获取文件列表出错', defaultText),
            ontimeout: () => handleButtonError(btn, '获取文件列表超时', defaultText)
        });
    }

    // 播放和下载实现函数
    function playFileWithLocalPlayer(host, infoHash, fileIndex, fileName) {
        const streamURL = `${host}/api/v1/torrent/${infoHash}/stream/${fileIndex}/stream.mp4`;
        const os = detectOS();

        console.log(`使用本地播放器播放: ${streamURL}`);

        if (os === 'MacOS') {
            window.open(`iina://weblink?url=${streamURL}`);
        } else if (os === 'Windows') {
            window.open(`potplayer://${streamURL}`);
        } else if (os === 'ipad') {
            window.location.href=`Alook://${streamURL}`;
        } else {
            alert('检测到未知系统，播放链接：\n' + streamURL);
        }
    }

    function playFileInBrowser(host, infoHash, fileIndex, fileName) {
        const streamURL = `https://bitplay.bitchigo.icu/api/v1/torrent/${infoHash}/stream/${fileIndex}/stream.mp4`;
        console.log(`在浏览器中播放: ${streamURL}`);
        const success = window.open(streamURL, '_blank');
        if(!success){
            window.location.href = streamURL;
        }
    }

    // 按钮状态管理
    function handleButtonError(btn, message, defaultText) {
        alert(message);
        resetButton(btn, defaultText);
    }

    function resetButton(btn, text) {
        btn.disabled = false;
        btn.textContent = text;
    }

    // 按钮事件处理函数
    function handleLocalPlayButtonClick(btn, magnet, infoHash) {
        const host = currentServer.url;
        btn.disabled = true;
        btn.textContent = '加载中…';

        makeRequest({
            method: 'POST',
            url: `${host}/api/v1/torrent/add`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ magnet }),
            onload(res) {
                if (res.status >= 200 && res.status < 300) {
                    setupTorrentRefresh(magnet, infoHash);
                    btn.textContent = '获取文件列表中…';
                    setTimeout(() => {
                        getFileList(infoHash, handleFileListForAction, btn, '▶ 播放器播放', 'local_play');
                    }, 1000);
                } else {
                    handleButtonError(btn, '添加失败，状态码：' + res.status, '▶ 播放器播放');
                }
            },
            onerror: () => handleButtonError(btn, '请求出错', '▶ 播放器播放'),
            ontimeout: () => handleButtonError(btn, '请求超时', '▶ 播放器播放')
        });
    }

    function handleWebPlayButtonClick(btn, magnet, infoHash) {
        const host = currentServer.url;
        btn.disabled = true;
        btn.textContent = '加载中…';

        makeRequest({
            method: 'POST',
            url: `${host}/api/v1/torrent/add`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ magnet }),
            onload(res) {
                if (res.status >= 200 && res.status < 300) {
                    setupTorrentRefresh(magnet, infoHash);
                    btn.textContent = '获取文件列表中…';
                    setTimeout(() => {
                        getFileList(infoHash, handleFileListForAction, btn, '🌐 网页播放', 'web_play');
                    }, 1000);
                } else {
                    handleButtonError(btn, '添加失败，状态码：' + res.status, '🌐 网页播放');
                }
            },
            onerror: () => handleButtonError(btn, '请求出错', '🌐 网页播放'),
            ontimeout: () => handleButtonError(btn, '请求超时', '🌐 网页播放')
        });
    }

    function handleDownloadButtonClick(btn, magnet, infoHash) {
        const host = currentServer.url;
        btn.disabled = true;
        btn.textContent = '加载中…';

        makeRequest({
            method: 'POST',
            url: `${host}/api/v1/torrent/add`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ magnet }),
            onload(res) {
                if (res.status >= 200 && res.status < 300) {
                    setupTorrentRefresh(magnet, infoHash);
                    btn.textContent = '获取文件列表中…';
                    setTimeout(() => {
                        getFileList(infoHash, handleFileListForAction, btn, '⬇ 下载', 'download');
                    }, 1000);
                } else {
                    handleButtonError(btn, '添加失败，状态码：' + res.status, '⬇ 下载');
                }
            },
            onerror: () => handleButtonError(btn, '请求出错', '⬇ 下载'),
            ontimeout: () => handleButtonError(btn, '请求超时', '⬇ 下载')
        });
    }

    // 处理文件列表
    function handleFileListForAction(files, infoHash, btn, defaultText, actionType) {
        if (files.length === 1) {
            if (actionType === 'download') {
                downloadFile(infoHash, 0, files[0].name);
            } else if (actionType === 'web_play') {
                playFileInBrowser(currentServer.url, infoHash, 0, files[0].name);
            } else if (actionType === 'local_play') {
                playFileWithLocalPlayer(currentServer.url, infoHash, 0, files[0].name);
            }
        } else if (files.length > 1) {
            btn.textContent = '请选择文件…';
            createFileSelectionDialog(files, infoHash, actionType);
        } else {
            handleButtonError(btn, '没有找到可用的文件', defaultText);
        }
        resetButton(btn, defaultText);
    }

    // 创建播放器播放按钮（简化版）
    function createLocalPlayButton(magnet, infoHash) {
        const btn = document.createElement('button');
        btn.textContent = '▶ 播放器播放';
        Object.assign(btn.style, {
            marginLeft: '10px',
            padding: '2px 6px',
            background: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        });

        btn.addEventListener('click', () => {
            handleLocalPlayButtonClick(btn, magnet, infoHash);
        });

        return btn;
    }

    // 创建网页播放按钮
    function createWebPlayButton(magnet, infoHash) {
        const btn = document.createElement('button');
        btn.textContent = '🌐 网页播放';
        Object.assign(btn.style, {
            marginLeft: '5px',
            padding: '2px 6px',
            background: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        });

        btn.addEventListener('click', () => {
            handleWebPlayButtonClick(btn, magnet, infoHash);
        });

        return btn;
    }

    // 创建下载按钮
    function createDownloadButton(magnet, infoHash) {
        const btn = document.createElement('button');
        btn.textContent = '⬇ 下载';
        Object.assign(btn.style, {
            marginLeft: '5px',
            padding: '2px 6px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        });

        btn.addEventListener('click', () => {
            handleDownloadButtonClick(btn, magnet, infoHash);
        });

        return btn;
    }

    // 页面按钮添加
    function addButtonsToHomePage() {
        const containers = document.querySelectorAll('.sk-col.res-name.word-wrap');
        containers.forEach(container => {
            if (container.dataset.buttonAdded) return;

            const a = container.querySelector('a[data-clipboard-text]');
            if (!a) return;

            const magnet = a.dataset.clipboardText;
            const match = magnet.match(/btih:([A-Za-z0-9]{32,40})/i);
            if (!match) return;

            const infoHash = match[1];
            const os = detectOS();

            if(os == 'Windows' || os == 'MacOS' || os == 'ipad'){
                const localPlayBtn = createLocalPlayButton(magnet, infoHash);
                container.appendChild(localPlayBtn);
            }

            const webPlayBtn = createWebPlayButton(magnet, infoHash);
            container.appendChild(webPlayBtn);

            const downloadBtn = createDownloadButton(magnet, infoHash);
            container.appendChild(downloadBtn);

            container.dataset.buttonAdded = '1';
        });
    }

    function addButtonsToBangumiPage() {
        const wrappers = document.querySelectorAll('.magnet-link-wrap');

        wrappers.forEach(wrapper => {
            let magnetElement = wrapper.nextElementSibling;
            if (!magnetElement || !magnetElement.dataset || !magnetElement.dataset.clipboardText) return;

            if (magnetElement.dataset.buttonAdded) return;

            const magnet = magnetElement.dataset.clipboardText;
            const match = magnet.match(/btih:([A-Za-z0-9]{32,40})/i);
            if (!match) return;

            const infoHash = match[1];
            const os = detectOS();

            let localPlayBtn;
            if(os == 'Windows' || os == 'MacOS' || os == 'ipad'){
                localPlayBtn = createLocalPlayButton(magnet, infoHash);
            }

            const webPlayBtn = createWebPlayButton(magnet, infoHash);
            const downloadBtn = createDownloadButton(magnet, infoHash);

            if(os == 'Windows' || os == 'MacOS' || os == 'ipad'){
                magnetElement.parentNode.insertBefore(localPlayBtn, magnetElement.nextSibling);
                magnetElement.parentNode.insertBefore(webPlayBtn, localPlayBtn.nextSibling);
                magnetElement.parentNode.insertBefore(downloadBtn, webPlayBtn.nextSibling);
            } else {
                magnetElement.parentNode.insertBefore(webPlayBtn, magnetElement.nextSibling);
                magnetElement.parentNode.insertBefore(downloadBtn, webPlayBtn.nextSibling);
            }

            magnetElement.dataset.buttonAdded = '1';
        });
    }

    // 服务器信息显示
    function addServerInfoToPage() {
        serverInfoDiv = document.createElement('div');
        serverInfoDiv.textContent = `当前播放服务器: ${currentServer.name} (测试中...)`;
        Object.assign(serverInfoDiv.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            zIndex: '9999',
            fontFamily: 'Arial, sans-serif',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        });
        document.body.appendChild(serverInfoDiv);
    }

    // 主函数和循环
    function addPlayButtons() {
        if (isHomePage()) {
            addButtonsToHomePage();
        } else if (isBangumiPage()) {
            addButtonsToBangumiPage();
        }

        if (!mutationObserver) {
            mutationObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length || mutation.type === 'attributes') {
                        if (isHomePage()) {
                            addButtonsToHomePage();
                        } else if (isBangumiPage()) {
                            addButtonsToBangumiPage();
                        }
                        break;
                    }
                }
            });

            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // 初始化和清理
    async function initialize() {
        try {
            // 加载保存的服务器配置
            const serverIndex = await GM.getValue(STORAGE_KEY, DEFAULT_SERVER_INDEX);
            if (serverIndex >= 0 && serverIndex < SERVER_LIST.length) {
                currentServer = SERVER_LIST[serverIndex];
            }
        } catch (error) {
            console.error('加载配置失败:', error);
            currentServer = SERVER_LIST[DEFAULT_SERVER_INDEX];
        }

        // 注册菜单命令
        registerMenuCommands();

        // 添加服务器信息显示
        addServerInfoToPage();

        // 测试当前服务器ping（仅一次）
        testCurrentServerPing();

        // 开始添加播放按钮
        addPlayButtons();

        console.log('蜜柑计划增强脚本初始化完成');
    }

    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        Object.values(torrentIntervals).forEach(interval => {
            clearInterval(interval);
        });
        torrentIntervals = {};

        if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
        }

        console.log('脚本资源已清理');
    });

    // 启动脚本
    initialize();
})();
