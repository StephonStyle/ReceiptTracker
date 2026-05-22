/* ========================================================
   VideoStream - Frontend App
   ======================================================== */

// ---------- State ----------
const STATE = {
  token: localStorage.getItem("vstream_token") || "",
  series: [],
  currentSeries: null,
  currentEpisode: null,
  isPlaying: false,
  controlsVisible: true,
  controlsTimer: null,
  touchStartX: 0,
  touchStartY: 0,
  seeking: false,
  volume: parseFloat(localStorage.getItem("vstream_volume") || "1"),
};

// Server URL: use saved, or auto-detect for local, or prompt on GitHub Pages
function getServerUrl() {
  const saved = localStorage.getItem("vstream_server");
  if (saved) return saved.replace(/\/+$/, "");

  // On GitHub Pages / custom domain, can't auto-detect local server
  if (location.hostname.includes("github.io") || location.hostname.includes("stephonstyle")) {
    return ""; // Will prompt user
  }

  // Local: auto-detect
  const port = location.port || "8080";
  return `${location.protocol}//${location.hostname}:${port}`;
}

let SERVER = getServerUrl();

// ---------- API ----------
async function api(method, path, body) {
  const url = `${SERVER}${path}${path.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (STATE.token) {
    opts.headers["Authorization"] = `Bearer ${STATE.token}`;
  }
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    return await res.json();
  } catch (e) {
    console.error("API error:", e);
    return null;
  }
}

// ---------- Routing ----------
function showPage(id) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const page = document.getElementById(`page-${id}`);
  if (page) page.classList.add("active");
}

function goBack() {
  if (document.getElementById("page-player").classList.contains("active")) {
    destroyPlayer();
  }
  showPage("library");
}

function changeServer() {
  localStorage.removeItem("vstream_server");
  SERVER = "";
  location.reload();
}

// ---------- Auth ----------
async function checkAuth() {
  if (!STATE.token) return false;
  const data = await api("GET", "/api/check");
  if (data && data.authenticated) {
    document.getElementById("libTitle").textContent = data.title || "光影流媒体";
    document.getElementById("loginTitle").textContent = data.title || "光影流媒体";
    return true;
  }
  STATE.token = "";
  localStorage.removeItem("vstream_token");
  return false;
}

async function doLogin() {
  const pwd = document.getElementById("loginPassword").value;
  const serverInput = document.getElementById("serverUrl");
  const btn = document.getElementById("loginBtn");
  const errEl = document.getElementById("loginError");

  // If server URL field is visible and filled, save it
  const customUrl = serverInput.value.trim();
  if (customUrl) {
    const formatted = customUrl.startsWith("http") ? customUrl : `http://${customUrl}`;
    SERVER = formatted.replace(/\/+$/, "");
    localStorage.setItem("vstream_server", SERVER);
  } else if (!SERVER) {
    errEl.textContent = "请输入服务器地址";
    return;
  }

  if (!pwd) {
    errEl.textContent = "请输入密码";
    return;
  }

  btn.textContent = "验证中...";
  btn.disabled = true;
  errEl.textContent = "";

  const data = await api("POST", "/api/auth", { password: pwd });
  if (data && data.token) {
    STATE.token = data.token;
    localStorage.setItem("vstream_token", data.token);
    showPage("library");
    loadLibrary();
  } else {
    errEl.textContent = "密码错误，请重试";
    btn.textContent = "进 入";
    btn.disabled = false;
    document.getElementById("loginPassword").value = "";
    document.getElementById("loginPassword").focus();
  }
}

