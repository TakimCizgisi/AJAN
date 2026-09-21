export type ServiceRequest =
    | { method: "sendMessage"; text: string; modelId?: string }
    | { method: "abort" }
    | { method: "newSession" }
    | { method: "getState" }
    | { method: "setConfig"; patch: Record<string, unknown> }
    | { method: "installModel"; id: string }
    | { method: "removeModel"; id: string }
    | { method: "useModel"; id: string }
    | { method: "refreshModels" }
    | { method: "detectGpu" }
    | { method: "listSessions" }
    | { method: "loadSession"; id: string }
    | { method: "saveSession"; session: unknown }
    | { method: "pmStatus" }
    | { method: "pmCatalog" }
    | { method: "pmInstallPackage"; id: string }
    | { method: "pmInstallCore" }
    | { method: "pmInstallVscode" }
    | { method: "pmUpdates" }
    | { method: "pmEcosystem" }
    | { method: "openUrl"; url: string }
    | { method: "winMinimize" }
    | { method: "winToggleMaximize" }
    | { method: "winClose" };

export type ServiceEvent =
    | { type: "text-chunk"; text: string }
    | { type: "thinking-chunk"; text: string }
    | { type: "tool-call"; name: string; params: unknown }
    | { type: "tool-result"; name: string; ok: boolean; output?: string }
    | { type: "step-start"; step: number; max: number }
    | { type: "context-trimmed"; removed: number }
    | { type: "error"; message: string }
    | { type: "complete"; response: string }
    | { type: "load-progress"; pct: number }
    | { type: "load-complete" }
    | { type: "busy"; active: boolean };

export type PkgInfo = {
    name: string;
    current: string | null;
    latest: string | null;
    updateAvailable: boolean;
    compatible: boolean;
    installed: boolean;
    description?: string;
};

export type PmStatus = {
    managedDir: string;
    appVersion: string | null;
    core: { installed: boolean; version: string | null; path: string | null };
    vscode: { id: string; installed: boolean; vsixFound: boolean };
};

export type PmPackageKind = "core" | "vscode" | "npm-global" | "npm-local" | "app";

export type PmPackageCommand = {
    label: string;
    cmd: string;
};

export type PmPackageDefinition = {
    id: string;
    label: string;
    npmName: string | null;
    githubPath: string | null;
    logoUrl: string | null;
    description: string;
    kind: PmPackageKind;
    commands: PmPackageCommand[];
};

export type PmPackage = PmPackageDefinition & {
    logo: string | null;
    current: string | null;
    latest: string | null;
    updateAvailable: boolean;
    installed: boolean;
    registryError: string | null;
};

export type PmCatalogResult = {
    packages: PmPackage[];
    source: "github" | "local";
    fetchedAt: string;
};