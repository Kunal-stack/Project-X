const canvas = document.querySelector(".starfield");
const ctx = canvas.getContext("2d");

const messagesEl = document.getElementById("messages");
const composerEl = document.getElementById("composer");
const promptInput = document.getElementById("prompt");
const sendButton = composerEl.querySelector(".composer__send");
const promptChips = document.querySelectorAll(".prompt-chip");
const statusPill = document.getElementById("status-pill");
const statusLabel = document.getElementById("status-label");

const state = {
  busy: false,
  stars: [],
  width: 0,
  height: 0,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  pointer: { x: 0, y: 0, tx: 0, ty: 0 },
};

const LOCAL_PREVIEW_BANK = [
  {
    match: /career|job|switch|future|path/i,
    reply:
      "I usually slow career decisions down into signal, leverage, and energy. If something sharpens my skills, keeps me curious, and feels sustainable, I take it seriously.",
  },
  {
    match: /work|values|important|matters/i,
    reply:
      "What matters most to me in work is clarity, growth, and ownership. I want to build things that are useful, look intentional, and leave me better than I started.",
  },
  {
    match: /tough|stress|pressure|hard|week|burnout/i,
    reply:
      "On a rough week, I try to reduce noise first. I narrow the problem, protect momentum with a few meaningful tasks, and make sure emotion does not drive every decision.",
  },
  {
    match: /people|relationship|friend|family/i,
    reply:
      "With people, I tend to value consistency over performance. I pay attention to patterns, intent, and whether a relationship creates steadiness or friction over time.",
  },
  {
    match: /build|project|design|frontend/i,
    reply:
      "When I build, I care about how the work feels as much as how it functions. A clean interface earns trust quickly, so I try to make structure and detail feel deliberate.",
  },
];

function resizeCanvas() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;

  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  buildStars();
}

function buildStars() {
  const area = state.width * state.height;
  const count = Math.max(140, Math.floor(area / 7200));
  state.stars = Array.from({ length: count }, (_, index) =>
    createStar(index % 3)
  );
}

function createStar(layer) {
  const depth = layer + 1;
  return {
    x: Math.random() * state.width,
    y: Math.random() * state.height,
    radius: 0.45 + depth * 0.38 + Math.random() * 0.7,
    speedX: 0.014 + depth * 0.017 + Math.random() * 0.02,
    speedY: 0.004 + depth * 0.007 + Math.random() * 0.008,
    alpha: 0.25 + Math.random() * 0.55,
    twinkle: 0.4 + Math.random() * 1.1,
    phase: Math.random() * Math.PI * 2,
    hue: 205 + Math.random() * 20,
  };
}

function wrapStar(star) {
  if (star.x < -12) {
    star.x = state.width + 12;
    star.y = Math.random() * state.height;
  }

  if (star.y > state.height + 12) {
    star.y = -12;
    star.x = Math.random() * state.width;
  }
}

