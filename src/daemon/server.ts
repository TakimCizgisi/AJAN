/**
 * IPC sunucusu: named pipe / unix socket üzerinden dinler, istekleri `Runner`'a
 * yönlendirir, motor olaylarını tüm bağlı istemcilere yayar.
 *
 * Bağlantı başına ayrı oturum durumu tutulur; model ise tek ve paylaşılan.
 */
import { createServer, type Server, type Socket } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { defaultSocketPath, send, serveChannel } from "../protocol/channel.js";
import { isRequestFrame, type Result, type ServerFrame } from "../protocol/messages.js";
import { AJAN_VERSION } from "../version.js";
import { PROTOCOL_VERSION } from "../protocol/messages.js";
import type { Runner } from "./runner.js";
import { logger } from "../utils/paths.js";

/** İstemcinin kopmasından kaynaklanan, loglanmaya değmeyen hatalar. */
function isDisconnect(err: Error): boolean {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EPIPE" || code === "ECONNRESET" || code === "ERR_STREAM_DESTROYED";
}

export class DaemonServer {
    private readonly server: Server;
    private readonly sockets = new Set<Socket>();
    private closing = false;

    constructor(
        private readonly runner: Runner,
        private readonly socketPath: string = defaultSocketPath()
    ) {
        this.server = createServer((socket) => this.accept(socket));
    }

    get path(): string {
        return this.socketPath;
    }

    get clientCount(): number {
        return this.sockets.size;
    }

    /** Sunucuyu dinlemeye başlar; eski socket artığını temizler. */
    listen(): Promise<void> {
        // POSIX'te çökmüş bir daemon bırakırsa socket dosyası kalır ve
        // "EADDRINUSE" verir; sahipsizse güvenle silinebilir.
        if (process.platform !== "win32" && existsSync(this.socketPath)) {
            try {
                unlinkSync(this.socketPath);
            } catch {
                /* başka bir süreç kullanıyorsa dokunma */
            }
        }
        return new Promise((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(this.socketPath, () => {
                this.server.removeListener("error", reject);
                logger.info(`AJAN motoru dinliyor: ${this.socketPath}`);
                resolve();
            });
        });
    }

    private accept(socket: Socket): void {
        this.sockets.add(socket);
        const write = (frame: ServerFrame) => {
            if (socket.destroyed) return;
            // İstemci kapanmak normaldir (kapanış yarışı, `close()` çağrısı).
            // Yazma hatası kullanıcıyı rahatsız edecek gürültü yaratmasın; soket
            // zaten `close` dinleyicisinde temizleniyor.
            try {
                send(socket, frame);
            } catch {
                /* bağlantı koptu */
            }
        };
        // Olaylar tüm istemcilere gider: motor tek, sohbetler ayrı değil.
        // (İleride oturum bazlı yönlendirme gerekiyorsa burada hedeflenir.)
        const unsubscribe = this.runner.subscribe(write);

        serveChannel(
            socket,
            (frame) => {
                const valid = acceptFrame(frame);
                if (!valid) {
                    logger.warn("geçersiz istek zarfı yok sayıldı");
                    return;
                }
                void this.dispatch(valid, write);
            },
            (err) => {
                if (isDisconnect(err)) return; // EPIPE/ECONNRESET: normal kapanış
                logger.warn(`kanal hatası: ${err.message}`);
            }
        );

        socket.on("close", () => {
            unsubscribe();
            this.sockets.delete(socket);
            logger.debug(`istemci ayrıldı (kalan: ${this.sockets.size})`);
        });
        socket.on("error", () => socket.destroy());
        logger.debug(`istemci bağlandı (toplam: ${this.sockets.size})`);
    }

