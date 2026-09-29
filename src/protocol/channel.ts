/**
 * Newline-JSON çerçeveleme.
 *
 * `net.Socket`, `worker_threads` veya `process.stdin` gibi herhangi bir ikili
 * akışı üzerinde çalışır. Yazma tarafı parçalara bölünebilir, okuma tarafı
 * parça sınırlarından bağımsız olarak satır birleştirir.
 */
import type { RequestFrame, ServerFrame } from "./messages.js";

/** Yazılabilir akış: net.Socket veya benzeri herhangi bir duplex bağlantı */
type Writable = NodeJS.ReadWriteStream & { write: (chunk: string) => unknown };

/** Windows named pipe yolu; POSIX'te XDG_RUNTIME_DIR (yoksa tmp) kullanılır. */
export function defaultSocketPath(app = "ajan-engine"): string {
    if (process.platform === "win32") return `\\\\.\\pipe\\${app}`;
    const dir = process.env.XDG_RUNTIME_DIR || "/tmp";
    return `${dir}/${app}.sock`;
}

/**
 * Sunucu tarafı: bağlantıdan satır satır okur, `onRequest` çağırır.
 * Yazmak için `send` döner.
 */
export function serveChannel(
    socket: Writable,
    onRequest: (frame: RequestFrame, socket: Writable) => void,
    onError?: (err: Error) => void
): void {
    let buffer = "";
    socket.setEncoding?.("utf8");
    socket.on("data", (chunk: string | Buffer) => {
        buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
        // Normalde tek satır gelir; uzun yazılar (diff, patch) bölünmüş gelebilir.
        let index = buffer.indexOf("\n");
        while (index !== -1) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (line.length > 0) {
                try {
                    const parsed = JSON.parse(line) as unknown;
                    onRequest(parsed as RequestFrame, socket);
                } catch (err) {
                    onError?.(new Error(`bozuk JSON: ${(err as Error).message}`));
                }
            }
            index = buffer.indexOf("\n");
        }
    });
    socket.on("error", (err) => onError?.(err as Error));
}

export function send(socket: Writable, frame: ServerFrame | RequestFrame): void {
    socket.write(JSON.stringify(frame) + "\n");
}

/**
 * İstemci tarafı: yanıt ve olayları ayırır, `id` eşleşen isteğe çözer.
 * Bağlantı kurulmadan bağımsız çalışır; bağlanmayı `connect` yapar.
 */
export class ClientChannel {
    private buffer = "";
    private nextId = 1;
    private socket: Writable | undefined;
    private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

    constructor(
        private readonly onEvent: (e: Extract<ServerFrame, { event: string }>) => void,
        private readonly onClose: (reason?: Error) => void = () => {}
    ) {}

    /** Sokete bağlar ve akışı dinlemeye başlar. */
    attach(socket: Writable): void {
        this.socket = socket;
        socket.setEncoding?.("utf8");
        socket.on("data", (chunk: string | Buffer) => this.feed(typeof chunk === "string" ? chunk : chunk.toString("utf8")));
        socket.on("error", (err) => {
            // Koptuk: bekleyen istekler sonsuza kadar asılı kalmasın.
            this.failAll((err as Error).message);
            this.onClose(err as Error);
        });
        socket.on("close", () => {
            this.failAll("bağlantı kapandı");
            this.onClose();
        });
    }

    /**
     * Bağlantıyı kapatır ve bekleyen istekleri reddeder.
     *
     * `end` tek yönlü kapatır; istek yazan taraf da soketi kapatabilsin diye
     * varsa `destroy` ile tamamen yok edilir. Zaten kapanmışsa bir şey yapılmaz.
     */
    close(): void {
        this.failAll("istemci kapatildi");
        const socket = this.socket as (Writable & { destroy?: () => void }) | undefined;
        this.socket = undefined;
        socket?.destroy?.();
    }

    request(req: RequestFrame["req"]): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
        if (!this.socket) return Promise.resolve({ ok: false, error: "kanal bağlı değil" });
        const id = this.nextId++;
        return new Promise((resolve) => {
            // Kopma halinde asılı kalmayalım: reject değil, hata çözülür.
            this.pending.set(id, {
                resolve: resolve as (v: unknown) => void,
                reject: (e) => resolve({ ok: false, error: e.message })
            });
            this.socket!.write(JSON.stringify({ id, req } satisfies RequestFrame) + "\n");
        });
    }

    private feed(text: string): void {
        this.buffer += text;
        let index = this.buffer.indexOf("\n");
        while (index !== -1) {
            const line = this.buffer.slice(0, index).trim();
            this.buffer = this.buffer.slice(index + 1);
            if (line.length > 0) this.handle(line);
            index = this.buffer.indexOf("\n");
        }
    }

    private handle(line: string): void {
        let frame: unknown;
        try {
            frame = JSON.parse(line);
        } catch {
            return; // bozuk satırı yoksay; bağlantıyı düşürme
        }
        const f = frame as { id?: number; event?: string };
        if (typeof f.event === "string") {
            this.onEvent(frame as Extract<ServerFrame, { event: string }>);
            return;
        }
        if (typeof f.id === "number") {
            const entry = this.pending.get(f.id);
            if (!entry) return;
            this.pending.delete(f.id);
            const r = frame as { ok: true; result: unknown } | { ok: false; error: string };
            if (r.ok) entry.resolve({ ok: true, result: r.result });
            else entry.resolve({ ok: false, error: r.error });
        }
    }

    /** Bağlantı koparken bekleyen istekleri reddet; çağıran takılmasın. */
    failAll(error: string): void {
        for (const [, entry] of this.pending) entry.reject(new Error(error));
        this.pending.clear();
    }
}
