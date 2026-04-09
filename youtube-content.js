"use strict";

(() => {
  const host = window.location.hostname;
  const isYoutubeHost = host === "www.youtube.com" || host === "music.youtube.com";
  if (!isYoutubeHost) {
    return;
  }

  let previousVideoId = "";

  const detectAndSend = () => {
    const videoId = getVideoIdFromLocation(window.location.href);
    if (!videoId || videoId === previousVideoId) {
      return;
    }

    previousVideoId = videoId;
    const source = host === "music.youtube.com" ? "music" : "video";

    chrome.runtime.sendMessage({ type: "VIDEO_CHANGED", videoId, source }, () => {
      void chrome.runtime.lastError;
    });
  };

  const scheduleDetect = debounce(detectAndSend, 250);

  setInterval(detectAndSend, 2000);
  window.addEventListener("yt-navigate-finish", scheduleDetect, true);
  window.addEventListener("popstate", scheduleDetect, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleDetect();
    }
  });

  detectAndSend();

  function getVideoIdFromLocation(urlString) {
    try {
      const parsed = new URL(urlString);
      if (parsed.pathname !== "/watch") {
        return "";
      }
      return parsed.searchParams.get("v") || "";
    } catch (error) {
      console.warn("[Chats Mood Changer] Failed to parse URL:", error);
      return "";
    }
  }

  function debounce(fn, delayMs) {
    let timer = null;

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(fn, delayMs);
    };
  }
})();
