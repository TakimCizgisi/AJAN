declare const __AJAN_VERSION__: string;

/** esbuild tarafından `package.json` sürümüyle değiştirilir. */
export const AJAN_VERSION: string = typeof __AJAN_VERSION__ === "string" ? __AJAN_VERSION__ : "0.0.0-dev";
