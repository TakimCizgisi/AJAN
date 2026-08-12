/**
 * ============================================================
 * 
 *   AJAN
 *   Copyright (C) 2026 TakımÇizgisi
 *   Tüm hakları saklıdır.
 * 
 * ============================================================
 * 
 *   BU KODU YAZANLAR:
 * 
 *   ┌──────┬──────────────────────┬─────────────────────────┐
 *   │ No   │ Yazar Adı            │ Görev/Rol               │
 *   ├──────┼──────────────────────┼─────────────────────────┤
 *   │  1   │ İbrahim Anadol       │ Direkt Tüm Sistem       │
 *   │      │ (@ibrahimanadol)     │ (Ana Fikir Sahibi)      │
 *   │      │ GitHub'da            │                         │
 *   └──────┴──────────────────────┴─────────────────────────┘
 * 
 *   Son Güncelleme: 11.08.2026
 *   Versiyon: 1.0.0
 * 
 * ============================================================
 */
import chalk from "chalk";
import { emitKeypressEvents } from "node:readline";

export type ChatTuiOptions = {
    onInput: (line: string) => void;
    onAbort: () => void;
    onExit: () => void;
    onModeCycle?: () => void;
    onCommand?: (cmd: string, arg: string) => void;
};

type Message =
    | { kind: "user"; text: string }
    | { kind: "assistant"; text: string }
    | { kind: "info"; text: string }
    | { kind: "tool"; name: string; state: "running" | "done" | "error"; startedAt: number; elapsed: number; output?: string };

type Mode = "idle" | "loading" | "thinking" | "tool";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const BAR_FRAMES = [
    "[>       ]",
    "[=>      ]",
    "[==>     ]",
    "[===>    ]",
    "[====>   ]",
    "[=====>  ]",
    "[======> ]",
    "[=======>]",
    "[========]"
] as const;
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const formatElapsed = (ms: number): string =>
    ms < 1000 ? `${(ms / 1000).toFixed(1)}sn` : `${Math.round(ms / 1000)}sn`;

const COMMANDS = [
    { name: "mode", desc: "mod değiştir: chat, plan, build, devamlılık" },
    { name: "clear", desc: "konuşma geçmişini temizle" },
    { name: "exit", desc: "çıkış yap" },
    { name: "help", desc: "komutları listele" }
] as const;

export class ChatTui {
    private readonly options: ChatTuiOptions;
    private messages: Message[] = [];
    private mode: Mode = "idle";
    private buffer = "";
    private cursor = 0;
    private scrollOffset = 0;
    private history: string[] = [];
    private historyIndex = -1;
    private frame = 0;
    private timer: NodeJS.Timeout | null = null;
    private started = false;
    private loadPct = 0;
    private modeLabel = "Chat";
    private thinkingText = "";
    private showThinking = false;

    constructor(options: ChatTuiOptions) {
        this.options = options;
    }

    private get width(): number {
        return process.stdout.columns ?? 80;
    }

    private get height(): number {
        return process.stdout.rows ?? 24;
    }

    start(): void {
        if (this.started) return;
        this.started = true;
        process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
        process.once("exit", () => {
            process.stdout.write("\x1b[?25h\x1b[0m\x1b[?1049l");
        });
        emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.on("keypress", this.handleKey);
        process.stdout.on("resize", this.render);
        this.timer = setInterval(() => {
            this.frame++;
            if (this.mode !== "idle") this.render();
        }, 100);
        this.render();
    }

    stop(): void {
        if (!this.started) return;
        this.started = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        process.stdin.removeListener("keypress", this.handleKey);
        process.stdout.removeListener("resize", this.render);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdout.write("\x1b[?25h\x1b[0m\x1b[?1049l");
    }

    addUser(text: string): void {
        this.messages.push({ kind: "user", text });
        this.thinkingText = "";
        this.showThinking = false;
        this.follow();
        this.render();
    }

    appendThinking(text: string): void {
        if (!text) return;
        this.thinkingText += text;
        if (this.thinkingText.length > 6000) this.thinkingText = this.thinkingText.slice(-6000);
        if (this.showThinking) this.render();
    }

    appendAssistant(text: string): void {
        if (this.thinkingText) {
            this.thinkingText = "";
            this.showThinking = false;
        }
        const last = this.messages[this.messages.length - 1];
        if (last && last.kind === "assistant") {
            last.text += text;
        } else {
            this.messages.push({ kind: "assistant", text });
        }
        this.follow();
        this.render();
    }

    addInfo(text: string): void {
        this.messages.push({ kind: "info", text });
        this.follow();
        this.render();
    }

    setMode(label: string): void {
        this.modeLabel = label;
        this.render();
    }

    startTool(name: string): void {
        this.messages.push({ kind: "tool", name, state: "running", startedAt: Date.now(), elapsed: 0 });
        this.mode = "tool";
        this.follow();
        this.render();
    }

