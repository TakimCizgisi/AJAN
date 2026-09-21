import { randomUUID } from "node:crypto";
import { Client } from "@xhayper/discord-rpc";
import type { SetActivity } from "@xhayper/discord-rpc";
import { logger } from "../utils/paths.js";
import type { DiscordConfig } from "../config/types.js";

export type PresencePhase =
    | "idle"       // AJAN açık, oturum yok
    | "chat"       // sohbet/görev yürütülüyor
    | "thinking"   // model düşünüyor
    | "loading"    // model yükleniyor
    | "error";     // hata oluştu

const PHASE_TIME_KEY: Record<PresencePhase, number> = {
    idle: 0,
    chat: 0,
    thinking: 0,
    loading: 0,
    error: 0
};

/**
 * AJAN etkinliklerini Discord Rich Presence'a (profildeki "Oynuyor" alanı)
 * dönüştürür. Discord masaüstü uygulaması çalışıyorken IPC üzerinden bağlanır.
 *
 * Kullanım: config.json içinde `discord.enabled = true` ve `discord.clientId`
 * ayarlanmalıdır. Client ID, https://discord.com/developers/applications
 * adresinden alınır; görseller Rich Presence > Art Assets sekmesine yüklenir.
 */
export class DiscordPresence {
    private client: Client | null = null;
    private config: DiscordConfig;
    private readonly phaseTime: Record<PresencePhase, number> = { ...PHASE_TIME_KEY };
    private sessionStartedAt: number | null = null;
    private sessionTitle = "";
    private currentTool: string | null = null;
    private currentStep = 0;
    private maxSteps = 0;
    private lastError: string | null = null;
    private thinkingText = "";
    private lastToolCallAt = 0;
    private loadingPercent: number | null = null;
    private partyId: string | null = null;
    private joinSecret: string | null = null;
    private spectateSecret: string | null = null;
    private connected = false;
    private disposed = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeat: ReturnType<typeof setInterval> | null = null;
    private reconnectAttempt = 0;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private lastErrorLogAt = 0;
    private lastErrorLogMsg = "";

    constructor(config: DiscordConfig) {
        this.config = {
            enabled: config.enabled ?? false,
            clientId: config.clientId ?? "",
            transport: config.transport ?? "ipc",
            showToolCalls: config.showToolCalls ?? true,
            showThinking: config.showThinking ?? false,
            largeImageKey: config.largeImageKey ?? "ajan-logo",
            largeImageText: config.largeImageText ?? "AJAN AI",
            smallImageKeys: config.smallImageKeys ?? {}
        };
        this.markPhase("idle");
    }

    get isEnabled(): boolean {
        return this.config.enabled === true && !!this.config.clientId;
    }

    get isConnected(): boolean {
        return this.connected;
    }

    /** Discord IPC'ye bağlanır; başarısız olursa sessizce devam eder. */
    async connect(): Promise<boolean> {
        if (!this.isEnabled || this.disposed) return false;
        if (this.connected) return true;
        try {
            this.client = new Client({
                clientId: this.config.clientId!,
                transport: { type: this.config.transport ?? "websocket" }
            });

            this.client.on("connected", () => {
                this.connected = true;
                logger.info("Discord Rich Presence bağlandı.");
            });
            this.client.on("ready", () => {
                this.connected = true;
                void this.scheduleRefresh();
            });
            this.client.on("disconnected", () => {
                this.connected = false;
                logger.debug("Discord Rich Presence bağlantısı koptu.");
                void this.reconnect();
            });

            await this.client.connect();
            // Kullanıcı oturumu (RPC HELLO/READY) hazır olana kadar bekle; ancak
            // o zaman `client.user` set olur ve aktivite gönderilebilir.
            // 5 sn içinde READY gelmezse askıda kalmadan devam et.
            if (!this.client.user) {
                await Promise.race([
                    new Promise<void>((resolve) => this.client!.once("ready", () => resolve())),
                    new Promise<void>((resolve) => setTimeout(resolve, 5000))
                ]);
            }
            this.connected = true;
            await this.flushRefresh();
            this.startHeartbeat();
            return this.connected;
        } catch (err) {
            this.connected = false;
            logger.debug(`Discord Rich Presence bağlanamadı: ${(err as Error).message}`);
            void this.reconnect();
            return false;
        }
    }

