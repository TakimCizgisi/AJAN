import { spawn } from "node:child_process";
import type { AgentTool } from "../config/types.js";
import { limitOutput, resolveUserPath } from "./utils.js";

const DEFAULT_BLOCKED_COMMANDS: string[] = [
    "^(\\s*)(format|fdisk|diskpart|mkfs|shutdown)\\b",
    "^\\s*(rm|del|erase|rd|rmdir|reg)\\s+.*(-rf|-r\\s+-f|/s|/q|delete)\\b",
    "^\\s*taskkill\\s+/f\\s+/im\\s+system\\b",
    "rm\\s+(-rf|-r\\s+-f)\\s+[/\\\\]"
];

function blockedBy(patterns: string[], command: string): string | null {
    for (const pat of patterns) {
        try {
            if (new RegExp(pat, "i").test(command)) return pat;
        } catch {
            /* geçersiz deseni yut */
        }
    }
    return null;
}

export const runCommandTool: AgentTool = {
    name: "run_command",
    description:
        "Terminal komutu çalıştırır. cwd, komutun çalıştırılacağı dizindir (varsayılan: ajanın çalışma dizini). " +
        "timeout ms cinsinden zaman aşımıdır (varsayılan: 60000). Çıktı maksimum uzunlukta kesilir.",
    parameters: {
        type: "object",
        properties: {
            command: { type: "string", description: "Çalıştırılacak terminal komutu" },
            cwd: { type: "string", description: "Çalışma dizini (ajanın dizinine göre göreli veya mutlak yol)" },
            timeout: { type: "integer", description: "Zaman aşımı milisaniye" }
        },
        required: ["command"]
    },
    handler: async (
        params: { command: string; cwd?: string; timeout?: number },
        ctx
    ) => {
        const timeoutMs = params.timeout ?? ctx.config.toolTimeout ?? 60_000;
        const cwd = params.cwd ? resolveUserPath(ctx.cwd, params.cwd) : ctx.cwd;

        const blocked = blockedBy(ctx.config.blockedCommands ?? DEFAULT_BLOCKED_COMMANDS, params.command);
        if (blocked) {
            return {
                ok: false,
                output:
                    `Komut engellendi (tehlikeli komut deseni: ${blocked}).\n` +
                    `Engellenen komut: ${params.command}\n` +
                    'İzin vermek için config.json\'daki "blockedCommands" alanını değiştirin ([] boş liste = tümü serbest).'
            };
        }

        const result = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>(
            (resolvePromise) => {
                const isWin = process.platform === "win32";
                const shell = isWin ? "cmd.exe" : "/bin/sh";
                const shellArgs = isWin ? ["/d", "/s", "/c"] : ["-c"];
                const child = spawn(shell, [...shellArgs, params.command], {
                    cwd,
                    windowsHide: true,
                    detached: !isWin,
                    env: process.env,
                    stdio: ["ignore", "pipe", "pipe"]
                });

                let stdout = "";
                let stderr = "";
                let timedOut = false;
                let settled = false;
                const finish = (code: number | null): void => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    clearTimeout(safetyTimer);
                    resolvePromise({ code, stdout, stderr, timedOut });
                };

                const timer = setTimeout(() => {
                    timedOut = true;
                    try {
                        if (isWin && child.pid != null) {
                            // Önce taskkill /T ile SÜREÇ AĞACINI (cmd + alt komutlar) öldür.
                            // Önce ağaçta çocuk öldürülür, ardından taskkill "process not found"
                            // ile ağacı kaçırır; bu yüzden önce taskkill, TerminateProcess'ten önce gelir.
                            const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
                                windowsHide: true,
                                stdio: "ignore"
                            });
                            killer.unref();
                            killer.on("error", () => {
                                /* taskkill başlatılamadıysa sessiz geç */
                            });
                        } else if (child.pid != null) {
                            process.kill(-child.pid, "SIGKILL");
                        }
                    } catch {
                        /* zaten ölmüş olabilir */
                    }
                }, timeoutMs);

                // 'close' ancak süreç bitip tüm pipe'lar kapanınca tetiklenir; askıda kalmamak için
                // güvenlik zamanlayıcısı pipe'ları serbest bırakıp sonucu zorla döndürür.
                const safetyTimer = setTimeout(() => {
                    if (!settled) {
                        child.stdout?.destroy();
                        child.stderr?.destroy();
                        finish(child.exitCode ?? null);
                    }
                }, timeoutMs + 5_000);

                child.stdout?.on("data", (chunk: Buffer) => {
                    stdout += chunk.toString("utf8");
                    if (stdout.length > 2_000_000) child.stdout?.pause();
                });
                child.stderr?.on("data", (chunk: Buffer) => {
                    stderr += chunk.toString("utf8");
                    if (stderr.length > 2_000_000) child.stderr?.pause();
                });
                child.on("error", (err) => {
                    stderr += `Komut başlatılamadı: ${err.message}`;
                    finish(null);
                });
                child.on("close", (code) => finish(code));
            }
        );

        const parts: string[] = [];
        if (result.timedOut) parts.push(`[ZAMAN AŞIMI ${timeoutMs}ms]`);
        parts.push(`Çıkış kodu: ${result.code}`);
        if (result.stdout.trim()) parts.push(`--- STDOUT ---\n${result.stdout.trimEnd()}`);
        if (result.stderr.trim()) parts.push(`--- STDERR ---\n${result.stderr.trimEnd()}`);

        const ok = result.code === 0 && !result.timedOut;
        return { ok, output: limitOutput(parts.join("\n"), ctx.config.maxToolOutput) };
    }
};