    endTool(name: string, ok: boolean, output?: string): void {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            const m = this.messages[i];
            if (m && m.kind === "tool" && m.name === name && m.state === "running") {
                m.state = ok ? "done" : "error";
                m.elapsed = Date.now() - m.startedAt;
                m.output = output;
                break;
            }
        }
        this.mode = "thinking";
        this.render();
    }

    setLoading(pct: number): void {
        this.loadPct = pct;
        this.mode = "loading";
        this.render();
    }

    setThinking(): void {
        this.mode = "thinking";
        this.render();
    }

    endTurn(): void {
        for (const m of this.messages) {
            if (m.kind === "tool" && m.state === "running") {
                m.state = "error";
                m.elapsed = Date.now() - m.startedAt;
            }
        }
        this.mode = "idle";
        this.render();
    }

    private follow(): void {
        if (this.scrollOffset === 0) return;
        this.scrollOffset = 0;
    }

    private readonly handleKey = (
        str: string | undefined,
        key: { name?: string; ctrl?: boolean } | undefined
    ): void => {
        if (!key) return;
        if (key.ctrl && key.name === "c") {
            this.options.onExit();
            return;
        }
        if (key.name === "escape") {
            if (this.mode !== "idle") {
                this.options.onAbort();
                return;
            }
            if (this.buffer.length > 0) {
                this.buffer = "";
                this.cursor = 0;
                this.render();
            }
            return;
        }
        if (this.mode === "thinking" && (key.name === "return" || key.name === "enter")) {
            this.showThinking = !this.showThinking;
            this.render();
            return;
        }
        if (this.mode !== "idle") return;

        switch (key.name) {
            case "tab": {
                this.options.onModeCycle?.();
                return;
            }
            case "return":
            case "enter": {
                const line = this.buffer;
                const trimmed = line.trim();
                this.buffer = "";
                this.cursor = 0;
                this.historyIndex = -1;
                if (trimmed.startsWith("/")) {
                    const space = trimmed.indexOf(" ");
                    const cmd = (space === -1 ? trimmed.slice(1) : trimmed.slice(1, space)).toLowerCase();
                    const arg = space === -1 ? "" : trimmed.slice(space + 1).trim();
                    if (this.options.onCommand) {
                        this.options.onCommand(cmd, arg);
                        return;
                    }
                }
                if (trimmed) this.history.push(trimmed);
                this.render();
                this.options.onInput(trimmed);
                return;
            }
            case "backspace": {
                if (this.cursor > 0) {
                    this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
                    this.cursor--;
                    this.render();
                }
                return;
            }
            case "delete": {
                if (this.cursor < this.buffer.length) {
                    this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
                    this.render();
                }
                return;
            }
            case "left": {
                if (this.cursor > 0) {
                    this.cursor--;
                    this.render();
                }
                return;
            }
            case "right": {
                if (this.cursor < this.buffer.length) {
                    this.cursor++;
                    this.render();
                }
                return;
            }
            case "home": {
                this.cursor = 0;
                this.render();
                return;
            }
            case "end": {
                this.cursor = this.buffer.length;
                this.render();
                return;
            }
            case "up": {
                this.navigateHistory(1);
                return;
            }
            case "down": {
                this.navigateHistory(-1);
                return;
            }
            case "pageup": {
                const step = Math.max(1, this.height - 2);
                this.scrollOffset += step;
                this.render();
                return;
            }
            case "pagedown": {
                const step = Math.max(1, this.height - 2);
                this.scrollOffset = Math.max(0, this.scrollOffset - step);
                this.render();
                return;
            }
        }

        if (typeof str === "string" && str.length > 0) {
            let inserted = str;
            let firstCode = inserted.charCodeAt(0);
            if (firstCode < 32) return;
            this.buffer = this.buffer.slice(0, this.cursor) + inserted + this.buffer.slice(this.cursor);
            this.cursor += inserted.length;
            this.render();
        }
    };

    private navigateHistory(dir: 1 | -1): void {
        if (this.history.length === 0) return;
        const newIndex = this.historyIndex + dir;
        if (newIndex < 0 || newIndex >= this.history.length) return;
        this.historyIndex = newIndex;
        const text = this.history[this.history.length - 1 - newIndex];
        this.buffer = text ?? "";
        this.cursor = this.buffer.length;
        this.render();
    }

    private readonly render = (): void => {
        if (!this.started) return;
        const width = Math.max(20, this.width);
        const height = Math.max(5, this.height);

        const lines: string[] = [];
        lines.push(this.renderStatus());
        if (this.mode === "thinking" && this.showThinking && this.thinkingText) {
            lines.push(chalk.dim("── düşünceler ──"));
            lines.push(...this.wrapColored("", chalk.dim(this.thinkingText), width));
        }
        for (const m of this.messages) lines.push(...this.renderMessage(m, width));

        const menu = this.commandMenu(width);
        const menuLines = menu?.length ?? 0;
        const bodyHeight = Math.max(1, height - 1 - menuLines);

        const maxScroll = Math.max(0, lines.length - bodyHeight);
        const offset = Math.min(this.scrollOffset, maxScroll);
        const startIdx = Math.max(0, lines.length - bodyHeight - offset);
        const visible: string[] = [];
        for (let i = startIdx; i < startIdx + bodyHeight; i++) {
            visible.push(lines[i] ?? "");
        }
        while (visible.length < bodyHeight) visible.push("");

        const input = this.renderInput(width);

        const out: string[] = ["\x1b[?25l\x1b[H"];
        for (let i = 0; i < bodyHeight; i++) {
            out.push(visible[i] ?? "");
            out.push("\x1b[K");
            if (i < bodyHeight - 1) out.push("\r\n");
        }
        if (menu) {
            for (const ml of menu) {
                out.push("\r\n");
                out.push(ml);
                out.push("\x1b[K");
            }
        }
        out.push("\r\n");
        out.push(input.line);
        out.push("\x1b[K");
        out.push(`\x1b[${height};${input.cursorCol + 1}H\x1b[?25h`);
        process.stdout.write(out.join(""));
    };

    private commandMenu(width: number): string[] | null {
        const line = this.buffer.trimStart();
        if (!line.startsWith("/")) return null;
        const space = line.indexOf(" ");
        const term = (space === -1 ? line.slice(1) : line.slice(1, space)).toLowerCase();
        const matching = COMMANDS.filter((c) => c.name.startsWith(term));
        if (matching.length === 0) return null;
        const lines: string[] = [];
        for (const c of matching) {
            const name = `/${c.name}`;
            const colored = c.name === term ? chalk.cyan(name) : chalk.cyanBright(name);
            const pad = " ".repeat(Math.max(1, 10 - name.length));
            const avail = Math.max(4, width - 2 - name.length - pad.length);
            const desc = c.desc.length > avail ? `${c.desc.slice(0, avail - 1)}…` : c.desc;
            lines.push(`  ${colored}${pad}${chalk.dim(desc)}`);
        }
        return lines;
    }

    private renderStatus(): string {
        const frame = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0];
        const tag = chalk.magenta(`[${this.modeLabel}]`);
        switch (this.mode) {
            case "loading":
                return chalk.dim(`${tag} ${frame} model yükleniyor… %${Math.round(this.loadPct)}`);
            case "thinking":
                return chalk.dim(`${tag} ${frame} düşünüyor… (⏎ düşünceler)`);
            case "tool":
                return chalk.dim(`${tag} ${frame} araç çalışıyor…`);
            case "idle":
                return chalk.dim(`${tag} ⏎ gönder · / komut · TAB mod · ESC durdur · PgUp/PgDn kaydır · Ctrl+C çık`);
        }
    }

    private renderMessage(m: Message, width: number): string[] {
        switch (m.kind) {
            case "user":
                return this.wrapColored(chalk.cyan("siz> "), m.text, width);
            case "assistant":
                return this.wrapColored(chalk.green("ajan> "), m.text, width);
            case "info":
                return this.wrapColored("", chalk.dim(m.text), width);
            case "tool": {
                const label = m.name ?? "?";
                if (m.state === "running") {
                    const bar = BAR_FRAMES[this.frame % BAR_FRAMES.length] ?? BAR_FRAMES[0];
                    return [`  ${chalk.yellow(`[${label}] ${bar}`)}`];
                }
                const elapsed = formatElapsed(m.elapsed ?? 0);
                const txt = m.state === "done" ? `${elapsed} bitirdi` : `${elapsed} hata`;
                const color = m.state === "done" ? chalk.green : chalk.red;
                const lines = [`  ${color(`[${label}] ${txt}`)}`];
                if (m.output) {
                    const preview = m.output.replace(/\r/g, "").split("\n").slice(0, 10).join("\n");
                    const truncated = preview.length > 800 ? `${preview.slice(0, 800)}\n…` : preview;
                    for (const line of truncated.split("\n")) {
                        lines.push(...this.wrapColored("    ", chalk.dim(line), width));
                    }
                }
                return lines;
            }
        }
    }

    private renderInput(width: number): { line: string; cursorCol: number } {
        const prompt = "siz> ";
        const avail = Math.max(1, width - prompt.length);
        let start = 0;
        if (this.buffer.length > avail) {
            start = this.buffer.length - avail;
            if (this.cursor < start) start = this.cursor;
            else if (this.cursor - start > avail) start = this.cursor - avail;
        }
        const shown = this.buffer.slice(start, start + avail);
        const cursorCol = prompt.length + (this.cursor - start);
        return { line: prompt + shown, cursorCol };
    }

    private wrapColored(prefix: string, text: string, width: number): string[] {
        const clean = text.replace(ANSI_RE, "").replace(/\r\n/g, "\n").replace(/\r/g, "");
        const contPrefix = " ".repeat(prefix.length);
        const prefixed: string[] = [];
        const rawLines = clean.split("\n");
        for (let i = 0; i < rawLines.length; i++) {
            const raw = rawLines[i] ?? "";
            prefixed.push(i === 0 ? prefix + raw : contPrefix + raw);
        }
        const wrapped: string[] = [];
        for (const line of prefixed) {
            let cur = line;
            while (cur.length > width) {
                wrapped.push(cur.slice(0, width));
                cur = cur.slice(width);
            }
            if (cur.length > 0 || wrapped.length === 0) wrapped.push(cur);
        }
        if (wrapped.length === 0) wrapped.push("");
        return wrapped;
    }
}
