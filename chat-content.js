"use strict";

(() => {
  const CHAT_ROOT_ID = "global_chat";
  const APPLY_ENDPOINTS = [
    "/system/action/action_profile.php",
    "system/action/action_profile.php"
  ];

  if (!isLikelyChatSite()) {
    return;
  }

  let lastAppliedMood = "";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "MOOD_UPDATED") {
      return;
    }

    applyMood(message.mood)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.warn("[Chats Mood Changer] Mood update failed:", error);
        sendResponse({ ok: false, error: String(error) });
      });

    return true;
  });

  requestInitialMood();

  function isLikelyChatSite() {
    const href = window.location.href.toLowerCase();
    const host = window.location.hostname;

    if (href.includes("chat")) {
      return true;
    }

    if (host === "drawspace.online") {
      return true;
    }

    if (host.endsWith("boomcoding.com")) {
      return true;
    }

    if (host === "moonwave.online") {
      return true;
    }

    return false;
  }

  function requestInitialMood() {
    chrome.runtime.sendMessage({ type: "REQUEST_CURRENT_MOOD" }, async (response) => {
      if (chrome.runtime.lastError || !response || !response.ok || !response.mood) {
        return;
      }

      try {
        await applyMood(response.mood);
      } catch (error) {
        console.warn("[Chats Mood Changer] Initial mood apply failed:", error);
      }
    });
  }

  async function applyMood(mood) {
    if (!mood || typeof mood !== "string") {
      return;
    }

    if (mood === lastAppliedMood) {
      return;
    }

    await waitForChatMarker(6000);

    const moodInput = document.querySelector("#set_mood");
    if (moodInput instanceof HTMLInputElement) {
      moodInput.value = mood;
    }

    const responseCode = await submitMood(mood);

    if (responseCode === "0") {
      throw new Error("Server returned an error while saving mood.");
    }

    if (responseCode === "2") {
      throw new Error("Server rejected mood as restricted content.");
    }

    lastAppliedMood = mood;
    console.info("[Chats Mood Changer] Mood updated:", mood);
  }

  function waitForChatMarker(timeoutMs) {
    return new Promise((resolve) => {
      if (document.getElementById(CHAT_ROOT_ID)) {
        resolve(true);
        return;
      }

      const observer = new MutationObserver(() => {
        if (document.getElementById(CHAT_ROOT_ID)) {
          observer.disconnect();
          resolve(true);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeoutMs);
    });
  }

  async function submitMood(mood) {
    const payload = new URLSearchParams({ save_mood: mood }).toString();
    let lastError = null;

    for (const endpoint of APPLY_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
          },
          body: payload
        });

        if (!response.ok) {
          lastError = new Error(`Request failed with status ${response.status}`);
          continue;
        }

        return (await response.text()).trim();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("No mood endpoint responded.");
  }
})();