    private async dispatch(frame: { id: number; req: { type: string } & Record<string, unknown> }, write: (f: ServerFrame) => void): Promise<void> {
        const id = frame.id;
        const req = frame.req;
        const reply = (ok: true, result: Result) => write({ id, ok, result });
        const fail = (error: string) => write({ id, ok: false, error });

        try {
            switch (req.type) {
                case "ping": {
                    reply(true, { type: "pong", protocol: PROTOCOL_VERSION, version: AJAN_VERSION });
                    break;
                }
                case "status":
                    reply(true, { type: "status", status: await this.runner.status() });
                    break;
                case "set-config": {
                    await this.runner.setConfig(req.patch as Record<string, unknown>);
                    reply(true, { type: "config", config: this.runner.instance.getConfig() });
                    break;
                }
                case "list-models": {
                    const models = this.runner.listModels().map((m) => ({ ...m.model, path: m.path, installed: m.installed, active: m.active }));
                    reply(true, { type: "models", models });
                    break;
                }
                case "install-model": {
                    const r = await this.runner.installModel(req.id as string);
                    reply(true, { type: "model", id: String(req.id), ok: r.ok, error: r.error });
                    break;
                }
                case "remove-model": {
                    const r = await this.runner.removeModel(req.id as string);
                    reply(true, { type: "model", id: String(req.id), ok: r.ok, error: r.error });
                    break;
                }
                case "use-model": {
                    const r = await this.runner.useModel(req.id as string);
                    reply(true, { type: "model", id: String(req.id), ok: r.ok, error: r.error });
                    break;
                }
                case "refresh-models": {
                    const r = await this.runner.refreshModels();
                    reply(true, { type: "models-refreshed", ok: r.ok, count: r.count ?? 0, error: r.error });
                    break;
                }
                case "chat": {
                    // Asıl yanıt akışla gelir (text-chunk/complete olayları).
                    // Bu kanal yalnızca görevin bittiğini teyit eder; başarısızlık
                    // durumunda hata zarfı döner, aksi halde istemci asılı kalırdı.
                    // Sohbet çıktısı yalnızca soran bağlantıya gider (`write`),
                    // diğer istemcilere sızmasın.
                    const r = await this.runner.sendMessage(String(req.text ?? ""), req.modelId as string | undefined, write);
                    if (!r.ok) fail(r.error ?? "görev başarısız");
                    else reply(true, { type: "ok" });
                    break;
                }
                case "abort":
                    this.runner.abort();
                    reply(true, { type: "ok" });
                    break;
                case "new-chat": {
                    await this.runner.reset();
                    reply(true, { type: "ok" });
                    break;
                }
                case "get-history":
                    reply(true, { type: "history", messages: this.runner.getHistory() });
                    break;
                case "list-sessions": {
                    const sessions = await this.runner.listSessions();
                    reply(true, {
                        type: "sessions",
                        sessions: sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
                    });
                    break;
                }
                case "load-session": {
                    const session = await this.runner.loadSession(String(req.id));
                    reply(true, { type: "session", session, ok: session != null });
                    break;
                }
                case "save-session": {
                    await this.runner.saveSession(req.session as never);
                    reply(true, { type: "ok" });
                    break;
                }
                case "delete-session": {
                    await this.runner.deleteSession(String(req.id));
                    reply(true, { type: "ok" });
                    break;
                }
                case "shutdown": {
                    reply(true, { type: "shutdown", ok: true });
                    void this.close();
                    break;
                }
                default:
                    fail(`bilinmeyen istek: ${String(req.type)}`);
            }
        } catch (err) {
            fail((err as Error).message);
        }
    }

    async close(): Promise<void> {
        if (this.closing) return;
        this.closing = true;
        for (const socket of this.sockets) socket.end();
        this.sockets.clear();
        await new Promise<void>((resolve) => this.server.close(() => resolve()));
        await this.runner.dispose();
        if (process.platform !== "win32" && existsSync(this.socketPath)) {
            try {
                unlinkSync(this.socketPath);
            } catch {
                /* temizlik başarısız olsa da çıkışı engellememeli */
            }
        }
    }
}

/** İstek zarfının gerçekten geçerli olduğunu doğrular; geçersizse null döner. */
export function acceptFrame(value: unknown): { id: number; req: { type: string } & Record<string, unknown> } | null {
    if (!isRequestFrame(value)) return null;
    const f = value as { id: number; req: { type: string } & Record<string, unknown> };
    return f;
}
