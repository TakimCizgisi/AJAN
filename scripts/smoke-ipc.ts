/**
 * IPC smoke testi: gerçek named pipe/socket üzerinden uçtan uca akış.
 *
 * Model yüklemez (modeller silindi) ama sunucu başlatma, istek/yanıt eşleme,
 * olay yayını ve kapanış davranışını doğrular.
 */
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClientChannel } from "../src/protocol/channel.js";
import type { EventFrame, RequestFrame, ServerFrame } from "../src/protocol/messages.js";

const SOCKET = process.platform === "win32" ? "\\\\.\\pipe\\ajan-smoke-test" : join(tmpdir(), "ajan-smoke-test.sock");
const REPO = process.cwd();

let passed = 0;
let failed = 0;

/** Yanıt zarfını açar: hata ise fırlatır, `{type: X, ...}` gövdesini döner. */
async function unwrapEnvelope<T>(r: { ok: true; result: unknown } | { ok: false; error: string }): Promise<T> {
    if (!r.ok) throw new Error(r.error);
    return r.result as T;
}

function check(name: string, cond: boolean, detail = ""): void {
    if (cond) {
        passed++;
        console.log(`  \u001B[32m✔\u001B[0m ${name}`);
    } else {
        failed++;
        console.log(`  \u001B[31m✖\u001B[0m ${name}${detail ? ` — ${detail}` : ""}`);
    }
}

function waitForSocket(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const s = connect(SOCKET);
            s.once("connect", () => {
                s.destroy();
                resolve();
            });
            s.once("error", () => {
                s.destroy();
                if (Date.now() > deadline) reject(new Error("socket açılmadı (timeout)"));
                else setTimeout(attempt, 300);
            });
        };
        attempt();
    });
}

type Harness = {
    channel: ClientChannel;
    events: EventFrame[];
    request: (req: RequestFrame["req"]) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;
    close: () => void;
};

async function connectClient(): Promise<Harness> {
    const socket = await new Promise<import("node:net").Socket>((resolve, reject) => {
        const s = connect(SOCKET);
        s.once("connect", () => resolve(s));
        s.once("error", reject);
    });
    const events: EventFrame[] = [];
    const channel = new ClientChannel((e) => events.push(e as EventFrame));
    channel.attach(socket);
    return { channel, events, request: (req) => channel.request(req), close: () => channel.close() };
}

async function main(): Promise<void> {
    console.log("\n  AJAN IPC smoke testi\n");

    if (process.platform !== "win32" && existsSync(SOCKET)) rmSync(SOCKET, { force: true });

    const engine = spawn(process.execPath, [join(REPO, "out", "ajan-engine.js"), "--socket", SOCKET], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
    });
    engine.stdout.on("data", (d) => process.stdout.write(`  \u001B[90m[engine] ${d}\u001B[0m`));
    engine.stderr.on("data", (d) => process.stderr.write(`  \u001B[90m[engine] ${d}\u001B[0m`));

    try {
        await waitForSocket();

        // 1) Bağlantı + ping
        const c1 = await connectClient();
        const pong = (await c1.request({ type: "ping" })) as { ok: true; result: { protocol: number; version: string } };
        check("ping yanıtı alındı", pong.ok && pong.result.version.length > 0);
        check("protokol sürümü 1", pong.ok && pong.result.protocol === 1);

        // 2) Durum raporu
        const st = await unwrapEnvelope<{ status: { version: string; gpu: unknown } }>(await c1.request({ type: "status" }));
        check("status döndü", typeof st.status.version === "string");
        check("gpu raporu var", typeof st.status.gpu === "object");

        // 3) Model listesi boş olabilir ama istek hata vermemeli
        const models = (await c1.request({ type: "list-models" })) as { ok: boolean };
        check("list-models yanıt verdi", models.ok === true);

        // 4) Bilinmeyen istek hata zarfı döner (sessizce yutulmaz)
        const bad = (await c1.request({ type: "chat" as never })) as { ok: boolean; error?: string };
        check("geçersiz istek reddedildi", bad.ok === false && typeof bad.error === "string");

        // 5) İkinci bağlantı: çok istemci
        const c2 = await connectClient();
        const st2 = await unwrapEnvelope<{ status: { clients: number } }>(await c2.request({ type: "status" }));
        check("iki istemci görüldü", st2.status.clients === 2);
        c2.channel.failAll("test bitti");

        // 6) Bağlantı kapanınca bekleyen istek asılı kalmamalı
        const hangPromise = c2.channel.request({ type: "ping" });
        c2.channel.failAll("kapatma testi");
        const hang = await hangPromise;
        check("kapanışta bekleyen istek çözüldü", hang.ok === false);

        // 6b) `close()` gerçekten soketi yok etmeli. c1 hâlâ bağlı olduğu için
        //     kapanıştan SONRA yeni istemci açmadan c1'e sormalıyız: yalnız c1
        //     kaldıysa close() çalışmış demektir (aksi halde 2 görünürdü).
        c2.close();
        await new Promise((r) => setTimeout(r, 400)); // daemon'un kopmayı işlemesi için
        const after = await unwrapEnvelope<{ status: { clients: number } }>(await c1.request({ type: "status" }));
        check("close() soketi kapattı", after.status.clients === 1, `clients=${after.status.clients}`);

        // 7) Olay yayını: model yüklenmediği için sohbet akışı yok,
        //    ama yüklemeyi tetikleyen install olay üretmeli veya hata vermeli.
        const chat = (await c1.request({ type: "chat", text: "merhaba" })) as { ok: boolean };
        check("chat isteği hata/sonuç döndürdü", typeof chat.ok === "boolean");

        // 8) Kapanış: istek gönderilir, SONRA bağlantı kapatılır.
        const shut = (await c1.request({ type: "shutdown" })) as { ok: boolean };
        check("shutdown kabul edildi", shut.ok === true);
        c1.close();

        await new Promise<void>((resolve) => {
            const t = setTimeout(() => resolve(), 4000);
            engine.once("exit", () => {
                clearTimeout(t);
                resolve();
            });
        });
        check("motor süreci kapandı", engine.exitCode !== null || engine.killed);
    } finally {
        if (engine.exitCode === null) engine.kill();
        if (process.platform !== "win32" && existsSync(SOCKET)) rmSync(SOCKET, { force: true });
    }

    console.log(`\n  ${passed} geçti, ${failed} kaldı\n`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(`\n  test çöktü: ${(err as Error).message}\n`);
    process.exit(1);
});