// ---------- Library ----------
async function loadLibrary() {
  const content = document.getElementById("libContent");

  const data = await api("GET", "/api/series");
  if (!data) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">无法连接到服务器</div></div>`;
    return;
  }

  STATE.series = data;
  if (data.length === 0) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">📁</div><div class="empty-text">暂无视频，请添加后刷新</div></div>`;
    return;
  }

  document.getElementById("libFooterText").textContent = `共 ${data.reduce((s, c) => s + c.episodes.length, 0)} 个视频 · ${data.length} 个系列`;

  let html = "";
  data.forEach((series) => {
    const epCount = series.episodes.length;
    const totalSize = series.episodes.reduce((s, e) => s + e.size, 0);
    const sizeStr = formatSize(totalSize);
    const posterHtml = series.poster
      ? `<img src="/video/${encodeURIComponent(series.poster)}?token=${STATE.token}" alt="">`
      : "🎬";
    html += `
      <div class="series-card" data-series="${series.id}" onclick="toggleSeries(this)">
        <div class="series-header">
          <div class="series-poster">${posterHtml}</div>
          <div class="series-info">
            <div class="series-name">${escHtml(series.title)}</div>
            <div class="series-meta">${epCount} 集 · ${sizeStr}</div>
          </div>
          <div class="series-arrow">›</div>
        </div>
        <div class="episodes-container">
          <div class="episodes-grid">
            ${series.episodes.map((ep, idx) => `
              <div class="episode-item" onclick="event.stopPropagation(); openPlayer('${series.id}', ${idx})">
                <div class="ep-num">E${String(ep.episode_num).padStart(2, "0")}</div>
                <div class="ep-size">${formatSize(ep.size)}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>`;
  });
  content.innerHTML = html;
}

function toggleSeries(el) {
  const card = el.closest(".series-card");
  card.classList.toggle("open");
}

// ---------- Player ----------
function openPlayer(seriesId, episodeIdx) {
  const series = STATE.series.find((s) => s.id === seriesId);
  if (!series || !series.episodes[episodeIdx]) return;

  STATE.currentSeries = series;
  STATE.currentEpisode = series.episodes[episodeIdx];

  showPage("player");
  initPlayer();
}

function initPlayer() {
  const series = STATE.currentSeries;
  const ep = STATE.currentEpisode;

  document.getElementById("playerTitle").textContent = `${series.title} - E${String(ep.episode_num).padStart(2, "0")}`;

  // Build video source URL with token
  const videoUrl = `${SERVER}/video/${encodeURIComponent(ep.file)}?token=${STATE.token}`;
  const video = document.getElementById("videoPlayer");
  video.src = videoUrl;

  // Build episode list
  const list = document.getElementById("episodeList");
  list.innerHTML = series.episodes
    .map((e, idx) => {
      const isCurrent = e === ep;
      return `<div class="episode-list-item ${isCurrent ? "current" : ""}" onclick="switchEpisode(${idx})">
        <div class="eli-num">E${String(e.episode_num).padStart(2, "0")}</div>
        <div class="eli-name">${escHtml(e.name)}</div>
      </div>`;
    })
    .join("");
  document.getElementById("episodeCount").textContent = `${series.episodes.length} 集`;

  // Show swipe hint
  document.querySelector(".swipe-hint").classList.remove("hidden");

  // Reset UI
  showControls();
  updatePlayButton();
}

function switchEpisode(idx) {
  STATE.currentEpisode = STATE.currentSeries.episodes[idx];
  const video = document.getElementById("videoPlayer");
  video.src = `${SERVER}/video/${encodeURIComponent(STATE.currentEpisode.file)}?token=${STATE.token}`;
  video.load();
  video.play().catch(() => {});
  STATE.isPlaying = true;
  updatePlayButton();
  initPlayer(); // Refresh episode list to show current highlight
}

function destroyPlayer() {
  const video = document.getElementById("videoPlayer");
  video.pause();
  video.src = "";
  STATE.isPlaying = false;
  document.getElementById("episodeBar").classList.remove("open");
}

// ---------- Video Events ----------
function onVideoMeta() {
  const video = document.getElementById("videoPlayer");
  document.getElementById("duration").textContent = formatTime(video.duration);
  video.play().catch(() => {});
  STATE.isPlaying = true;
  updatePlayButton();
}

function onTimeUpdate() {
  if (STATE.seeking) return;
  updateProgress();
}

function updateProgress() {
  const video = document.getElementById("videoPlayer");
  if (!video.duration) return;
  const pct = (video.currentTime / video.duration) * 100;
  document.getElementById("progressFill").style.width = `${pct}%`;
  document.getElementById("progressThumb").style.left = `${pct}%`;
  document.getElementById("currentTime").textContent = formatTime(video.currentTime);
}

function onVideoEnded() {
  STATE.isPlaying = false;
  updatePlayButton();
  // Auto play next episode?
  const series = STATE.currentSeries;
  const ep = STATE.currentEpisode;
  const idx = series.episodes.indexOf(ep);
  if (idx >= 0 && idx < series.episodes.length - 1) {
    switchEpisode(idx + 1);
  }
}

function onVideoError() {
  const video = document.getElementById("videoPlayer");
  showToast("播放出错，请重试");
  console.error("Video error:", video.error);
}

// ---------- Play/Pause ----------
function togglePlay() {
  const video = document.getElementById("videoPlayer");
  if (video.paused) {
    video.play().catch(() => {});
    STATE.isPlaying = true;
  } else {
    video.pause();
    STATE.isPlaying = false;
  }
  updatePlayButton();
}

function updatePlayButton() {
  const icon = document.getElementById("ctrlPlayIcon");
  icon.textContent = STATE.isPlaying ? "⏸" : "▶";
}

// ---------- Touch Controls ----------
let touchTimeout = null;
let touchMoved = false;
let lastTapTime = 0;
let holdTimer = null;
let isHolding = false;
let holdDirection = null;

function onTouchStart(e) {
  const touch = e.touches[0];
  STATE.touchStartX = touch.clientX;
  STATE.touchStartY = touch.clientY;
  touchMoved = false;
  isHolding = false;
  holdDirection = null;

  // Detect which zone
  const rect = e.currentTarget.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const relX = x / rect.width;

  if (relX < 0.35) {
    holdDirection = "left";
  } else if (relX > 0.65) {
    holdDirection = "right";
  } else {
    holdDirection = "center";
  }

  // Start hold timer (for continuous rewind/forward)
  if (holdDirection !== "center") {
    holdTimer = setTimeout(() => {
      isHolding = true;
      startHoldAction(holdDirection);
    }, 300);
  }
}

function onTouchEnd(e) {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }

  if (isHolding) {
    stopHoldAction();
    return;
  }

  if (touchMoved) return; // Was a swipe, not a tap

  const now = Date.now();
  const timeSince = now - lastTapTime;
  lastTapTime = now;

  if (timeSince < 300) {
    // Double tap
    if (holdDirection === "left") {
      skipVideo(-30);
    } else if (holdDirection === "right") {
      skipVideo(30);
    } else {
      togglePlay();
    }
    return;
  }

  // Single tap
  if (holdDirection === "left") {
    skipVideo(-10);
    showSideIndicator("left");
  } else if (holdDirection === "right") {
    skipVideo(10);
    showSideIndicator("right");
  } else {
    // Center = toggle play/pause with overlay
    const video = document.getElementById("videoPlayer");
    if (video.paused) {
      video.play().catch(() => {});
      STATE.isPlaying = true;
    } else {
      video.pause();
      STATE.isPlaying = false;
    }
    updatePlayButton();
    showPlayIconOverlay();
  }
}

function onTouchMove(e) {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }

  const touch = e.touches[0];
  const dx = Math.abs(touch.clientX - STATE.touchStartX);
  const dy = Math.abs(touch.clientY - STATE.touchStartY);
  if (dx > 10 || dy > 10) {
    touchMoved = true;
  }

  // Handle seeking via progress bar is separate
}

// Hold action: continuous seek
let holdInterval = null;

function startHoldAction(dir) {
  const video = document.getElementById("videoPlayer");
  if (!video.duration) return;

  showSideIndicator(dir);

  holdInterval = setInterval(() => {
    if (dir === "left") {
      video.currentTime = Math.max(0, video.currentTime - 2);
    } else {
      video.currentTime = Math.min(video.duration, video.currentTime + 2);
    }
    updateProgress();
  }, 100);
}

function stopHoldAction() {
  if (holdInterval) {
    clearInterval(holdInterval);
    holdInterval = null;
  }
  hideSideIndicator();
}

// Skip by seconds (for tap)
function skipVideo(secs) {
  const video = document.getElementById("videoPlayer");
  if (!video.duration) return;
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + secs));
  updateProgress();
}

// Visual indicators
function showSideIndicator(dir) {
  const overlay = document.getElementById("touchOverlay");
  overlay.classList.remove("show-left", "show-right");
  overlay.classList.add(dir === "left" ? "show-left" : "show-right");
  if (touchTimeout) clearTimeout(touchTimeout);
  touchTimeout = setTimeout(() => {
    overlay.classList.remove("show-left", "show-right");
  }, 500);
}

function hideSideIndicator() {
  const overlay = document.getElementById("touchOverlay");
  overlay.classList.remove("show-left", "show-right");
}

// Play icon overlay (center tap)
let playIconTimeout = null;

function showPlayIconOverlay() {
  const video = document.getElementById("videoPlayer");
  const icon = document.getElementById("playIcon");
  icon.textContent = video.paused ? "▶" : "⏸";

  // Create or reuse overlay element
  let overlay = document.querySelector(".play-icon-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "play-icon-overlay";
    document.getElementById("playerContainer").appendChild(overlay);
  }
  overlay.textContent = video.paused ? "▶" : "⏸";
  overlay.classList.remove("show");
  // Force reflow
  void overlay.offsetWidth;
  overlay.classList.add("show");

  if (playIconTimeout) clearTimeout(playIconTimeout);
  playIconTimeout = setTimeout(() => {
    overlay.classList.remove("show");
  }, 600);
}

// ---------- Progress Bar ----------
function onProgressTap(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, x / rect.width));
  seekTo(pct);
}

function onProgressTouchStart(e) {
  STATE.seeking = true;
  updateSeekFromTouch(e);
}

function onProgressTouchMove(e) {
  e.preventDefault();
  updateSeekFromTouch(e);
}

function updateSeekFromTouch(e) {
  const touch = e.touches[0];
  const rect = document.getElementById("progressTrack").getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, x / rect.width));
  seekTo(pct);
}

function seekTo(pct) {
  const video = document.getElementById("videoPlayer");
  if (!video.duration) return;
  video.currentTime = pct * video.duration;
  updateProgress();
  // End seeking shortly after
  if (STATE.seeking) {
    clearTimeout(window._seekEnd);
    window._seekEnd = setTimeout(() => {
      STATE.seeking = false;
    }, 200);
  }
}

// ---------- Fullscreen ----------
function goFullscreen() {
  const el = document.getElementById("playerContainer");
  if (el.requestFullscreen) {
    el.requestFullscreen();
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
  } else if (el.mozRequestFullScreen) {
    el.mozRequestFullScreen();
  }
}

// ---------- Controls Visibility ----------
function showControls() {
  document.querySelector(".player-top").classList.remove("hidden");
  document.querySelector(".progress-bar").classList.remove("hidden");
  document.querySelector(".player-controls").classList.remove("hidden");
  STATE.controlsVisible = true;
  resetControlsTimer();
}

function hideControls() {
  document.querySelector(".player-top").classList.add("hidden");
  document.querySelector(".progress-bar").classList.add("hidden");
  document.querySelector(".player-controls").classList.add("hidden");
  document.querySelector(".swipe-hint").classList.add("hidden");
  // Close episode bar too
  document.getElementById("episodeBar").classList.remove("open");
  STATE.controlsVisible = false;
}

function resetControlsTimer() {
  if (STATE.controlsTimer) clearTimeout(STATE.controlsTimer);
  STATE.controlsTimer = setTimeout(() => {
    if (STATE.isPlaying) {
      hideControls();
    }
  }, 3500);
}

// Tap on video to toggle controls
function onVideoTap(e) {
  // This is handled via touch events already
  // But we use it to toggle the header/progress visibility
  if (STATE.controlsVisible) {
    hideControls();
  } else {
    showControls();
  }
}

// Episode bar toggle - handle swipe up
let swipeStartY = 0;
let episodeBarOpen = false;

document.addEventListener("touchstart", (e) => {
  swipeStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener("touchmove", (e) => {
  if (!document.getElementById("page-player").classList.contains("active")) return;
  if (!STATE.controlsVisible) return;

  const dy = swipeStartY - e.touches[0].clientY;
  if (dy > 50) {
    // Swipe up - show episode bar
    document.getElementById("episodeBar").classList.add("open");
    episodeBarOpen = true;
  } else if (dy < -50 && episodeBarOpen) {
    document.getElementById("episodeBar").classList.remove("open");
    episodeBarOpen = false;
  }
}, { passive: true });

// ---------- Keyboard Controls ----------
document.addEventListener("keydown", (e) => {
  if (!document.getElementById("page-player").classList.contains("active")) return;
  const video = document.getElementById("videoPlayer");
  switch (e.key) {
    case " ":
    case "k":
      e.preventDefault();
      togglePlay();
      break;
    case "ArrowLeft":
      skipVideo(-10);
      showSideIndicator("left");
      break;
    case "ArrowRight":
      skipVideo(10);
      showSideIndicator("right");
      break;
    case "f":
      goFullscreen();
      break;
  }
});

// ---------- Utils ----------
function formatTime(secs) {
  if (!secs || !isFinite(secs)) return "00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Toast
let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById("toast") || createToast();
  el.textContent = msg;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

function createToast() {
  const el = document.createElement("div");
  el.id = "toast";
  el.className = "toast";
  document.body.appendChild(el);
  return el;
}

// ---------- Init ----------
async function init() {
  // Show/configure server URL input
  const serverInput = document.getElementById("serverUrl");
  if (!SERVER) {
    // On GitHub Pages - show server URL input
    serverInput.style.display = "block";
    const saved = localStorage.getItem("vstream_server");
    if (saved) serverInput.value = saved.replace(/^https?:\/\//, "");
    serverInput.placeholder = "输入服务器地址 (如 192.168.1.100:8080)";
  } else {
    serverInput.style.display = "none";
  }

  const authed = await checkAuth();
  if (authed) {
    showPage("library");
    loadLibrary();
  } else {
    showPage("login");
    if (!SERVER) {
      serverInput.focus();
    } else {
      document.getElementById("loginPassword").focus();
    }
  }

  // Handle login form submit on Enter
  document.getElementById("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

document.addEventListener("DOMContentLoaded", init);
