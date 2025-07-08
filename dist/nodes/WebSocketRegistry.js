"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketRegistry = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const ws_1 = __importDefault(require("ws"));
class WebSocketRegistry {
    constructor() {
        this.servers = new Map();
        this.registryPath = path_1.default.join(os_1.default.tmpdir(), "n8n-websocket-registry.json");
        this.loadRegistry();
    }
    static getInstance() {
        if (!WebSocketRegistry.instance) {
            WebSocketRegistry.instance = new WebSocketRegistry();
        }
        return WebSocketRegistry.instance;
    }
    loadRegistry() {
        try {
            if (fs_1.default.existsSync(this.registryPath)) {
                const data = JSON.parse(fs_1.default.readFileSync(this.registryPath, "utf8"));
                Object.entries(data).forEach(([serverId, serverInfo]) => {
                    if (!this.servers.has(serverId)) {
                        this.createServer(serverId, {
                            port: serverInfo.port,
                            path: serverInfo.path,
                        });
                    }
                });
            }
        }
        catch (error) {
            console.error("[DEBUG-REGISTRY] Error loading registry:", error);
        }
    }
    saveRegistry() {
        try {
            const data = {};
            this.servers.forEach(({ wss, clients }, serverId) => {
                const address = wss.address();
                if (address && typeof address === "object") {
                    data[serverId] = {
                        port: address.port,
                        path: wss.options.path,
                        clientCount: clients.size,
                    };
                }
            });
            fs_1.default.writeFileSync(this.registryPath, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error("[DEBUG-REGISTRY] Error saving registry:", error);
        }
    }
    createServer(serverId, config) {
        console.error(`[DEBUG-REGISTRY] Creating WebSocket server on port ${config.port} with path ${config.path}`);
        const serverOptions = {
            port: config.port,
            path: config.path,
        };
        if (config.authentication && config.authentication.type !== 'none') {
            serverOptions.verifyClient = async (info) => {
                try {
                    const { validateWebSocketAuthentication } = await Promise.resolve().then(() => __importStar(require('./WebSocketTrigger/utils')));
                    await validateWebSocketAuthentication(info.req, config.authentication.type, config.authentication.getCredentials);
                    return true;
                }
                catch (error) {
                    console.error(`[DEBUG-REGISTRY] Authentication failed for ${serverId}:`, error.message);
                    return false;
                }
            };
        }
        const wss = new ws_1.default.Server(serverOptions);
        const clients = new Map();
        const activeExecutions = new Set();
        const pingInterval = setInterval(() => {
            if (clients.size === 0) {
                return;
            }
            console.error(`[DEBUG-REGISTRY] Sending ping to ${clients.size} clients on server ${serverId}`);
            clients.forEach((client, clientId) => {
                if (client.readyState === ws_1.default.OPEN) {
                    try {
                        client.ping();
                        console.error(`[DEBUG-REGISTRY] Ping sent to client ${clientId}`);
                    }
                    catch (error) {
                        console.error(`[DEBUG-REGISTRY] Error sending ping to client ${clientId}:`, error);
                    }
                }
                else if (client.readyState === ws_1.default.CLOSED ||
                    client.readyState === ws_1.default.CLOSING) {
                    console.error(`[DEBUG-REGISTRY] Removing dead client ${clientId} from server ${serverId}`);
                    clients.delete(clientId);
                    this.saveRegistry();
                }
            });
        }, 30000);
        wss.on("connection", (ws) => {
            const clientId = Math.random().toString(36).substring(2, 8);
            clients.set(clientId, ws);
            console.error(`[DEBUG-REGISTRY] New client connected. Server ID: ${serverId}, Client ID: ${clientId}`);
            console.error(`[DEBUG-REGISTRY] Active Clients: ${clients.size}`);
            this.listClients(serverId);
            ws.on("ping", () => {
                if (ws.readyState === ws_1.default.OPEN) {
                    ws.pong();
                }
            });
            ws.on("pong", () => {
                console.error(`[DEBUG-REGISTRY] Received pong from client ${clientId}`);
            });
            ws.on("message", (message) => {
                console.error(`[DEBUG-REGISTRY] Received message from client ${clientId} on server ${serverId}`);
                try {
                    const data = JSON.parse(message.toString());
                    wss.emit("message", { ...data, clientId });
                }
                catch (error) {
                    wss.emit("message", { message: message.toString(), clientId });
                }
            });
            ws.on("close", () => {
                clients.delete(clientId);
                console.error(`[DEBUG-REGISTRY] Client ${clientId} disconnected from server ${serverId}`);
                console.error(`[DEBUG-REGISTRY] Active Clients: ${clients.size}`);
                this.listClients(serverId);
                this.saveRegistry();
            });
            ws.on("error", error => {
                console.error(`[DEBUG-REGISTRY] WebSocket error for client ${clientId}:`, error);
            });
        });
        const originalClose = wss.close;
        wss.close = function (...args) {
            clearInterval(pingInterval);
            console.error(`[DEBUG-REGISTRY] Stopping ping interval for server ${serverId}`);
            return originalClose.apply(this, args);
        };
        this.servers.set(serverId, { wss, clients });
        this.saveRegistry();
        return wss;
    }
    async getOrCreateServer(serverId, config) {
        this.loadRegistry();
        const server = this.servers.get(serverId);
        if (server) {
            const address = server.wss.address();
            if (address && typeof address === "object") {
                const currentPort = address.port;
                const currentPath = server.wss.options.path;
                if (currentPort !== config.port || currentPath !== config.path) {
                    console.error(`[DEBUG-REGISTRY] Server config changed for ${serverId}. Port: ${currentPort} -> ${config.port}, Path: ${currentPath} -> ${config.path}`);
                    await this.closeServer(serverId, { keepClientsAlive: false });
                    return this.createServer(serverId, config);
                }
            }
            return server.wss;
        }
        return this.createServer(serverId, config);
    }
    getServer(serverId) {
        var _a;
        this.loadRegistry();
        return (_a = this.servers.get(serverId)) === null || _a === void 0 ? void 0 : _a.wss;
    }
    getClient(serverId, clientId) {
        const server = this.servers.get(serverId);
        return server === null || server === void 0 ? void 0 : server.clients.get(clientId);
    }
    async closeServer(serverId, options = {}) {
        var _a;
        const keepClientsAlive = options.keepClientsAlive !== false;
        const executionId = options.executionId;
        console.error(`[DEBUG-REGISTRY] Attempting to close server with ID: ${serverId}. Keep clients alive: ${keepClientsAlive}, Execution ID: ${executionId || "none"}`);
        const server = this.servers.get(serverId);
        if (server) {
            if (executionId && !server.activeExecutions) {
                server.activeExecutions = new Set();
            }
            if (executionId && server.activeExecutions) {
                server.activeExecutions.add(executionId);
                console.error(`[DEBUG-REGISTRY] Registered execution ${executionId} for server ${serverId}. Active executions: ${server.activeExecutions.size}`);
            }
            if (executionId && server.activeExecutions && !keepClientsAlive) {
                server.activeExecutions.delete(executionId);
                console.error(`[DEBUG-REGISTRY] Removed execution ${executionId} from server ${serverId}. Remaining executions: ${server.activeExecutions.size}`);
            }
            const hasActiveExecutions = server.activeExecutions !== undefined &&
                server.activeExecutions.size > 0;
            const shouldKeepAlive = keepClientsAlive || hasActiveExecutions;
            if (hasActiveExecutions) {
                console.error(`[DEBUG-REGISTRY] Server ${serverId} has ${(_a = server.activeExecutions) === null || _a === void 0 ? void 0 : _a.size} active executions - forcing keepClientsAlive to true`);
            }
            if (!shouldKeepAlive) {
                server.clients.forEach(client => {
                    try {
                        client.close();
                    }
                    catch (error) {
                        console.error(`[DEBUG-REGISTRY] Error closing client connection:`, error);
                    }
                });
            }
            else {
                console.error(`[DEBUG-REGISTRY] Keeping ${server.clients.size} clients alive for server ${serverId}`);
            }
            if (!shouldKeepAlive) {
                await new Promise(resolve => {
                    server.wss.close(() => {
                        console.error(`[DEBUG-REGISTRY] Server fully closed. ID: ${serverId}`);
                        resolve();
                    });
                });
                this.servers.delete(serverId);
                console.error(`[DEBUG-REGISTRY] Server closed successfully. ID: ${serverId}`);
            }
            else {
                console.error(`[DEBUG-REGISTRY] Server soft-closed, connections maintained for ${serverId}`);
            }
            this.saveRegistry();
        }
    }
    listServers() {
        this.loadRegistry();
        console.error("=== [DEBUG-REGISTRY] Available WebSocket Servers ===");
        this.servers.forEach(({ wss, clients }, serverId) => {
            const address = wss.address();
            if (address && typeof address === "object") {
                console.error(`[DEBUG-REGISTRY] Server ID: ${serverId}`);
                console.error(`[DEBUG-REGISTRY] Port: ${address.port}`);
                console.error(`[DEBUG-REGISTRY] Path: ${wss.options.path}`);
                console.error(`[DEBUG-REGISTRY] Active Clients: ${clients.size}`);
                this.listClients(serverId);
            }
        });
        console.error("=== [DEBUG-REGISTRY] End of Server List ===");
    }
    listClients(serverId) {
        const server = this.servers.get(serverId);
        if (server) {
            server.clients.forEach((_, clientId) => {
                console.error(`[DEBUG-REGISTRY]   - Client ID: ${clientId}`);
            });
        }
    }
    broadcastToServer(serverId, message, callback) {
        const server = this.servers.get(serverId);
        if (!server) {
            console.error(`[DEBUG-REGISTRY] Server with ID ${serverId} not found for broadcast`);
            return;
        }
        console.error(`[DEBUG-REGISTRY] Broadcasting message to server ${serverId} with ${server.clients.size} clients`);
        server.clients.forEach((client, clientId) => {
            try {
                if (client.readyState === ws_1.default.OPEN) {
                    client.send(message);
                    if (callback) {
                        callback(client);
                    }
                    console.error(`[DEBUG-REGISTRY] Message sent to client ${clientId}`);
                }
                else {
                    console.error(`[DEBUG-REGISTRY] Skipping client ${clientId} - not open (state: ${client.readyState})`);
                }
            }
            catch (error) {
                console.error(`[DEBUG-REGISTRY] Error sending message to client ${clientId}:`, error);
            }
        });
    }
    registerExecution(serverId, executionId) {
        const server = this.servers.get(serverId);
        if (server) {
            if (!server.activeExecutions) {
                server.activeExecutions = new Set();
            }
            server.activeExecutions.add(executionId);
            console.error(`[DEBUG-REGISTRY] Registered execution ${executionId} for server ${serverId}. Active executions: ${server.activeExecutions.size}`);
        }
    }
    unregisterExecution(serverId, executionId) {
        const server = this.servers.get(serverId);
        if (server && server.activeExecutions) {
            server.activeExecutions.delete(executionId);
            console.error(`[DEBUG-REGISTRY] Unregistered execution ${executionId} from server ${serverId}. Remaining executions: ${server.activeExecutions.size}`);
        }
    }
}
exports.WebSocketRegistry = WebSocketRegistry;
//# sourceMappingURL=WebSocketRegistry.js.map