import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { createCoreTools } from "../src/tools/registry.js";
import type { AjanConfig, ToolExecutionContext } from "../src/config/types.js";

let failures = 0;

function check(name: string, ok: boolean, detail?: string): void {
    if (ok) {
        console.log(`  ok   ${name}`);
    } else {
        failures++;
        console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    }
}

async function main(): Promise<void> {
    const tmp = mkdtempSync(join(os.tmpdir(), "ajan-smoke-"));
    const config: AjanConfig = {
        modelId: "smoke",
        toolTimeout: 2_000,
        maxToolOutput: 10_000
    };
    const ctx: ToolExecutionContext = { cwd: tmp, config };
    const tools = new Map(createCoreTools(ctx).map((t) => [t.name, t]));
    const run = (name: string, params: Record<string, unknown>): Promise<{ ok: boolean; output: string }> => {
        const tool = tools.get(name);
        if (!tool) throw new Error(`Araç yok: ${name}`);
        return Promise.resolve(tool.handler(params, ctx));
    };

    console.log("Araç smoke testi");
    console.log(`Geçici dizin: ${tmp}\n`);

    try {
        // write_file + read_file
        let res = await run("write_file", { path: "src/merhaba.txt", content: "ilk satır\nikinci satır" });
        check("write_file oluşturur", res.ok && existsSync(join(tmp, "src", "merhaba.txt")), res.output);

        res = await run("write_file", { path: "src/merhaba.txt", content: "\nüçüncü satır", append: true });
        check("write_file append", res.ok, res.output);

        res = await run("read_file", { path: "src/merhaba.txt" });
        check("read_file içerik", res.ok && res.output.includes("ilk satır") && res.output.includes("üçüncü satır"), res.output);

        // list_dir
        res = await run("list_dir", { path: ".", recursive: true });
        check("list_dir recursive", res.ok && res.output.includes("merhaba.txt"), res.output);

        // search_files
        res = await run("search_files", { pattern: "**/*.txt" });
        check("search_files glob", res.ok && res.output.includes("merhaba.txt"), res.output);

        // grep_files
        res = await run("grep_files", { pattern: "üçüncü" });
        check("grep_files bulur", res.ok && res.output.includes("üçüncü"), res.output);

        res = await run("grep_files", { pattern: "[" });
        check("grep_files geçersiz regex hatası", !res.ok && res.output.includes("Geçersiz"), res.output);

        // apply_patch
        const patch = [
            "--- a/src/merhaba.txt",
            "+++ b/src/merhaba.txt",
            "@@ -1,2 +1,3 @@",
            " ilk satır",
            "-ikinci satır",
            "+yeni satır",
            "+üçüncü satır"
        ].join("\n");
        res = await run("apply_patch", { patch });
        check("apply_patch uygular", res.ok, res.output);
        const patched = readFileSync(join(tmp, "src", "merhaba.txt"), "utf8");
        check("apply_patch içerik", patched.includes("yeni satır") && !patched.includes("ikinci satır"), patched);

        // edit_file
        res = await run("edit_file", { path: "src/merhaba.txt", oldString: "yeni satır", newString: "düzenlenmiş satır" });
        check("edit_file değiştirir", res.ok, res.output);
        let edited = readFileSync(join(tmp, "src", "merhaba.txt"), "utf8");
        check("edit_file içerik", edited.includes("düzenlenmiş satır") && !edited.includes("yeni satır"), edited);

        res = await run("edit_file", { path: "src/merhaba.txt", oldString: "yok böyle bir metin", newString: "x" });
        check("edit_file eşleşme yok hatası", !res.ok && res.output.includes("Eşleşme bulunamadı"), res.output);

        res = await run("edit_file", { path: "src/merhaba.txt", oldString: "satır", newString: "X", replaceAll: false });
        check("edit_file çoklu eşleşme hatası", !res.ok && res.output.includes("kez geçiyor"), res.output);

        res = await run("edit_file", { path: "src/merhaba.txt", oldString: "satır", newString: "satır", replaceAll: true });
        check("edit_file replaceAll", res.ok, res.output);

        // run_command: tehlikeli komut engeli
        res = await run("run_command", { command: "format c:" });
        check("run_command tehlikeli komut engellenir", !res.ok && res.output.includes("engellendi"), res.output);

        // run_command: başarılı
        const echoCmd = process.platform === "win32" ? "echo smoke-test-ok" : "echo smoke-test-ok";
        res = await run("run_command", { command: echoCmd });
        check("run_command başarılı", res.ok && res.output.includes("smoke-test-ok"), res.output);

        // run_command: göreli cwd ctx.cwd'ye göre çözülür
        res = await run("run_command", { command: echoCmd, cwd: "src" });
        check("run_command göreli cwd", res.ok, res.output);

        // run_command: timeout + süreç ağacı öldürme (Windows: taskkill)
        const sleepCmd = process.platform === "win32"
            ? "ping -n 30 127.0.0.1 >nul"
            : "sleep 30";
        const started = Date.now();
        res = await run("run_command", { command: sleepCmd, timeout: 1500 });
        const elapsed = Date.now() - started;
        check(
            "run_command timeout döner (askıda kalmaz)",
            !res.ok && res.output.includes("ZAMAN AŞIMI") && elapsed < 20_000,
            `${res.output} (${elapsed}ms)`
        );
        // Windows'ta süreç ağacı tutamaçlarının bırakılması biraz zaman alır;
        // temizlik öncesi kısa bir nefes ver.
        await new Promise((r) => setTimeout(r, 1500));

        // web_search: ağ varsa dene, yoksa uyar
        res = await run("web_search", { query: "opencode test", maxResults: 3 });
        if (res.ok) {
            check("web_search sonuç", !res.output.includes("bulunamadı"), res.output.slice(0, 200));
        } else {
            console.log(`  ---- web_search atlandı (ağ yok olabilir): ${res.output.slice(0, 120)}`);
        }

        // task_complete: sinyali işaretler
        const signals = { taskCompleted: false };
        const ctxWithSignals: ToolExecutionContext = { ...ctx, signals };
        const completeTool = tools.get("task_complete");
        if (!completeTool) throw new Error("Araç yok: task_complete");
        res = await Promise.resolve(completeTool.handler({ report: "bitti" }, ctxWithSignals));
        check("task_complete sinyal", res.ok && signals.taskCompleted === true, res.output);

        // not_al / not_oku
        res = await run("not_al", { text: "smoke-test hafıza kaydı" });
        check("not_al kaydeder", res.ok && res.output.includes("#"), res.output);
        res = await run("not_oku", { query: "smoke-test" });
        check("not_oku bulur", res.ok && res.output.includes("hafıza kaydı"), res.output);

        // move_file + delete_file
        res = await run("move_file", { source: "src/merhaba.txt", destination: "yeni/taşındı.txt" });
        check("move_file taşır", res.ok && existsSync(join(tmp, "yeni", "taşındı.txt")), res.output);
        res = await run("delete_file", { path: "yeni/taşındı.txt" });
        check("delete_file siler", res.ok && !existsSync(join(tmp, "yeni", "taşındı.txt")), res.output);
        res = await run("delete_file", { path: "." , recursive: true });
        check("delete_file cwd koruması", !res.ok && res.output.includes("silemezsin"), res.output);

        // read_data: JSON ve YAML
        writeFileSync(join(tmp, "veri.json"), JSON.stringify({ ad: "ajan", sayi: 7, liste: [1, 2, 3] }), "utf8");
        res = await run("read_data", { path: "veri.json" });
        check("read_data json", res.ok && res.output.includes("ajan") && res.output.includes("nesne"), res.output);
        writeFileSync(join(tmp, "veri.yaml"), "ad: ajan\nsayi: 7\n", "utf8");
        res = await run("read_data", { path: "veri.yaml" });
        check("read_data yaml", res.ok && res.output.includes("ajan"), res.output);

        // unzip_file
        const zipPath = join(tmp, "arsiv.zip");
        const AdmZipMod = await import("adm-zip");
        const zip = new AdmZipMod.default();
        zip.addFile("icindekiler/okubeni.txt", Buffer.from("zip içeriği smoke", "utf8"));
        zip.writeZip(zipPath);
        res = await run("unzip_file", { path: "arsiv.zip" });
        check(
            "unzip_file açar",
            res.ok && existsSync(join(tmp, "icindekiler", "okubeni.txt")) && readFileSync(join(tmp, "icindekiler", "okubeni.txt"), "utf8").includes("smoke"),
            res.output
        );

        // fetch_url: ağ varsa dene
        res = await run("fetch_url", { url: "https://example.com", maxLength: 2000 });
        if (res.ok) {
            check("fetch_url içerik", res.output.includes("example"), res.output.slice(0, 160));
        } else {
            console.log(`  ---- fetch_url atlandı (ağ yok olabilir): ${res.output.slice(0, 120)}`);
        }
    } finally {
        // Windows'ta force:true hata fırlatmayıp sessizce kalıntı bırakabildiği için
        // dizinin gerçekten silindiğini kontrol ederek döngüyle dene.
        // (timeout testinden kalan cmd.exe cwd tutamacını bırakana kadar beklenir.)
        for (let attempt = 0; attempt < 15 && existsSync(tmp); attempt++) {
            try {
                rmSync(tmp, { recursive: true, force: true });
            } catch {
                /* kilitli: bekleyip tekrar dene */
            }
            if (!existsSync(tmp)) break;
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    console.log(failures === 0 ? "\nTÜM TESTLER GEÇTİ" : `\n${failures} TEST BAŞARISIZ`);
    process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
