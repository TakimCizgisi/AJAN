import type { AgentTool } from "../config/types.js";

export const taskCompleteTool: AgentTool = {
    name: "task_complete",
    description:
        "Görev akışını KENDİ kararınla kontrol eder. " +
        "İşin henüz bitmediyse, kalan adımlara devam etmek için continue:true ile çağır (yeni bir tur açılır). " +
        "Görev TAMAMLANDIĞINDA ve doğrulandığında continue:false (veya continue vermeden) ile çağır; " +
        "report parametresine yapılan işlerin özetini yaz.",
    parameters: {
        type: "object",
        properties: {
            report: { type: "string", description: "İşin durumu / tamamlanan işlerin kısa özeti" },
            continue: {
                type: "boolean",
                description:
                    "true: göreve devam et, yeni bir tur iste (tur sonunda model tekrar görüşmelere devam eder). " +
                    "false veya verilmezse: görevi bitir."
            }
        },
        required: []
    },
    handler: async (params: { report?: string; continue?: boolean }, ctx) => {
        if (ctx.signals) {
            if (params.continue === true) {
                ctx.signals.continueRequested = true;
                return { ok: true, output: "Devam turu istendi (continue:true). Model kalan adımına devam edecek." };
            }
            ctx.signals.taskCompleted = true;
        }
        const report = (params.report ?? "").trim();
        return { ok: true, output: report || "Görev tamamlandı." };
    }
};