    async disconnect(): Promise<void> {
        this.disposed = true;
        this.stopTimers();
        if (this.client) {
            try {
                await this.client.destroy();
            } catch {
                /* yoksay */
            }
            this.client = null;
        }
        this.connected = false;
    }

    /** Bağlantı koptuğunda üstel gecikmeyle yeniden bağlanmayı dener. */
    private async reconnect(): Promise<void> {
        if (this.disposed) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        const delay = Math.min(30_000, 2000 * 2 ** this.reconnectAttempt);
        this.reconnectTimer = setTimeout(() => {
            void (async () => {
                if (this.disposed) return;
                try {
                    await this.client?.destroy();
                } catch {
                    /* yoksay */
                }
                this.client = null;
                this.connected = false;
                const ok = await this.connect();
                if (ok) {
                    this.reconnectAttempt = 0;
                } else {
                    void this.reconnect();
                }
            })();
        }, delay);
    }

    /** Activity'yi Discord ile canlı tutmak için düzenli tazeleme. */
    private startHeartbeat(): void {
        if (this.heartbeat) return;
        this.heartbeat = setInterval(() => {
            if (this.connected && this.client?.user && !this.disposed) {
                void this.scheduleRefresh();
            }
        }, 45_000);
        this.heartbeat.unref?.();
    }

