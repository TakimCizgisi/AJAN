import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCoreTools } from "../src/tools/registry.js";
import { openPlaygroundTool, setTodosTool, getTodosTool } from "../src/tools/playground.js";
import { taskCompleteTool } from "../src/tools/taskComplete.js";

let failures = 0;
const check = (name: string, ok: boolean, detail?: string): void => {
    if (ok) console.log(`  ok   ${name}`);
    else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const tmp = mkdtempSync(join(tmpdir(), "ajan-test-"));
const ctx = { cwd: tmp, config: { modelId: "x", maxToolOutput: 100000 } };

const tools = createCoreTools(ctx);
const names = tools.map(t => t.name);

check("çekirdek araçlar korundu", tools.length >= 18, `toplam ${tools.length}`);
for (const need of [
    "open_playground", "set_todos", "get_todos"
]) {
    check(`araç ${need}`, names.includes(need));
}
check("GUI otomasyon araçları kaldırıldı",
    !["screen_info", "screenshot", "mouse_move", "mouse_click", "mouse_scroll", "key_press", "type_text"].some(n => names.includes(n)),
    names.filter(n => n.includes("screen") || n.includes("mouse") || n.includes("key_") || n.includes("type")).join(","));

const opened = await openPlaygroundTool.handler({}, ctx);
check("open_playground oluşturur", opened.ok && opened.output.includes(".ajan"), opened.output);

const played = await openPlaygroundTool.handler({ note: "deneme" }, ctx);
check("open_playground korur", played.ok && played.output.includes("0 öğe"), played.output);

const set = await setTodosTool.handler(
    { todos: [{ text: "adım 1" }, { text: "adım 2", done: true }] },
    ctx
);
check("set_todos kaydeder", set.ok && set.output.includes("2 madde"), set.output);

const get = await getTodosTool.handler({}, ctx);
check("get_todos okur", get.ok && get.output.includes("adım 1") && get.output.includes("[x] 2."), get.output);

const reset = await openPlaygroundTool.handler({ reset: true }, ctx);
check("open_playground reset temizler", reset.ok && reset.output.includes("1 temizlendi"), reset.output);

const get2 = await getTodosTool.handler({}, ctx);
check("reset sonrası TODO boş", get2.ok && get2.output.includes("TODO yok"), get2.output);

const sigA: { taskCompleted?: boolean; continueRequested?: boolean } = {};
const resA = await taskCompleteTool.handler({ report: "ara rapor", continue: true }, { cwd: tmp, config: {}, signals: sigA });
check("task_complete continue:true tur açar", resA.ok && sigA.continueRequested === true && !sigA.taskCompleted, resA.output);

const sigB: { taskCompleted?: boolean; continueRequested?: boolean } = {};
const resB = await taskCompleteTool.handler({ report: "bitti", continue: false }, { cwd: tmp, config: {}, signals: sigB });
check("task_complete continue:false bitirir", resB.ok && sigB.taskCompleted === true && !sigB.continueRequested, resB.output);

const sigC: { taskCompleted?: boolean; continueRequested?: boolean } = {};
const resC = await taskCompleteTool.handler({ report: "bitti" }, { cwd: tmp, config: {}, signals: sigC });
check("task_complete varsayılan bitirir", resC.ok && sigC.taskCompleted === true && !sigC.continueRequested, resC.output);

const sigD: { taskCompleted?: boolean; continueRequested?: boolean } = {};
const resD = await taskCompleteTool.handler({ report: "bitti" }, { cwd: tmp, config: {}, signals: sigD });
check("task_complete report korunur", resD.ok && resD.output.includes("bitti"), resD.output);

// Geçici dizini temizle (Windows kilitleri için birkaç deneme).
for (let attempt = 0; attempt < 10 && existsSync(tmp); attempt++) {
    try {
        rmSync(tmp, { recursive: true, force: true });
    } catch {
        /* kilitli: bekleyip tekrar dene */
    }
    if (!existsSync(tmp)) break;
    await new Promise((r) => setTimeout(r, 400));
}

console.log(failures === 0 ? "\nYENİ ARAÇ TESTLERİ GEÇTİ" : `\n${failures} TEST BAŞARISIZ`);
process.exitCode = failures === 0 ? 0 : 1;