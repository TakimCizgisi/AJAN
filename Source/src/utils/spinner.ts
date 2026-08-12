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
export class Spinner {
    private readonly interval: NodeJS.Timeout;
    private frame = 0;
    readonly startedAt: number;
    private readonly text: string;

    constructor(text: string) {
        this.text = text;
        this.startedAt = Date.now();
        process.stdout.write(`${text} `);
        this.interval = setInterval(() => this.render(), 120);
    }

    private render(): void {
        const width = 8;
        const fill = this.frame % (width + 1);
        const bar =
            fill === width
                ? `[${"=".repeat(width)}]`
                : `[${"=".repeat(fill)}>${" ".repeat(width - fill - 1)}]`;
        this.frame++;
        process.stdout.write(`\r${this.text} ${bar}`);
    }

    /** Spinner'ı durdurur; finalText verilirse satırı o metinle bitirir, verilmezse satırı temizler. */
    finish(finalText?: string): void {
        clearInterval(this.interval);
        if (finalText) {
            process.stdout.write(`\r${finalText}\n`);
        } else {
            process.stdout.write("\r\x1b[2K");
        }
    }
}
