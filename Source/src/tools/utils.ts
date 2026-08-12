export function limitOutput(text: string, maxChars?: number): string {
    const limit = maxChars ?? 40_000;
    if (text.length <= limit) return text;
    const truncated = text.slice(0, limit);
    return `${truncated}\n... [çıktı ${text.length - limit} karakter kesildi]`;
}

export function toMb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
