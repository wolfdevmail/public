// ==UserScript==
// @name         Replace generated media with safe async handling and styled wrappers
// @namespace    http://tampermonkey.net/
// @version      8.5
// @description  Handle img/video/text safely, prevent race conditions, style wrappers and buttons
// @match        https://ai.home.ftc/*
// @match        https://service.ai.home.ftc/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = true;
  let scanLock = false;

  function log(...args) {
    if (DEBUG) console.log('[MediaReplacer]', ...args);
  }

  function normalizeUrl(u) {
    try {
      const parsed = new URL(u, location.origin);
      return parsed.pathname + parsed.search;
    } catch {
      return u || '';
    }
  }

  async function getContentType(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.headers.get('Content-Type') || '';
    } catch (e) {
      console.error('Failed to fetch content type for', url, e);
      return '';
    }
  }

  function createButtons(url, type) {
    const container = document.createElement('div');
    container.style.marginTop = '4px';
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.gap = '4px';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const item = new ClipboardItem({ [blob.type]: blob });
        await navigator.clipboard.write([item]);
        log('Copied media to clipboard for', url);
      } catch (err) {
        console.error('Failed to copy media:', err);
      }
    };

    const downloadBtn = document.createElement('a');
    downloadBtn.textContent = 'Download';
    downloadBtn.href = url;
    downloadBtn.download = '';
    downloadBtn.style.textDecoration = 'none';
    downloadBtn.style.padding = '2px 4px';
    downloadBtn.onclick = (e) => e.stopPropagation();

    container.appendChild(copyBtn);
    container.appendChild(downloadBtn);

    return container;
  }

  async function buildMediaElement(url, contentType) {
    // If content-type is missing or generic, try fetching blob to detect it
    if (!contentType || contentType === 'application/octet-stream') {
        const blob = await fetch(url).then(r => r.blob());
        contentType = blob.type;
    }

    if (contentType.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.style.maxWidth = '100%';
        return video;
    }

    if (contentType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        return img;
    }

    if (contentType.startsWith('text/')) {
        const text = await fetch(url).then(r => r.text());
        const pre = document.createElement('pre');
        pre.textContent = text;
        pre.style.maxWidth = '100%';
        pre.style.border = '1px solid';
        pre.style.padding = '4px';
        pre.style.textAlign = 'left';
        pre.style.margin = 'auto';
        return pre;
    }

    // fallback for unknown types
    const link = document.createElement('a');
    link.href = url;
    link.textContent = 'Download file';
    link.download = '';
    return link;
  }

  async function createWrapperForImage(imgNode) {
    const url = normalizeUrl(imgNode.src);
    imgNode.dataset.generatedFrom = url;

    // Fetch blob directly
    let blob;
    try {
        const response = await fetch(url);
        blob = await response.blob();
    } catch (e) {
        console.error('Failed to fetch media for', url, e);
        return null;
    }

    // ensure src hasn't changed while fetching
    if (normalizeUrl(imgNode.src) !== url) return null;

    const contentType = blob.type || 'application/octet-stream';
    let mediaElement;

    if (contentType.startsWith('video/')) {
        mediaElement = document.createElement('video');
        mediaElement.src = url;
        mediaElement.controls = true;
        mediaElement.style.maxWidth = '100%';
    } else if (contentType.startsWith('image/')) {
        mediaElement = document.createElement('img');
        mediaElement.src = url;
        mediaElement.style.maxWidth = '100%';
    } else if (contentType.startsWith('text/')) {
        const text = await blob.text();
        mediaElement = document.createElement('pre');
        mediaElement.textContent = text;
        mediaElement.style.maxWidth = '100%';
        mediaElement.style.border = '1px solid';
        mediaElement.style.padding = '4px';
        mediaElement.style.textAlign = 'left';
        mediaElement.style.margin = 'auto';
    } else {
        // fallback for unknown types
        mediaElement = document.createElement('a');
        mediaElement.href = url;
        mediaElement.textContent = 'Download file';
        mediaElement.download = '';
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'media-replacer';
    wrapper.dataset.sourceUrl = url;
    wrapper.style.textAlign = 'center';
    wrapper.appendChild(mediaElement);
    wrapper.appendChild(createButtons(url, contentType));

    imgNode.style.display = 'none';
    return wrapper;
  }


  async function processButton(btn) {
    const img = btn.querySelector('img');
    if (!img) return;

    const normalizedSrc = normalizeUrl(img.src);
    const generatedFrom = img.dataset.generatedFrom || '';
    const nextWrapper = img.nextElementSibling;

    if (generatedFrom !== normalizedSrc) {
      if (nextWrapper && nextWrapper.classList.contains('media-replacer')) {
        nextWrapper.remove();
      }
      const wrapper = await createWrapperForImage(img);
      if (wrapper) btn.appendChild(wrapper);
      log('Generated new wrapper for', normalizedSrc);
    } else {
      log('Wrapper is up to date for', normalizedSrc);
    }
  }

  async function scan() {
    if (scanLock) return;
    scanLock = true;
    try {
      const buttons = document.querySelectorAll('button[aria-label="Show image preview"]');
      for (const btn of buttons) {
        await processButton(btn);
      }
    } finally {
      scanLock = false;
    }
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });

  scan();
})();