    private stopTimers(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    // ── Durum güncellemeleri ──

    onSessionStart(title: string): void {
        this.sessionStartedAt = Date.now();
        this.sessionTitle = title.trim() || "Yeni Sohbet";
        this.thinkingText = "";
        this.currentTool = null;
        this.currentStep = 0;
        this.maxSteps = 0;
        this.lastError = null;
        // Oyun daveti/katılımı için her oturuma özel party anahtarları üret.
        this.partyId = randomUUID();
        this.joinSecret = randomUUID();
        this.spectateSecret = randomUUID();
        this.markPhase("chat");
        void this.scheduleRefresh();
    }

    onSessionEnd(): void {
        this.sessionStartedAt = null;
        this.sessionTitle = "";
        this.thinkingText = "";
        this.currentTool = null;
        this.currentStep = 0;
        this.maxSteps = 0;
        this.lastError = null;
        this.partyId = null;
        this.joinSecret = null;
        this.spectateSecret = null;
        this.markPhase("idle");
        void this.scheduleRefresh();
    }

    onThinking(text: string): void {
        if (!this.config.showThinking || this.disposed) return;
        this.thinkingText = text.slice(0, 120);
        this.markPhase("thinking");
        void this.scheduleRefresh();
    }

    onToolCall(name: string): void {
        if (this.disposed) return;
        this.currentTool = name;
        if (this.config.showThinking) this.thinkingText = "";
        this.markPhase("chat");
        this.lastToolCallAt = Date.now();
        void this.scheduleRefresh();
    }

    onToolResult(): void {
        if (this.disposed) return;
        this.currentTool = null;
        // Araç sonucunda düşünce moduna dönme; bir sonraki tur beklentisi.
        void this.scheduleRefresh();
    }

    onStepStart(step: number, maxSteps: number): void {
        if (this.disposed) return;
        this.currentStep = step;
        this.maxSteps = maxSteps;
        this.markPhase("chat");
        void this.scheduleRefresh();
    }

    onComplete(): void {
        if (this.disposed) return;
        this.currentTool = null;
        this.thinkingText = "";
        this.markPhase("chat");
        void this.scheduleRefresh();
    }

    onError(message: string): void {
        if (this.disposed) return;
        this.lastError = message.slice(0, 120);
        this.markPhase("error");
        void this.scheduleRefresh();
    }

    onModelLoadProgress(pct: number): void {
        if (this.disposed) return;
        this.loadingPercent = pct;
        this.markPhase("loading");
        void this.scheduleRefresh();
    }

    onModelLoadComplete(): void {
        if (this.disposed) return;
        this.loadingPercent = null;
        this.markPhase("idle");
        void this.scheduleRefresh();
    }

    onTextChunk(text: string): void {
        if (this.disposed || !this.config.showThinking) return;
        // Akış halindeki son metni durumda kısa tutarız.
        this.thinkingText = text.replace(/\s+/g, " ").slice(0, 120);
        this.markPhase("chat");
        void this.scheduleRefresh();
    }

    // ── Etkinlik üretimi ──

    private markPhase(phase: PresencePhase): void {
        this.phaseTime[phase] = Date.now();
    }

    private buildActivity(): SetActivity {
        const cfg = this.config;
        const small = cfg.smallImageKeys ?? {};

        const base: SetActivity = {
            type: 0, // Playing
            name: "AJAN AI",
            largeImageKey: cfg.largeImageKey,
            largeImageText: cfg.largeImageText ?? "AJAN AI"
        };

        if (this.sessionStartedAt) {
            base.startTimestamp = this.sessionStartedAt;
        }

        // Oyun daveti / katılım arayüzü: oturum aktifken party + join/spectate.
        if (this.partyId && this.joinSecret) {
            base.partyId = this.partyId;
            base.partySize = 1;
            base.partyMax = 4;
            base.joinSecret = this.joinSecret;
            base.spectateSecret = this.spectateSecret ?? undefined;
        }

        // GitHub benzeri buton (config'de url doluysa göster)
        const btn = cfg.buttons ?? {};
        if (btn.url && btn.url.trim()) {
            base.buttons = [
                {
                    label: btn.label?.trim() || "GitHub",
                    url: btn.url.trim()
                }
            ];
        }

        // Durum metnini hazırla
        let details: string;
        let state: string | undefined;
        let smallImageKey: string | undefined;
        let smallImageText: string | undefined;

        if (this.loadingPercent != null) {
            details = "Model yükleniyor";
            state = `%${Math.round(this.loadingPercent)}`;
            smallImageKey = small.loading;
            smallImageText = "Model yükleniyor";
        } else if (this.lastError) {
            details = "Hata oluştu";
            state = this.lastError;
            smallImageKey = small.error;
            smallImageText = "Hata";
        } else if (this.thinkingText && this.config.showThinking) {
            details = "Düşünüyor...";
            state = this.thinkingText;
            smallImageKey = small.task;
            smallImageText = "Düşünüyor";
        } else if (this.currentTool) {
            details = "Görev yürütülüyor";
            const showTool = cfg.showToolCalls !== false;
            state = showTool
                ? this.currentStep > 0
                    ? `Adım ${this.currentStep}/${this.maxSteps} · ${this.currentTool}`
                    : this.currentTool
                : undefined;
            smallImageKey = small.task;
            smallImageText = "Araç kullanılıyor";
        } else if (this.sessionTitle) {
            details = "Sohbet modunda";
            state = this.sessionTitle;
            smallImageKey = small.chat;
            smallImageText = "Oturum açık";
        } else {
            details = "Oturum bekleniyor";
            state = undefined;
            smallImageKey = small.idle;
            smallImageText = "Hazır";
        }

        if (details) base.details = details;
        if (state) base.state = state;
        if (smallImageKey) base.smallImageKey = smallImageKey;
        if (smallImageText) base.smallImageText = smallImageText;

        return base;
    }

    /** Son durum değişikliğini 250ms'de bir tek sefere birleştirir (fırtına önleyici). */
    private scheduleRefresh(): void {
        if (this.disposed) return;
        if (this.refreshTimer) return;
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            void this.flushRefresh();
        }, 250);
    }

    /** Aktiviteyi Discord'a gönderir; hata durumunu (tekrarı kısıtlanmış şekilde) yutar. */
    private async flushRefresh(): Promise<void> {
        if (this.disposed) return;
        if (!this.connected || !this.client?.user) return;
        try {
            await this.client.user.setActivity(this.buildActivity());
        } catch (err) {
            const msg = (err as Error).message;
            const now = Date.now();
            if (now - this.lastErrorLogAt > 5000 || msg !== this.lastErrorLogMsg) {
                this.lastErrorLogAt = now;
                this.lastErrorLogMsg = msg;
                logger.debug(`Discord aktivite güncellenemedi: ${msg}`);
            }
        }
    }

    /** Açık oturum yokken "boşta" durumunu göster. */
    async showIdle(): Promise<void> {
        this.markPhase("idle");
        await this.flushRefresh();
    }
}
