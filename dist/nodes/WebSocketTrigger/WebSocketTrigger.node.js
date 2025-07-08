"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketTrigger = void 0;
const WebSocketRegistry_1 = require("../WebSocketRegistry");
if (!global.websocketExecutionContext) {
    ;
    global.websocketExecutionContext = {
        servers: {},
        listeners: {},
    };
}
class WebSocketTrigger {
    constructor() {
        this.authPropertyName = 'authentication';
        this.description = {
            displayName: "WebSocket Trigger",
            name: "webSocketTrigger",
            icon: "fa:plug",
            group: ["trigger"],
            version: 1,
            description: "Starts the workflow when a WebSocket message is received",
            defaults: {
                name: "WebSocket Trigger",
            },
            inputs: [],
            outputs: ["main"],
            credentials: [
                {
                    name: 'httpBasicAuth',
                    required: true,
                    displayOptions: {
                        show: {
                            authentication: ['basicAuth'],
                        },
                    },
                },
                {
                    name: 'httpHeaderAuth',
                    required: true,
                    displayOptions: {
                        show: {
                            authentication: ['headerAuth'],
                        },
                    },
                },
                {
                    name: 'jwtAuth',
                    required: true,
                    displayOptions: {
                        show: {
                            authentication: ['jwtAuth'],
                        },
                    },
                },
            ],
            properties: [
                {
                    displayName: "Port",
                    name: "port",
                    type: "number",
                    default: 5680,
                    required: true,
                    description: "The port to listen on",
                },
                {
                    displayName: "Path",
                    name: "path",
                    type: "string",
                    default: "/ws",
                    required: true,
                    description: "The WebSocket server path",
                },
                {
                    displayName: "Connection ID",
                    name: "connectionId",
                    type: "string",
                    default: "",
                    required: false,
                    description: "Optional custom connection ID. If not provided, the port will be used",
                },
                {
                    displayName: "Authentication",
                    name: "authentication",
                    type: "options",
                    options: [
                        {
                            name: "Basic Auth",
                            value: "basicAuth",
                        },
                        {
                            name: "Header Auth",
                            value: "headerAuth",
                        },
                        {
                            name: "JWT Auth",
                            value: "jwtAuth",
                        },
                        {
                            name: "None",
                            value: "none",
                        },
                    ],
                    default: "none",
                    description: "The way to authenticate WebSocket connections",
                },
                {
                    displayName: "Info",
                    name: "info",
                    type: "notice",
                    default: "",
                    displayOptions: {
                        show: {
                            "@version": [1],
                        },
                    },
                    options: [
                        {
                            name: "info",
                            value: "The WebSocket server will be available at: ws://localhost:{port}{path}",
                        },
                    ],
                },
            ],
        };
    }
    async trigger() {
        const port = this.getNodeParameter("port");
        const path = this.getNodeParameter("path");
        const customConnectionId = this.getNodeParameter("connectionId", "");
        const authentication = this.getNodeParameter("authentication");
        const executionId = this.getExecutionId();
        const nodeId = this.getNode().id;
        const connectionId = customConnectionId || `${port}`;
        const serverId = `ws-${connectionId}`;
        console.error(`[DEBUG-TRIGGER] Creating WebSocket server with ID: ${serverId}`);
        console.error(`[DEBUG-TRIGGER] Execution ID: ${executionId}, Node ID: ${nodeId}`);
        const context = global.websocketExecutionContext;
        if (!context.servers) {
            context.servers = {};
        }
        if (!context.listeners) {
            context.listeners = {};
        }
        const registry = WebSocketRegistry_1.WebSocketRegistry.getInstance();
        console.error(`[DEBUG-TRIGGER] Current WebSocket Servers (Before Creation) ===`);
        registry.listServers();
        try {
            const isWorkflowEdit = executionId === undefined;
            console.error(`[DEBUG-TRIGGER] Is workflow edit: ${isWorkflowEdit}`);
            await registry.closeServer(serverId, {
                keepClientsAlive: !isWorkflowEdit,
                executionId,
            });
            const serverConfig = {
                port,
                path,
                authentication: authentication !== 'none' ? {
                    type: authentication,
                    getCredentials: async (type) => {
                        try {
                            return await this.getCredentials(type);
                        }
                        catch (error) {
                            console.error(`[DEBUG-TRIGGER] Failed to get credentials for ${type}:`, error);
                            return undefined;
                        }
                    }
                } : undefined
            };
            const wss = await registry.getOrCreateServer(serverId, serverConfig);
            console.error(`[DEBUG-TRIGGER] WebSocket server created/retrieved successfully`);
            const oldListeners = context.listeners[serverId];
            if (oldListeners) {
                console.error(`[DEBUG-TRIGGER] Removing ${oldListeners.size} old listeners for server ${serverId}`);
                for (const listener of oldListeners) {
                    wss.off("message", listener);
                }
                oldListeners.clear();
            }
            registry.registerExecution(serverId, executionId);
            context.servers[serverId] = {
                serverId,
                port,
                path,
                nodeId,
                executionId,
                active: true,
            };
            console.error(`[DEBUG-TRIGGER] Server added to execution context: ${JSON.stringify(context.servers[serverId])}`);
            const executeTrigger = async (data) => {
                try {
                    const outputData = {
                        ...data,
                        serverId,
                        path,
                        port,
                        nodeId,
                        executionId,
                        clientId: data.clientId,
                        contextInfo: context.servers[serverId],
                    };
                    console.error(`[DEBUG-TRIGGER] Received message. Server ID: ${serverId}, Client ID: ${data.clientId}`);
                    this.emit([this.helpers.returnJsonArray([outputData])]);
                }
                catch (error) {
                    console.error(`[DEBUG-TRIGGER] Error in trigger execution:`, error);
                }
            };
            if (!context.listeners[serverId]) {
                context.listeners[serverId] = new Set();
            }
            context.listeners[serverId].add(executeTrigger);
            wss.on("message", executeTrigger);
            console.error(`[DEBUG-TRIGGER] Added new listener for server ${serverId}`);
            const server = registry.getServer(serverId);
            if (!server) {
                throw new Error(`Failed to verify server ${serverId} is running`);
            }
            const self = this;
            const isManualTrigger = !!this.getNodeParameter("manualTrigger", false);
            if (!context.executionCounts) {
                context.executionCounts = {};
            }
            context.executionCounts[serverId] =
                (context.executionCounts[serverId] || 0) + 1;
            const executionCount = context.executionCounts[serverId];
            console.error(`[DEBUG-TRIGGER] Execution count for server ${serverId}: ${executionCount}`);
            async function closeFunction() {
                console.error(`[DEBUG-TRIGGER] Closing WebSocket server with ID: ${serverId}`);
                if (context.listeners && context.listeners[serverId]) {
                    context.listeners[serverId].delete(executeTrigger);
                    console.error(`[DEBUG-TRIGGER] Removed listener for server ${serverId}`);
                }
                if (context.servers && context.servers[serverId]) {
                    context.servers[serverId].active = false;
                }
                registry.unregisterExecution(serverId, executionId);
                const shouldHardClose = isWorkflowEdit;
                console.error(`[DEBUG-TRIGGER] Using hard close: ${shouldHardClose}`);
                if (shouldHardClose) {
                    await registry.closeServer(serverId, {
                        keepClientsAlive: false,
                        executionId,
                    });
                    console.error(`[DEBUG-TRIGGER] Hard closed server due to workflow edit`);
                }
                else {
                    await registry.closeServer(serverId, {
                        keepClientsAlive: true,
                        executionId,
                    });
                    console.error(`[DEBUG-TRIGGER] Soft-closed server to keep connections open for response nodes`);
                }
                if (context.servers && context.servers[serverId]) {
                    delete context.servers[serverId];
                }
                if (context.listeners && context.listeners[serverId]) {
                    delete context.listeners[serverId];
                }
                console.error(`[DEBUG-TRIGGER] Cleaned up global context for server ${serverId}`);
            }
            return {
                closeFunction,
            };
        }
        catch (error) {
            console.error(`[DEBUG-TRIGGER] Error in WebSocket trigger:`, error);
            throw error;
        }
    }
}
exports.WebSocketTrigger = WebSocketTrigger;
//# sourceMappingURL=WebSocketTrigger.node.js.map