function animateStars(timestamp) {
  if (!animateStars.lastTime) {
    animateStars.lastTime = timestamp;
  }

  const delta = Math.min(32, timestamp - animateStars.lastTime);
  animateStars.lastTime = timestamp;

  state.pointer.x += (state.pointer.tx - state.pointer.x) * 0.02;
  state.pointer.y += (state.pointer.ty - state.pointer.y) * 0.02;

  ctx.clearRect(0, 0, state.width, state.height);

  for (const star of state.stars) {
    star.x -= star.speedX * delta;
    star.y += star.speedY * delta;
    wrapStar(star);

    const driftX = state.pointer.x * (star.radius * 0.18);
    const driftY = state.pointer.y * (star.radius * 0.18);
    const twinkle = 0.78 + Math.sin(timestamp * 0.0013 * star.twinkle + star.phase) * 0.22;
    const alpha = star.alpha * twinkle;

    ctx.beginPath();
    ctx.fillStyle = `hsla(${star.hue}, 80%, 88%, ${alpha})`;
    ctx.arc(star.x + driftX, star.y + driftY, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(animateStars);
}

function autoResizeTextarea() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 168)}px`;
}

function setStatus(mode, label) {
  statusPill.dataset.mode = mode;
  statusLabel.textContent = label;
}

function createMessage(role, text, options = {}) {
  const article = document.createElement("article");
  article.className = `message message--${role}`;

  const meta = document.createElement("div");
  meta.className = "message__meta";
  meta.innerHTML =
    role === "assistant"
      ? `<span>Kunal</span><span>${options.metaSuffix || "Digital Twin"}</span>`
      : "<span>You</span><span>Prompt</span>";

  const bubble = document.createElement("div");
  bubble.className = "message__bubble";

  if (options.typing) {
    bubble.innerHTML =
      '<div class="typing" aria-label="Kunal is typing"><span></span><span></span><span></span></div>';
  } else {
    bubble.textContent = text;
  }

  article.append(meta, bubble);
  messagesEl.appendChild(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return article;
}

function getLocalPreviewReply(prompt) {
  const found = LOCAL_PREVIEW_BANK.find((entry) => entry.match.test(prompt));

  if (found) {
    return found.reply;
  }

  return "I tend to think best when I can reduce something into first principles. I look for what is actually true, what is only noise, and what deserves my energy right now.";
}

async function requestChatReply(prompt) {
  if (window.location.protocol === "file:") {
    return {
      reply: getLocalPreviewReply(prompt),
      retrievalMode: "local-preview",
      memoryCount: 0,
    };
  }

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: prompt }),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      reply: getLocalPreviewReply(prompt),
      retrievalMode: "backend-error",
      memoryCount: 0,
      error: error instanceof Error ? error.message : "Unknown backend error",
    };
  }
}

function setBusy(busy) {
  state.busy = busy;
  sendButton.disabled = busy;
  promptInput.disabled = busy;
  promptChips.forEach((chip) => {
    chip.disabled = busy;
  });
}

async function submitPrompt(rawPrompt) {
  const prompt = rawPrompt.trim();

  if (!prompt || state.busy) {
    return;
  }

  createMessage("user", prompt);
  promptInput.value = "";
  autoResizeTextarea();
  setBusy(true);

  const typingMessage = createMessage("assistant", "", { typing: true });
  const minDelay = 760 + Math.min(prompt.length * 10, 680);

  const [replyData] = await Promise.all([
    requestChatReply(prompt),
    new Promise((resolve) => {
      window.setTimeout(resolve, minDelay);
    }),
  ]);

  typingMessage.remove();

  if (replyData.retrievalMode === "keyword-foundation") {
    setStatus("memory", "Memory Retrieval");
  } else if (replyData.retrievalMode === "workers-ai") {
    setStatus("memory", "Workers AI Live");
  } else if (replyData.retrievalMode === "backend-error") {
    setStatus("error", "Backend Offline");
  } else {
    setStatus("local-preview", "Local Preview");
  }

  let metaSuffix = "Digital Twin";

  if (replyData.retrievalMode === "keyword-foundation") {
    metaSuffix =
      replyData.memoryCount === 1
        ? "Retrieved 1 Memory"
        : `Retrieved ${replyData.memoryCount} Memories`;
  } else if (replyData.retrievalMode === "workers-ai") {
    metaSuffix =
      replyData.memoryCount === 1
        ? "Workers AI + 1 Memory"
        : `Workers AI + ${replyData.memoryCount} Memories`;
  } else if (replyData.retrievalMode === "backend-error") {
    metaSuffix = "Fallback Reply";
  } else {
    metaSuffix = "Local Preview";
  }

  createMessage("assistant", replyData.reply, { metaSuffix });
  setBusy(false);
  promptInput.focus();
}

function handlePointerMove(event) {
  const x = event.clientX / window.innerWidth - 0.5;
  const y = event.clientY / window.innerHeight - 0.5;
  state.pointer.tx = x * 14;
  state.pointer.ty = y * 14;
}

composerEl.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrompt(promptInput.value);
});

promptInput.addEventListener("input", autoResizeTextarea);

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitPrompt(promptInput.value);
  }
});

promptChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    submitPrompt(chip.dataset.prompt || chip.textContent || "");
  });
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("pointermove", handlePointerMove, { passive: true });
window.addEventListener("pointerleave", () => {
  state.pointer.tx = 0;
  state.pointer.ty = 0;
});

resizeCanvas();
autoResizeTextarea();
setStatus(
  window.location.protocol === "file:" ? "local-preview" : "local-preview",
  window.location.protocol === "file:" ? "Local Preview" : "Backend Pending"
);
requestAnimationFrame(animateStars);
