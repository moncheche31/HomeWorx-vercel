import type { resources } from "./config";

export type AppLocale = keyof typeof resources;
export type AppNamespace = keyof (typeof resources)["en-US"];
