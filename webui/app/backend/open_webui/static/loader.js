(function () {
  'use strict';

  const DEBUG = false;
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

  function flashButton(btn, text, duration = 1200) {
    const original = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, duration);
  }

  function createButtons(url, type) {
    const container = document.createElement('div');
    container.style.marginTop = '4px';
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.gap = '4px';

    // --- Copy button ---
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();

      const canWriteBlob = !!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      try {
        if (canWriteBlob && !isMobile) {
          const response = await fetch(url);
          const blob = await response.blob();

          try {
            const item = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([item]);

            if (blob.type.startsWith('image/')) {
              flashButton(copyBtn, 'Copied Image ✅');
            } else if (blob.type.startsWith('video/')) {
              flashButton(copyBtn, 'Copied Video ✅');
            } else if (blob.type.startsWith('text/')) {
              flashButton(copyBtn, 'Copied Text ✅');
            } else {
              flashButton(copyBtn, 'Copied File ✅');
            }

            log('Copied blob to clipboard:', blob.type, url);
            return; // success
          } catch (blobErr) {
            log('Blob copy failed, falling back to URL:', blobErr);
          }
        }

        // fallback: copy full URL as text
        try {
          await navigator.clipboard.writeText(new URL(url, location.origin).href);
          flashButton(copyBtn, 'Copied URL ✅');
          log('Copied URL to clipboard for', url);
        } catch (urlErr) {
          console.error('Clipboard copy failed completely:', urlErr);
          flashButton(copyBtn, 'Failed to Copy ❌');
        }
      } catch (err) {
        console.error('Unexpected copy error:', err);
        flashButton(copyBtn, 'Failed to Copy ❌');
      }
    };

    // --- Download button (forces "Save As" dialog) ---
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = 'Download';
    downloadBtn.style.padding = '2px 4px';
    downloadBtn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = ''; // leave blank → browser asks filename
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(blobUrl);
        log('Triggered download for', url);
      } catch (err) {
        console.error('Download failed:', err);
      }
    };

    container.appendChild(copyBtn);
    container.appendChild(downloadBtn);

    return container;
  }

  async function buildMediaElement(url, contentType) {
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

    const link = document.createElement('a');
    link.href = url;
    link.textContent = 'Download file';
    link.download = '';
    return link;
  }

  async function createWrapperForImage(imgNode) {
    const url = normalizeUrl(imgNode.src);
    imgNode.dataset.generatedFrom = url;

    let blob;
    try {
      const response = await fetch(url);
      blob = await response.blob();
    } catch (e) {
      console.error('Failed to fetch media for', url, e);
      return null;
    }

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

  async function processSection(section) {
    const img = section.querySelector('img');
    if (!img) return;

    const normalizedSrc = normalizeUrl(img.src);
    // Only process if src matches /api/v1/files/.../content
    if (!/^\/api\/v1\/files\/[^/]+\/content$/.test(normalizedSrc)) {
        log('Skipped image, src does not match pattern:', normalizedSrc);
        return;
    }

    const generatedFrom = img.dataset.generatedFrom || '';
    const nextWrapper = img.nextElementSibling;

    if (generatedFrom !== normalizedSrc) {
      if (nextWrapper && nextWrapper.classList.contains('media-replacer')) {
        nextWrapper.remove();
      }
      const wrapper = await createWrapperForImage(img);
      if (wrapper) section.appendChild(wrapper);
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
        await processSection(btn);
      }
      const divs = document.querySelectorAll('div[class="flex h-full max-h-full justify-center items-center z-0"]');
      for (const div of divs) {
        await processSection(div);
      }
    } finally {
      scanLock = false;
    }
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });

  scan();
})();
