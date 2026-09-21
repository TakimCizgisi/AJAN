import { AjanService, type ServiceEvents, type ModelWithStatus } from "@takimcizgisi/core";

export type BackendEvents = ServiceEvents;

/**
 * AJAN motorunu VSCode extension host içinde çalıştıran sarmalayıcı.
 * AJAN'ın kendi API sistemi (AjanService) birebir kullanılır; yalnızca
 * olaylar (onTextChunk, onToolCall, ...) VSCode tarafına yönlendirilir.
 */
export class AjanBackend {
    readonly service: AjanService;

    constructor(events: BackendEvents, cwd: string) {
        process.chdir(cwd);
        this.service = new AjanService(events);
    }

    async sendMessage(message: string, modelId?: string) {
        return await this.service.sendMessage(message, modelId);
    }

    abort(): void {
        this.service.abort();
    }

    async reset(): Promise<void> {
        await this.service.reset();
    }

    async newSession(): Promise<void> {
        await this.service.reset();
    }

    getConfig() {
        return this.service.getConfig();
    }

    async setConfig(patch: Record<string, unknown>) {
        await this.service.setConfig(patch);
    }

    listModels(): ModelWithStatus[] {
        return this.service.listModels();
    }

    getModelInfo() {
        return this.service.getModelInfo();
    }

    async installModel(id: string) {
        return await this.service.installModel(id);
    }

    async removeModel(id: string) {
        return await this.service.removeModel(id);
    }

    async useModel(id: string) {
        return await this.service.useModel(id);
    }

    async refreshModels() {
        return await this.service.refreshModels();
    }

    getModelsRegistry() {
        return this.service.getModelsRegistry();
    }

    async listProjects() {
        return this.service.listProjects();
    }

    async addProject(path: string) {
        return await this.service.addProject(path);
    }

    async removeProject(path: string) {
        return await this.service.removeProject(path);
    }

    async setActiveProject(path: string | null) {
        return await this.service.setActiveProject(path);
    }

    async listSessions() {
        return await this.service.listSessions();
    }

    async loadSession(id: string) {
        return await this.service.loadSession(id);
    }

    async saveSession(session: unknown) {
        await this.service.saveSession(session as Parameters<AjanService["saveSession"]>[0]);
    }

    generateSessionId(): string {
        return this.service.generateSessionId();
    }

    getChatHistory() {
        return this.service.getChatHistory();
    }

    getContextStats() {
        return this.service.getContextStats();
    }

    async detectGpu(): Promise<string[]> {
        return await this.service.detectGpu();
    }

    get isActive(): boolean {
        return this.service.isActive;
    }

    async dispose(): Promise<void> {
        await this.service.dispose();
    }
}