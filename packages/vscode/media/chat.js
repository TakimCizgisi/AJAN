/* AJAN AI — WebView istemci mantığı (VSCode teması + AJAN markası) */
(function () {
    "use strict";

    const vscode = acquireVsCodeApi();

    const $ = (sel) => document.querySelector(sel);

    const chatLogs = $("#chat-logs");
    const chatInput = $("#chat-input");
    const chatForm = $("#chat-form");
    const sendBtn = $("#chat-send-btn");
    const stopBtn = $("#chat-stop-btn");
    const modelSelect = $("#model-select");
    const statusDot = $("#ui-status-dot");
    const statusText = $("#ui-status-text");
    const statusMeta = $("#status-meta");
    const loadBar = $("#load-bar");
    const loadFill = $("#load-fill");
    const loadText = $("#load-text");
    const chatLogo = $("#chat-logo-wrap");
    const chatPanel = $("#chat-panel");
    const settingsPanel = $("#settings-panel");
    const btnToggleSS = $("#btn-toggle-ss");
    const btnNewChat = $("#btn-new-chat");
    const btnPlayground = $("#btn-playground");
    const btnRefreshModels = $("#btn-refresh-models");
    const toast = $("#toast");

    let active = false;
    let currentAssistantEl = null;
    let currentThinkingEl = null;
    let chatMessages = [];

    // ── Yardımcılar ──
    let stickToBottom = true;

    function isNearBottom() {
        if (!chatLogs) return true;
        return chatLogs.scrollHeight - chatLogs.scrollTop - chatLogs.clientHeight <= 3;
    }

    function scrollToBottom() {
        if (!stickToBottom) return;
        requestAnimationFrame(() => {
            if (chatLogs && stickToBottom && isNearBottom()) chatLogs.scrollTop = chatLogs.scrollHeight;
        });
    }

    function scrollReset() {
        stickToBottom = true;
    }

    // ` **bold** *italic* ~~strike~~ --> inline HTML
    function formatInline(text) {
        let s = escapeHTML(text);
        s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
        s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
        return s;
    }

    function escapeHTML(str) {
        const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
        return str.replace(/[&<>'"]/g, (c) => map[c] || c);
    }

    function showToast(msg, type) {
        toast.textContent = msg;
        toast.className = "toast show " + (type || "");
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => toast.classList.remove("show"), 3200);
    }

    function setStatus(kind, text, meta) {
        statusDot.className = "status-dot " + kind;
        statusText.textContent = text;
        if (statusMeta) statusMeta.textContent = meta || "";
    }

    function setActive(v) {
        active = v;
        sendBtn.disabled = v;
        chatInput.disabled = v;
        stopBtn.style.display = v ? "flex" : "none";
        sendBtn.style.display = v ? "none" : "flex";
        if (!v) chatInput.focus();
    }

    function setBusyUI(v) {
        setActive(v);
        setStatus(v ? "busy" : "ok", v ? "Çalışıyor…" : "Hazır");
    }

    function updateLogoVisibility() {
        if (!chatLogo) return;
        chatLogo.style.display = chatMessages.length > 0 ? "none" : "block";
    }

    // ── Mesajlar ──
    function appendMessage(sender, text, extraClass) {
        const wrapper = document.createElement("div");
        wrapper.className = "msg msg-" + sender + (extraClass ? " " + extraClass : "");
        const label = sender === "user" ? "SİZ" : "AJAN";
        wrapper.innerHTML =
            '<div class="msg-bubble"><span class="msg-label">' + label + "</span><span>" + formatInline(text) + "</span></div>";
        chatLogs.appendChild(wrapper);
        scrollToBottom();
        return wrapper;
    }

    function appendRaw(sender, html, extraClass) {
        const wrapper = document.createElement("div");
        wrapper.className = "msg msg-" + sender + (extraClass ? " " + extraClass : "");
        wrapper.innerHTML = '<div class="msg-bubble">' + html + "</div>";
        chatLogs.appendChild(wrapper);
        scrollToBottom();
        return wrapper;
    }

    let assistantBuffer = "";
    function startAssistantBlock() {
        const wrapper = document.createElement("div");
        wrapper.className = "msg msg-ai";
        wrapper.innerHTML =
            '<div class="msg-bubble"><span class="msg-label">AJAN</span><span class="assistant-text"></span></div>';
        chatLogs.appendChild(wrapper);
        currentAssistantEl = wrapper.querySelector(".assistant-text");
        assistantBuffer = "";
        scrollToBottom();
    }

    function appendToAssistant(text) {
        if (!currentAssistantEl) startAssistantBlock();
        if (currentAssistantEl) {
            assistantBuffer += text;
            currentAssistantEl.innerHTML = formatInline(assistantBuffer);
        }
        scrollToBottom();
    }

    function finalizeAssistant() {
        if (currentAssistantEl) {
            chatMessages.push({ kind: "assistant", text: assistantBuffer });
            saveCurrentSession();
        }
        assistantBuffer = "";
        currentAssistantEl = null;
    }

    let thinkingUserToggled = false;
    function showThinking() {
        if (currentThinkingEl) return;
        const el = appendRaw(
            "ai",
            '<div class="think-block">' +
                '<div class="think-header" role="button" tabindex="0">' +
                '<span class="think-label">Düşünce…</span>' +
                '<span class="think-arrow" aria-hidden="true">▸</span>' +
                "</div>" +
                '<div class="think-body"><span class="think-text"></span></div>' +
                "</div>",
            "msg-think think-collapsed"
        );
        if (el) {
            currentThinkingEl = el.querySelector(".think-text");
            const header = el.querySelector(".think-header");
            thinkingUserToggled = false;
            header.addEventListener("click", () => {
                const collapsed = el.classList.toggle("think-collapsed");
                thinkingUserToggled = true;
                const arrow = el.querySelector(".think-arrow");
                if (arrow) arrow.textContent = collapsed ? "▸" : "▾";
            });
        }
        scrollToBottom();
    }

    function appendThinking(text) {
        if (!currentThinkingEl) showThinking();
        if (currentThinkingEl) currentThinkingEl.textContent += text;
        scrollToBottom();
    }

    function hideThinking() {
        if (currentThinkingEl) {
            chatMessages.push({ kind: "thought", text: currentThinkingEl.textContent || "" });
            saveCurrentSession();
        }
        currentThinkingEl = null;
        const thinkBlocks = chatLogs ? chatLogs.querySelectorAll(".msg-think .think-block") : [];
        const last = thinkBlocks.length > 0 ? thinkBlocks[thinkBlocks.length - 1].closest(".msg-think") : null;
        if (last && !thinkingUserToggled) {
            last.classList.add("think-collapsed");
            const arrow = last.querySelector(".think-arrow");
            if (arrow) arrow.textContent = "▸";
        }
    }

    function showToolCall(name) {
        appendRaw("ai", '<div class="tool-status">⚙️ ' + escapeHTML(name) + " çalıştırılıyor…</div>", "msg-tool");
        chatMessages.push({ kind: "tool", name, state: "running", startedAt: Date.now() });
    }

    function showContinueRound() {
        appendRaw("ai", '<div class="tool-status">⏭ AJAN devam etmeyi seçti (continue:true)…</div>', "msg-tool");
    }

    function showToolResult(name, ok, output) {
        const truncated = output && output.length > 500 ? output.slice(0, 500) + "\n… (kesildi)" : output || "";
        const toolEls = chatLogs.querySelectorAll(".msg-tool");
        const lastToolEl = toolEls[toolEls.length - 1];
        if (lastToolEl) {
            const statusClass = ok ? "ok" : "err";
            const icon = ok ? "✅" : "❌";
            const bubble = lastToolEl.querySelector(".msg-bubble");
            if (bubble) {
                bubble.innerHTML =
                    '<div class="tool-status ' +
                    statusClass +
                    '">' +
                    icon +
                    " " +
                    escapeHTML(name) +
                    "</div><div class='tool-output'>" +
                    escapeHTML(truncated) +
                    "</div>";
            }
        }
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            const m = chatMessages[i];
            if (m && m.kind === "tool" && m.name === name && m.state === "running") {
                m.state = ok ? "done" : "error";
                m.elapsed = Date.now() - (m.startedAt || Date.now());
                m.output = truncated;
                break;
            }
        }
        saveCurrentSession();
    }

    // ── Oturum kaydetme ──
    let currentSessionId = null;
    function saveCurrentSession() {
        const meaningful = chatMessages.filter((m) => m.kind !== "info");
        if (meaningful.length === 0) return;
        if (!currentSessionId) currentSessionId = String(Date.now());
        const now = new Date().toISOString();
        const firstUser = chatMessages.find((m) => m.kind === "user");
        const title = firstUser && firstUser.text ? firstUser.text.split("\n")[0].slice(0, 32) : "Yeni Sohbet";
        vscode.postMessage({
            type: "session-save",
            session: {
                id: currentSessionId,
                title,
                mode: "agent",
                createdAt: now,
                updatedAt: now,
                history: [],
                messages: meaningful,
                todos: []
            }
        });
    }

    function newChat() {
        currentSessionId = null;
        chatMessages = [];
        if (chatLogs) chatLogs.innerHTML = "";
        scrollReset();
        updateLogoVisibility();
        vscode.postMessage({ type: "new-chat" });
        chatInput.focus();
    }

    // ── Gönder ──
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || active) return;

        chatMessages.push({ kind: "user", text });
        appendMessage("user", text);
        chatInput.value = "";

        setBusyUI(true);
        scrollReset();
        updateLogoVisibility();

        vscode.postMessage({ type: "send", text, modelId: modelSelect.value || undefined });
    }

    // ── Durum ──
    function renderModels(models, modelInfo) {
        if (!models || !modelSelect) return;
        modelSelect.innerHTML = "";
        for (const m of models) {
            const opt = document.createElement("option");
            opt.value = m.model.id;
            opt.textContent = m.model.name + (m.active || m.model.id === (modelInfo && modelInfo.modelId) ? " ★" : "");
            if (m.active || m.model.id === (modelInfo && modelInfo.modelId)) opt.selected = true;
            modelSelect.appendChild(opt);
        }
        if (models.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "Model yok";
            modelSelect.appendChild(opt);
        }
        renderModelsList(models, modelInfo);
    }

    function renderModelsList(models, modelInfo) {
        const list = $("#models-list");
        if (!list) return;
        if (!models || models.length === 0) {
            list.innerHTML = '<div class="empty-hint">Kurulu/model bulunamadı. Listeyi yenilemeyi deneyin.</div>';
            return;
        }
        list.innerHTML = "";
        for (const m of models) {
            const card = document.createElement("div");
            card.className = "model-card" + (m.active ? " active" : "");
            const statusTxt = m.active
                ? "Aktif"
                : m.installed
                  ? "Kurulu"
                  : "Kurulu değil";
            const statusClass = m.active ? "active" : m.installed ? "installed" : "";
            card.innerHTML =
                '<div class="model-card-header"><div class="model-name">' +
                escapeHTML(m.model.name) +
                (m.active ? '<span class="act-icon">★</span>' : "") +
                '</div><span class="model-status ' +
                statusClass +
                '">' +
                statusTxt +
                "</span></div>" +
                '<div class="model-desc">' +
                escapeHTML(m.model.description || "") +
                "</div>" +
                '<div class="model-actions">' +
                (m.active
                    ? ""
                    : m.installed
                      ? '<button class="btn btn-sm" data-act="use" data-id="' + m.model.id + '">Kullan</button><button class="btn btn-sm btn-danger" data-act="remove" data-id="' + m.model.id + '">Kaldır</button>'
                      : '<button class="btn btn-sm btn-outline" data-act="install" data-id="' + m.model.id + '">Kur</button>') +
                "</div>";
            list.appendChild(card);
        }
        list.querySelectorAll("[data-act]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const act = btn.dataset.act;
                const id = btn.dataset.id;
                btn.disabled = true;
                btn.textContent = "İşleniyor…";
                vscode.postMessage({ type: "model-" + act, id });
            });
        });
    }

    function renderSessions(sessions) {
        const list = $("#sessions-list");
        if (!list) return;
        if (!sessions || sessions.length === 0) {
            list.innerHTML = '<div class="empty-hint">Henüz kayıtlı oturum yok.</div>';
            return;
        }
        list.innerHTML = "";
        for (const s of sessions.slice(0, 30)) {
            const item = document.createElement("div");
            item.className = "session-item";
            item.innerHTML =
                '<span class="session-title">' + escapeHTML(s.title || "Yeni Sohbet") + '</span><span class="session-date">' + escapeHTML((s.updatedAt || "").slice(0, 10)) + "</span>";
            item.addEventListener("click", () => vscode.postMessage({ type: "session-load", id: s.id }));
            list.appendChild(item);
        }
    }

    function renderState(state) {
        const payload = state.payload || state;
        if (payload.config) {
            const cfg = payload.config;
            const temp = cfg.session && typeof cfg.session.temperature === "number" ? cfg.session.temperature : "";
            const maxSteps = cfg.maxSteps || "";
            const tempEl = $("#cfg-temperature");
            const stepsEl = $("#cfg-maxsteps");
            if (tempEl && tempEl.value !== String(temp)) tempEl.value = temp;
            if (stepsEl && stepsEl.value !== String(maxSteps)) stepsEl.value = maxSteps;
        }
        if (payload.models) renderModels(payload.models, payload.modelInfo);
        if (payload.sessions) renderSessions(payload.sessions);
        if (payload.modelInfo) {
            const name = payload.modelInfo.name && payload.modelInfo.name !== "Bilinmeyen" ? payload.modelInfo.name : "Model seçili değil";
            const kvModel = $("#kv-model");
            if (kvModel) kvModel.textContent = name;
        }
        if (payload.cwd) {
            const kvCwd = $("#kv-cwd");
            if (kvCwd) kvCwd.textContent = payload.cwd;
        }
        if (payload.gpu && Array.isArray(payload.gpu)) {
            const kvGpu = $("#kv-gpu");
            if (kvGpu) kvGpu.textContent = payload.gpu.length > 0 ? payload.gpu.join(", ") : "algılanamadı";
        }
        if (payload.status) renderStatus(payload.status);
    }

    function renderStatus(status) {
        if (status) {
            const meta = [];
            if (status.model) meta.push(status.model);
            if (status.context) {
                const pct = Math.min(100, Math.round((status.context.usedTokens / status.context.contextSize) * 100));
                meta.push("bağlam %" + pct);
            }
            if (status.active) {
                setStatus("busy", "Çalışıyor…", meta.join(" · "));
            } else {
                const cwdShort = status.cwd ? status.cwd.split(/[\\/]/).pop() : "";
                setStatus("ok", "Hazır", meta.concat(cwdShort ? ["dizin: " + cwdShort] : []).join(" · "));
            }
            const kvContext = $("#kv-context");
            if (kvContext && status.context && status.context.contextSize > 0) {
                kvContext.textContent =
                    Math.min(100, Math.round((status.context.usedTokens / status.context.contextSize) * 100)) + "% (" + status.context.usedTokens + " token)";
            }
        }
    }

    // ── Mesaj yönlendirme ──
    window.addEventListener("message", (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== "object") return;

        switch (msg.type) {
            case "state":
                renderState(msg);
                break;
            case "sessions":
                renderSessions(msg.sessions);
                break;
            case "status":
                renderStatus(msg);
                break;
            case "model-result":
                showToast(msg.ok ? "Model işlemi tamamlandı" : "Hata: " + (msg.error || "bilinmeyen"), msg.ok ? "ok" : "err");
                break;
            case "model-refresh-result":
                showToast(msg.ok ? "Model listesi güncellendi (" + (msg.count || 0) + " model)" : "Hata: " + (msg.error || ""), msg.ok ? "ok" : "err");
                break;
            case "session-loaded":
                if (msg.ok && msg.data) {
                    currentSessionId = msg.data.id;
                    chatMessages = (msg.data.messages || []).slice();
                    chatLogs.innerHTML = "";
                    for (const m of chatMessages) {
                        switch (m.kind) {
                            case "user":
                                appendMessage("user", m.text || "");
                                break;
                            case "assistant":
                                appendMessage("ai", m.text || "");
                                break;
                            case "thought": {
                                const tEl = appendRaw(
                                    "ai",
                                    '<div class="think-block">' +
                                        '<div class="think-header" role="button" tabindex="0">' +
                                        '<span class="think-label">Düşünce</span>' +
                                        '<span class="think-arrow" aria-hidden="true">▸</span>' +
                                        "</div>" +
                                        '<div class="think-body"><span>' + formatInline(m.text || "") + "</span></div>" +
                                        "</div>",
                                    "msg-think think-collapsed"
                                );
                                const hdr = tEl ? tEl.querySelector(".think-header") : null;
                                if (hdr) {
                                    hdr.addEventListener("click", () => {
                                        const collapsed = tEl.classList.toggle("think-collapsed");
                                        const arrow = tEl.querySelector(".think-arrow");
                                        if (arrow) arrow.textContent = collapsed ? "▸" : "▾";
                                    });
                                }
                                break;
                            }
                            case "tool": {
                                const cls = m.state === "done" ? "ok" : m.state === "error" ? "err" : "";
                                const icon = m.state === "done" ? "✅" : m.state === "error" ? "❌" : "⚙️";
                                const out = m.output && m.output.length > 500 ? m.output.slice(0, 500) + "\n… (kesildi)" : m.output || "";
                                appendRaw("ai", '<div class="tool-status ' + cls + '">' + icon + " " + escapeHTML(m.name || "") + "</div>" + (out ? '<div class="tool-output">' + escapeHTML(out) + "</div>" : ""), "msg-tool");
                                break;
                            }
                        }
                    }
                    updateLogoVisibility();
                } else {
                    showToast("Oturum yüklenemedi", "err");
                }
                break;
            case "session-saved":
                break;
            case "new-chat-ok":
                break;
            case "busy":
                setBusyUI(!!msg.active);
                break;
            case "found":
                if (!msg.ok && msg.error) {
                    appendMessage("ai", "⚠️ " + msg.error);
                    chatMessages.push({ kind: "assistant", text: "⚠️ " + msg.error });
                }
                setActive(false);
                setStatus("ok", "Hazır");
                break;
            case "agent:text-chunk":
                if (currentThinkingEl) hideThinking();
                appendToAssistant(msg.text);
                break;
            case "agent:thinking-chunk":
                appendThinking(msg.text);
                setStatus("busy", "düşünüyor…", statusMeta ? statusMeta.textContent : "");
                break;
            case "agent:tool-call":
                hideThinking();
                showToolCall(msg.name || "araç");
                setStatus("busy", "araç çalışıyor: " + (msg.name || ""), statusMeta ? statusMeta.textContent : "");
                break;
            case "agent:tool-result":
                showToolResult(msg.name || "", !!msg.ok, msg.output || "");
                break;
            case "agent:step-start": {
                if ((msg.step || 1) > 1) showContinueRound();
                break;
            }
            case "agent:load-progress":
                loadBar.style.display = "flex";
                loadFill.style.width = (msg.pct || 0) + "%";
                loadText.textContent = "Model yükleniyor… %" + (msg.pct || 0);
                setStatus("busy", "Model yükleniyor… %" + (msg.pct || 0));
                break;
            case "agent:load-complete":
                loadBar.style.display = "none";
                setStatus("ok", "Model hazır");
                break;
            case "agent:complete": {
                finalizeAssistant();
                hideThinking();
                setBusyUI(false);
                break;
            }
            case "agent:error":
                loadBar.style.display = "none";
                hideThinking();
                finalizeAssistant();
                setActive(false);
                setStatus("err", "Hata");
                showToast(msg.message || "Bilinmeyen hata", "err");
                break;
            case "command":
                switch (msg.command) {
                    case "new-chat":
                        newChat();
                        break;
                    case "stop":
                        vscode.postMessage({ type: "abort" });
                        setActive(false);
                        setStatus("ok", "Durduruldu");
                        break;
                    case "refresh-models":
                        vscode.postMessage({ type: "get-state" });
                        break;
                    case "config-changed":
                        vscode.postMessage({ type: "get-state" });
                        break;
                }
                break;
            case "playground-opened":
                showToast("Test alanı hazır: " + (msg.path || ".ajan"));
                break;
            case "error":
                setStatus("err", "Hata");
                showToast(msg.message || "Bilinmeyen hata", "err");
                break;
        }
    });

    // ── Olay bağlama ──
    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        sendMessage();
    });
    stopBtn.addEventListener("click", () => vscode.postMessage({ type: "abort" }));
    btnNewChat.addEventListener("click", newChat);
    btnPlayground.addEventListener("click", () => vscode.postMessage({ type: "open-playground" }));

    chatLogs.addEventListener("scroll", () => {
        stickToBottom = isNearBottom();
    });

    btnToggleSS.addEventListener("click", () => {
        const showSettings = settingsPanel.style.display !== "none";
        settingsPanel.style.display = showSettings ? "none" : "flex";
        chatPanel.style.display = showSettings ? "flex" : "none";
        if (!showSettings) {
            vscode.postMessage({ type: "get-state" });
        }
    });

    btnRefreshModels.addEventListener("click", () => vscode.postMessage({ type: "model-refresh" }));

    [$("#cfg-temperature"), $("#cfg-maxsteps")].forEach((el) => {
        if (!el) return;
        el.addEventListener("change", () => {
            const patch = {};
            if (el === $("#cfg-temperature")) patch.session = { temperature: parseFloat(el.value) };
            if (el === $("#cfg-maxsteps")) patch.maxSteps = parseInt(el.value, 10);
            vscode.postMessage({ type: "set-config", patch });
        });
    });

    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // ── Başlangıç ──
    // "ready" mesajı panel tarafında tek bir get-state isteğine dönüşür
    // (models, sessions, status, context hepsi tek state mesajında gelir)
    vscode.postMessage({ type: "ready" });
    chatInput.focus();
})();