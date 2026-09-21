/* ─── AJAN Siber Paket Yöneticisi — renderer ─── */

const $ = (sel) => document.querySelector(sel);

let allPackages = [];
let searchTerm = "";

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function initials(label) {
    const parts = String(label).trim().split(/[\s-]+/);
    return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "").toUpperCase();
}

function showToast(text, ok) {
    const toast = $("#toast");
    toast.textContent = text;
    toast.classList.add("show", ok ? "ok" : "err");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show", "ok", "err"), 3000);
}

function badgeHtml(pkg) {
    if (pkg.installed && pkg.updateAvailable) return '<span class="badge update">Güncelle</span>';
    if (pkg.installed) return '<span class="badge installed">Yüklü</span>';
    return '<span class="badge compat">İndirilebilir</span>';
}

function versionHtml(pkg) {
    if (!pkg.current && !pkg.latest) return "";
    if (pkg.current && pkg.latest && pkg.current !== pkg.latest)
        return `v${esc(pkg.current)} <span class="arrow">→</span> <span class="new">v${esc(pkg.latest)}</span>`;
    return `v${esc(pkg.current || pkg.latest)}`;
}

function packageHtml(pkg) {
    const logo = pkg.logo
        ? `<div class="pkg-logo"><img class="pkg-logo-img" src="${pkg.logo}" alt="logo" onerror="this.parentElement.textContent='${esc(initials(pkg.label))}'"></div>`
        : `<div class="pkg-logo">${esc(initials(pkg.label))}</div>`;

    const registryNote = pkg.registryError ? `<div class="pkg-registry-error">${esc(pkg.registryError)}</div>` : "";

    let actions = "";
    if (pkg.commands && pkg.commands.length) {
        const label = pkg.installed && pkg.updateAvailable ? "Güncelle" : pkg.installed ? "Yeniden Kur" : "Yükle";
        actions = `<div class="pkg-actions"><button class="btn primary pkg-act" data-id="${esc(pkg.id)}">${label}</button></div>`;
    }

    return `
        <div class="pkg-item" data-id="${esc(pkg.id)}" data-search="${esc((pkg.label + " " + (pkg.npmName || "")).toLowerCase())}">
            ${logo}
            <div class="pkg-content">
                <div class="pkg-head">
                    <span class="pkg-name">${esc(pkg.label)}</span>
                    <span class="pkg-version">${versionHtml(pkg)}</span>
                    <div class="pkg-badges">${badgeHtml(pkg)}</div>
                </div>
                <div class="pkg-desc">${esc(pkg.description)}</div>
                ${registryNote}
                ${actions}
            </div>
        </div>`;
}

function drawList(packages) {
    const listEl = $("#packageList");
    if (!packages.length) {
        listEl.innerHTML = '<div class="card empty-hint">Aradığınız kriterlere uygun paket bulunamadı.</div>';
        return;
    }
    listEl.innerHTML = packages.map(packageHtml).join("");
}

function filtered() {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return allPackages;
    return allPackages.filter((p) => (p.label + " " + (p.npmName || "")).toLowerCase().includes(keyword));
}

async function loadCatalog() {
    const listEl = $("#packageList");
    listEl.innerHTML = '<div class="card empty-hint">Katalog yükleniyor...</div>';
    try {
        const [cat, status] = await Promise.all([
            window.ajan.invoke({ method: "pmCatalog" }),
            window.ajan.invoke({ method: "pmStatus" }).catch(() => null)
        ]);
        allPackages = (cat && Array.isArray(cat.packages)) ? cat.packages : [];
        const appVer = status?.appVersion;
        $("#subtitle").textContent = `Siber Paket Yöneticisi · sürüm ${appVer ?? "—"}`;
        const src = $("#catalogSource");
        if (src) src.textContent = cat?.source === "local" ? "(yerel katalog kopyası)" : "";
        drawList(filtered());
    } catch (err) {
        listEl.innerHTML = `<div class="card empty-hint">Katalog alınamadı: ${esc(err?.message ?? err)}</div>`;
    }
}

async function runInstall(id, btn) {
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "Kuruluyor...";
    try {
        const r = await window.ajan.invoke({ method: "pmInstallPackage", id });
        showToast(r?.ok ? `${r.label || "Paket"} hazır` : (r?.error ?? "Kurulum başarısız"), !!r?.ok);
    } catch (err) {
        showToast(`İşlem hatası: ${err?.message ?? err}`, false);
    } finally {
        btn.disabled = false;
        btn.textContent = old;
        void loadCatalog();
    }
}

function bind() {
    $("#searchInput").addEventListener("input", (e) => {
        searchTerm = e.target.value;
        drawList(filtered());
    });

    $("#packageList").addEventListener("click", (e) => {
        const btn = e.target.closest(".pkg-act");
        if (btn) void runInstall(btn.dataset.id, btn);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    bind();
    void loadCatalog();
});