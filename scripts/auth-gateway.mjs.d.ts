import type { Server } from "http";

export function createAuthGatewayServer(env?: NodeJS.ProcessEnv | Record<string, string | undefined>): Server;
