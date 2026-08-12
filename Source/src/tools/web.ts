import type { AgentTool } from "../config/types.js";
import { limitOutput } from "./utils.js";

export type WebSearchResult = {
    title: string;
    url: string;
    snippet: string;
};

function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, code: string) => {
            const cp = Number(code);
            return cp > 0 ? String.fromCodePoint(cp) : "";
        });
}

function stripTags(text: string): string {
    return decodeEntities(text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

function decodeRedirectUrl(href: string): string {
    try {
        if (href.startsWith("//")) href = `https:${href}`;
        const u = new URL(href);
        if (u.hostname.includes("duckduckgo.com")) {
            const target = u.searchParams.get("uddg");
            if (target) return decodeURIComponent(target);
        }
        return href;
    } catch {
        return href;
    }
}

function parseResults(html: string, maxResults: number): WebSearchResult[] {
    const results: WebSearchResult[] = [];
    const resultRe = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
    const snippetRe = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;

    let match: RegExpExecArray | null;
    const titles: { href: string; title: string }[] = [];
    while ((match = resultRe.exec(html)) !== null && titles.length < maxResults) {
        titles.push({ href: match[1] ?? "", title: stripTags(match[2] ?? "") });
    }

    const snippets: string[] = [];
    while ((match = snippetRe.exec(html)) !== null && snippets.length < titles.length) {
        snippets.push(stripTags(match[1] ?? ""));
    }

    for (let i = 0; i < titles.length; i++) {
        const item = titles[i];
        if (!item || !item.title) continue;
        results.push({
            title: item.title,
            url: decodeRedirectUrl(item.href),
            snippet: snippets[i] ?? ""
        });
    }
    return results;
}

export const webSearchTool: AgentTool = {
    name: "web_search",
    description:
        "Web'de arama yapar (DuckDuckGo, API anahtarı gerektirmez). Güncel bilgi, haber veya doküman bulmak için kullan. " +
        "maxResults (varsayılan 5, en fazla 10) kadar sonuç döner: başlık, özet ve URL.",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "Arama sorgusu (İngilizce daha iyi sonuç verir)" },
            maxResults: { type: "integer", description: "Döndürülecek sonuç sayısı (varsayılan: 5, maks: 10)" }
        },
        required: ["query"]
    },
    handler: async (params: { query: string; maxResults?: number }, ctx) => {
        const query = params.query.trim();
        if (!query) return { ok: false, output: "Arama sorgusu boş olamaz." };
        const maxResults = Math.min(Math.max(params.maxResults ?? 5, 1), 10);
        const timeoutMs = ctx.config.toolTimeout ?? 15_000;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let html: string;
        try {
            const res = await fetch(
                `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                    },
                    signal: controller.signal,
                    redirect: "follow"
                }
            );
            if (!res.ok) {
                return { ok: false, output: `Arama başarısız (HTTP ${res.status}): ${res.statusText}` };
            }
            html = await res.text();
        } catch (err) {
            const aborted = controller.signal.aborted;
            return {
                ok: false,
                output: aborted
                    ? `Arama zaman aşımı (${timeoutMs}ms) veya iptal edildi.`
                    : `Arama hatası: ${(err as Error).message}`
            };
        } finally {
            clearTimeout(timer);
        }

        const results = parseResults(html, maxResults);
        if (results.length === 0) {
            return { ok: true, output: `"${query}" için sonuç bulunamadı.` };
        }

        const lines = results.map((r, i) =>
            `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet || "(özet yok)"}`
        );
        return { ok: true, output: limitOutput(lines.join("\n\n"), ctx.config.maxToolOutput) };
    }
};
