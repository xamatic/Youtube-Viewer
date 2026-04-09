"use strict";

const STATE = {
  lastVideoId: "",
  lastMood: ""
};

const GARBAGE_PATTERNS = [
  /\s*-\s*Topic$/gi,
  /\s*\(Official.*?\)/gi,
  /\s*\[Official.*?\]/gi,
  /\s*\(Lyric.*?\)/gi,
  /\s*\[Lyric.*?\]/gi,
  /\s*\(Audio.*?\)/gi,
  /\s*\[Audio.*?\]/gi,
  /\s*\(Visualizer.*?\)/gi,
  /\s*\[Visualizer.*?\]/gi,
  /\s*(HD|4K)$/gi
];

chrome.runtime.onInstalled.addListener(async () => {
  const { currentMood = "" } = await chrome.storage.local.get("currentMood");
  STATE.lastMood = currentMood;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === "VIDEO_CHANGED") {
    handleVideoChanged(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("[Chats Mood Changer] VIDEO_CHANGED failed:", error);
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }

  if (message.type === "REQUEST_CURRENT_MOOD") {
    chrome.storage.local
      .get("currentMood")
      .then(({ currentMood = "" }) => {
        sendResponse({ ok: true, mood: currentMood });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }
});

async function handleVideoChanged(message) {
  const { videoId, source } = message;

  if (!videoId || typeof videoId !== "string") {
    return "ignored-invalid-video-id";
  }

  if (videoId === STATE.lastVideoId) {
    return "ignored-same-video-id";
  }
  STATE.lastVideoId = videoId;

  const videoInfo = await fetchVideoInfo(videoId);
  const mood = buildMood(videoInfo.title, videoInfo.channel, source);

  if (!mood) {
    return "ignored-empty-mood";
  }

  if (mood === STATE.lastMood) {
    return "ignored-same-mood";
  }

  STATE.lastMood = mood;
  await chrome.storage.local.set({
    currentMood: mood,
    currentVideoId: videoId,
    lastUpdatedAt: Date.now()
  });

  await broadcastMood(mood);
  return "updated";
}

async function fetchVideoInfo(videoId) {
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;

  const response = await fetch(oEmbedUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata (${response.status})`);
  }

  const data = await response.json();
  return {
    title: data.title || "",
    channel: data.author_name || ""
  };
}

function buildMood(rawTitle, rawChannel, source) {
  const cleanChannel = (rawChannel || "").replace(/\s*-\s*Topic$/i, "").trim();

  let cleanTitle = (rawTitle || "").trim();
  const splitTitle = cleanTitle.split(" - ");
  if (splitTitle.length > 1 && splitTitle[1]) {
    cleanTitle = splitTitle.slice(1).join(" - ").trim();
  }

  let combined = [cleanTitle, cleanChannel].filter(Boolean).join(" - ");

  for (const pattern of GARBAGE_PATTERNS) {
    combined = combined.replace(pattern, "");
  }

  combined = combined.replace(/[\s\-|]+$/g, "").trim();
  if (!combined) {
    return "";
  }

  const prefix = source === "music" ? "MUSIC" : "VIDEO";
  const shortText = combined.length > 33 ? `${combined.slice(0, 33)}...` : combined;
  return `${prefix}: ${shortText}`;
}

async function broadcastMood(mood) {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === "number")
      .map(
        (tab) =>
          new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { type: "MOOD_UPDATED", mood }, () => {
              void chrome.runtime.lastError;
              resolve();
            });
          })
      )
  );
}
