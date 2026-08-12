import { spawn } from "node:child_process";
import type { AgentTool } from "../config/types.js";
import { limitOutput } from "./utils.js";

export const runCommandTool: AgentTool = {
    name: "run_command",
    description:
        "Terminal komutu çalıştırır. cwd, komutun çalıştırılacağı dizindir (varsayılan: ajanın çalışma dizini). " +
        "timeout ms cinsinden zaman aşımıdır (varsayılan: 60000). Çıktı maksimum uzunlukta kesilir.",
    parameters: {
        type: "object",
        properties: {
            command: { type: "string", description: "Çalıştırılacak terminal komutu" },
            cwd: { type: "string", description: "Çalışma dizini (mutlak yol)" },
            timeout: { type: "integer", description: "Zaman aşımı milisaniye" }
        },
        required: ["command"]
    },
    handler: async (
        params: { command: string; cwd?: string; timeout?: number },
        ctx
    ) => {
        const timeoutMs = params.timeout ?? ctx.config.toolTimeout ?? 60_000;
        const cwd = params.cwd ?? ctx.cwd;

        const result = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>(
            (resolvePromise) => {
                const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
                const shellArgs = process.platform === "win32" ? ["/d", "/s", "/c"] : ["-c"];
                const child = spawn(shell, [...shellArgs, params.command], {
                    cwd,
                    windowsHide: true,
                    env: process.env,
                    stdio: ["ignore", "pipe", "pipe"]
                });

                let stdout = "";
                let stderr = "";
                let timedOut = false;

                const timer = setTimeout(() => {
                    timedOut = true;
                    child.kill("SIGKILL");
                }, timeoutMs);

                child.stdout?.on("data", (chunk: Buffer) => {
                    stdout += chunk.toString("utf8");
                    if (stdout.length > 2_000_000) child.stdout?.pause();
                });
                child.stderr?.on("data", (chunk: Buffer) => {
                    stderr += chunk.toString("utf8");
                    if (stderr.length > 2_000_000) child.stderr?.pause();
                });
                child.on("error", (err) => {
                    clearTimeout(timer);
                    resolvePromise({ code: null, stdout, stderr: `Komut başlatılamadı: ${err.message}`, timedOut });
                });
                child.on("close", (code) => {
                    clearTimeout(timer);
                    resolvePromise({ code, stdout, stderr, timedOut });
                });
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
