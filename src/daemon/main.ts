/**
 * `ajan-engine` giriş noktası — motor sürecinin kendisi.
 *
 * İstemciler buraya bağlanır; bu süreç kapandığında tüm oturumlar biter.
 * Çalışma dizini ve socket yolu komut satırından verilebilir.
 */
import { Runner } from "./runner.js";
import { DaemonServer } from "./server.js";
import { AJAN_VERSION } from "../version.js";
import { defaultSocketPath } from "../protocol/channel.js";
import { logger, setLogLevel } from "../utils/paths.js";

type Options = { cwd: string; socket: string; logLevel?: "debug" | "info" | "warn" | "error" };

function parseArgs(argv: string[]): Options {
    const opts: Options = { cwd: process.cwd(), socket: defaultSocketPath() };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--cwd" || a === "-C") opts.cwd = argv[++i] ?? opts.cwd;
        else if (a === "--socket") opts.socket = argv[++i] ?? opts.socket;
        else if (a === "--log-level") {
            const v = argv[++i];
            if (v === "debug" || v === "info" || v === "warn" || v === "error") opts.logLevel = v;
        }
    }
    return opts;
}

function usage(): void {
    process.stdout.write(
        `ajan-engine ${AJAN_VERSION} — AJAN motoru (IPC)\n\n` +
            `Kullanım: ajan-engine [seçenekler]\n\n` +
            `  -C, --cwd <yol>       ajanın çalışma dizini (varsayılan: ${process.cwd()})\n` +
            `      --socket <yol>    dinlenecek socket (varsayılan: ${defaultSocketPath()})\n` +
            `      --log-level <seviye>  debug | info | warn | error\n` +
            `  -h, --help            bu yardım\n`
    );
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    if (argv.includes("-h") || argv.includes("--help")) {
        usage();
        return;
    }

    const opts = parseArgs(argv);
    if (opts.logLevel) setLogLevel(opts.logLevel);

    const runner = new Runner(opts.cwd);
    const server = new DaemonServer(runner, opts.socket);

    try {
        await server.listen();
    } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "EADDRINUSE") {
            process.stderr.write(`AJAN motoru zaten çalışıyor: ${opts.socket}\n`);
            process.exit(3);
        }
        throw err;
    }

    process.stdout.write(`AJAN motoru hazır  ajan=${AJAN_VERSION}  socket=${opts.socket}  cwd=${opts.cwd}\n`);

    let closing = false;
    const shutdown = async (signal: string) => {
        if (closing) return;
        closing = true;
        logger.info(`kapanıyor (${signal})`);
        await server.close();
        process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("uncaughtException", (err) => {
        logger.error(`yakalanmamış hata: ${err.message}`);
    });
    process.on("unhandledRejection", (err) => {
        logger.error(`işlenmemiş reddetme: ${String(err)}`);
    });
}

main().catch((err) => {
    process.stderr.write(`motor başlatılamadı: ${(err as Error).message}\n`);
    process.exit(1);
});
