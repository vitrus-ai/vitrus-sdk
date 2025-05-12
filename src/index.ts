/**
 * Vitrus SDK
 * 
 * A TypeScript client for interfacing with the Vitrus WebSocket server.
 * Provides an Actor/Agent communication model with workflow orchestration.
 */

// Load version dynamically - avoiding JSON import which requires TypeScript config changes
let SDK_VERSION = '0.1.4'; // Fallback version matching package.json
try {
    // For Node.js/Bun environments
    if (typeof require !== 'undefined') {
        const pkg = require('../package.json');
        SDK_VERSION = pkg.version;
    }
} catch (e) {
    // Fallback to hardcoded version if package.json can't be loaded
    console.warn('Could not load version from package.json, using fallback version');
}

// Types for message handling
interface HandshakeMessage {
    type: 'HANDSHAKE';
    apiKey: string;
    worldId?: string;
    actorName?: string;
    metadata?: any; // Actor metadata for registration
}

interface HandshakeResponseMessage {
    type: 'HANDSHAKE_RESPONSE';
    success: boolean;
    clientId: string;
    redisChannel?: string;
    message?: string;
    actorInfo?: {
        metadata: any;
        registeredCommands: Array<{
            name: string;
            parameterTypes: Array<string>;
        }>;
    };
}

interface CommandMessage {
    type: 'COMMAND';
    targetActorName: string;
    commandName: string;
    args: any;
    requestId: string;
    sourceChannel?: string; // Channel to reply to
}

interface ResponseMessage {
    type: 'RESPONSE';
    targetChannel: string;
    requestId: string;
    result?: any;
    error?: string;
}

interface RegisterCommandMessage {
    type: 'REGISTER_COMMAND';
    actorName: string;
    commandName: string;
    parameterTypes: Array<string>; // Array of parameter types
}

interface WorkflowMessage {
    type: 'WORKFLOW';
    workflowName: string;
    args: any;
    requestId: string;
}

interface WorkflowResultMessage {
    type: 'WORKFLOW_RESULT';
    requestId: string;
    result?: any;
    error?: string;
}

// Utility for extracting parameter types from function signatures
function getParameterTypes(func: Function): Array<string> {
    // Convert function to string and analyze parameters
    const funcStr = func.toString();
    const argsMatch = funcStr.match(/\(([^)]*)\)/);
    
    if (!argsMatch || !argsMatch[1].trim()) {
        return [];
    }
    
    const args = argsMatch[1].split(',');
    return args.map(arg => {
        // Try to extract type information if available
        const typeMatch = arg.trim().match(/(.*?):(.*)/);
        if (typeMatch && typeMatch[2]) {
            return typeMatch[2].trim();
        }
        return 'any';
    });
}

// Actor/Player class
class Actor {
    private vitrus: Vitrus;
    private name: string;
    private metadata: any;
    private commandHandlers: Map<string, Function> = new Map();

    constructor(vitrus: Vitrus, name: string, metadata: any = {}) {
        this.vitrus = vitrus;
        this.name = name;
        this.metadata = metadata;
    }

    /**
     * Register a command handler
     */
    on(commandName: string, handler: Function): Actor {
        this.commandHandlers.set(commandName, handler);
        
        // Extract parameter types
        const parameterTypes = getParameterTypes(handler);
        
        // Register with Vitrus
        this.vitrus.registerActorCommandHandler(this.name, commandName, handler, parameterTypes);
        
        // Register command with server
        this.vitrus.registerCommand(this.name, commandName, parameterTypes);
        
        return this;
    }

    /**
     * Run a command on an actor
     */
    async run(commandName: string, ...args: any[]): Promise<any> {
        return this.vitrus.runCommand(this.name, commandName, args);
    }
    
    /**
     * Get actor metadata
     */
    getMetadata(): any {
        return this.metadata;
    }
    
    /**
     * Update actor metadata
     */
    updateMetadata(newMetadata: any): void {
        this.metadata = { ...this.metadata, ...newMetadata };
        // TODO: Send metadata update to server
    }
}

// Scene class
class Scene {
    private vitrus: Vitrus;
    private sceneId: string;

    constructor(vitrus: Vitrus, sceneId: string) {
        this.vitrus = vitrus;
        this.sceneId = sceneId;
    }

    /**
     * Set a structure to the scene
     */
    set(structure: any): void {
        // Implementation would update scene structure
    }

    /**
     * Add an object to the scene
     */
    add(object: any): void {
        // Implementation would add object to scene
    }

    /**
     * Update an object in the scene
     */
    update(params: { id: string, [key: string]: any }): void {
        // Implementation would update object in scene
    }

    /**
     * Remove an object from the scene
     */
    remove(objectId: string): void {
        // Implementation would remove object from scene
    }

    /**
     * Get the scene
     */
    get(): any {
        // Implementation would fetch scene data
        return { id: this.sceneId };
    }
}

// EventEmitter-like interface
interface EventEmitter {
    on(event: string, listener: (...args: any[]) => void): void;
    removeListener(event: string, listener: (...args: any[]) => void): void;
    send(data: string): void;
    close(): void;
    readonly readyState: number;
}

// Main Vitrus class
class Vitrus {
    private ws: EventEmitter | null = null;
    private apiKey: string;
    private worldId?: string;
    private clientId: string = '';
    private connected: boolean = false;
    private authenticated: boolean = false;
    private messageHandlers: Map<string, Function[]> = new Map();
    private pendingRequests: Map<string, { resolve: Function, reject: Function }> = new Map();
    private actorCommandHandlers: Map<string, Map<string, Function>> = new Map();
    private actorCommandSignatures: Map<string, Map<string, Array<string>>> = new Map();
    private actorMetadata: Map<string, any> = new Map();
    private baseUrl: string;
    private debug: boolean;
    private actorName?: string;
    private connectionPromise: Promise<void> | null = null;
    private redisChannel?: string;

    // WebSocket readyState constants
    private static readonly OPEN = 1;

    constructor({ 
        apiKey, 
        world, 
        baseUrl = 'ws://localhost:3001', 
        debug = false 
    }: { 
        apiKey: string, 
        world?: string, 
        baseUrl?: string, 
        debug?: boolean 
    }) {
        this.apiKey = apiKey;
        this.worldId = world;
        this.baseUrl = baseUrl;
        this.debug = debug;
        
        if (this.debug) {
            console.log(`[Vitrus v${SDK_VERSION}] Initializing with options:`, { apiKey, world, baseUrl, debug });
        }
        // Don't connect automatically - wait for authenticate() or explicit connect()
    }

    /**
     * Connect to the WebSocket server with authentication
     * @internal This is mainly for internal use, users should use authenticate()
     */
    async connect(actorName?: string, metadata?: any): Promise<void> {
        // If already connecting, return existing promise
        if (this.connectionPromise) {
            return this.connectionPromise;
        }
        
        // Use the values from previous authenticate call if not provided here
        this.actorName = actorName || this.actorName;
        
        // Store metadata if provided
        if (this.actorName && metadata) {
            this.actorMetadata.set(this.actorName, metadata);
        }
        
        this.connectionPromise = this._connect();
        return this.connectionPromise;
    }
    
    /**
     * Internal connection implementation
     */
    private async _connect(): Promise<void> {
        try {
            if (this.debug) console.log('[Vitrus] Attempting to connect to WebSocket server:', this.baseUrl);
            
            // Build base connection URL
            const url = new URL(this.baseUrl);
            url.searchParams.append('apiKey', this.apiKey);
            if (this.worldId) {
                url.searchParams.append('worldId', this.worldId);
            }
            
            // Add actor name if available
            if (this.actorName) {
                url.searchParams.append('actorName', this.actorName);
            }
            
            // For Node.js environments, require ws module
            // For browser environments, use the built-in WebSocket
            // @ts-ignore - Ignoring type issues for simplicity
            const WS = typeof require !== 'undefined' ? require('ws') : WebSocket;

            // @ts-ignore - Create the WebSocket instance
            this.ws = new WS(url.toString());

            if (!this.ws) {
                throw new Error('Failed to create WebSocket instance');
            }

            // Setup event handlers with null checks
            if (this.ws) {
                this.ws.on('open', () => {
                    this.connected = true;
                    if (this.debug) console.log('[Vitrus] Connected to WebSocket server');
                    
                    // Send initial handshake with metadata if this is an actor
                    if (this.actorName) {
                        const metadata = this.actorMetadata.get(this.actorName) || {};
                        const handshake: HandshakeMessage = {
                            type: 'HANDSHAKE',
                            apiKey: this.apiKey,
                            worldId: this.worldId,
                            actorName: this.actorName,
                            metadata
                        };
                        this.ws?.send(JSON.stringify(handshake));
                    }
                });

                this.ws.on('message', (data: any) => {
                    try {
                        const message = JSON.parse(typeof data === 'string' ? data : data.toString());
                        if (this.debug) console.log('[Vitrus] Received message:', message);
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                });

                this.ws.on('close', () => {
                    this.connected = false;
                    this.authenticated = false;
                    this.connectionPromise = null;
                    
                    const error = new Error('WebSocket connection closed unexpectedly');
                    console.error(error);
                    
                    // Reject any pending requests with the error
                    for (const [requestId, { reject }] of this.pendingRequests.entries()) {
                        reject(error);
                        this.pendingRequests.delete(requestId);
                    }
                    
                    if (this.debug) console.log('[Vitrus] Disconnected from WebSocket server');
                });

                this.ws.on('error', (error: Error) => {
                    console.error('WebSocket error:', error);
                    if (this.debug) console.log('[Vitrus] WebSocket error:', error);
                });
            }
            
            // Wait for authentication response
            await this.waitForAuthentication();
        } catch (error) {
            this.connectionPromise = null;
            console.error('Failed to initialize WebSocket:', error);
            if (this.debug) console.log('[Vitrus] Failed to initialize WebSocket:', error);
            throw new Error('WebSocket initialization failed. In Node.js environments, please install the "ws" package.');
        }
    }

    private async waitForConnection(): Promise<void> {
        if (this.connected) return;
        
        if (this.debug) console.log('[Vitrus] Waiting for connection...');
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (this.connected) {
                    clearInterval(checkInterval);
                    if (this.debug) console.log('[Vitrus] Connection established');
                    resolve();
                }
            }, 100);
        });
    }
    
    private async waitForAuthentication(): Promise<void> {
        if (this.authenticated) return;
        
        if (this.debug) console.log('[Vitrus] Waiting for authentication...');
        return new Promise((resolve, reject) => {
            const handleAuthResponse = (message: any) => {
                if (message.type === 'HANDSHAKE_RESPONSE') {
                    const response = message as HandshakeResponseMessage;
                    if (response.success) {
                        this.clientId = response.clientId;
                        this.redisChannel = response.redisChannel;
                        this.authenticated = true;
                        
                        // If actor info was included, restore it
                        if (response.actorInfo && this.actorName) {
                            // Store the actor metadata
                            this.actorMetadata.set(this.actorName, response.actorInfo.metadata);
                            
                            // Re-register existing commands if available
                            if (response.actorInfo.registeredCommands) {
                                if (this.debug) console.log('[Vitrus] Restoring registered commands:', response.actorInfo.registeredCommands);
                                
                                // Create a signature map if it doesn't exist
                                if (!this.actorCommandSignatures.has(this.actorName)) {
                                    this.actorCommandSignatures.set(this.actorName, new Map());
                                }
                                
                                // Restore command signatures
                                const signatures = this.actorCommandSignatures.get(this.actorName)!;
                                for (const cmd of response.actorInfo.registeredCommands) {
                                    signatures.set(cmd.name, cmd.parameterTypes);
                                }
                            }
                        }
                        
                        if (this.debug) console.log('[Vitrus] Authentication successful, clientId:', this.clientId);
                        if (this.ws) {
                            this.ws.removeListener('message', handleAuthResponseWrapper);
                        }
                        resolve();
                    } else {
                        if (this.debug) console.log('[Vitrus] Authentication failed:', response.message);
                        if (this.ws) {
                            this.ws.removeListener('message', handleAuthResponseWrapper);
                        }
                        reject(new Error(response.message || 'Authentication failed'));
                    }
                }
            };

            const handleAuthResponseWrapper = (data: any) => {
                try {
                    const message = JSON.parse(typeof data === 'string' ? data : data.toString());
                    handleAuthResponse(message);
                } catch (error) {
                    // Ignore parse errors
                }
            };

            if (this.ws) {
                this.ws.on('message', handleAuthResponseWrapper);
            }
        });
    }

    private async sendMessage(message: any): Promise<void> {
        // Ensure we're connected
        if (!this.connected) {
            await this.connect();
        }
        
        if (this.ws && this.ws.readyState === Vitrus.OPEN) {
            if (this.debug) console.log('[Vitrus] Sending message:', message);
            this.ws.send(JSON.stringify(message));
        } else {
            if (this.debug) console.log('[Vitrus] Failed to send message - WebSocket not connected');
            throw new Error('WebSocket is not connected');
        }
    }

    private handleMessage(message: any): void {
        const { type } = message;

        // Handle handshake response
        if (type === 'HANDSHAKE_RESPONSE') {
            const response = message as HandshakeResponseMessage;
            if (response.success) {
                this.clientId = response.clientId;
                this.redisChannel = response.redisChannel;
                this.authenticated = true;
                
                // Process actor info if available
                if (response.actorInfo && this.actorName) {
                    this.actorMetadata.set(this.actorName, response.actorInfo.metadata);
                    
                    // Process command signatures
                    if (response.actorInfo.registeredCommands) {
                        if (!this.actorCommandSignatures.has(this.actorName)) {
                            this.actorCommandSignatures.set(this.actorName, new Map());
                        }
                        
                        const signatures = this.actorCommandSignatures.get(this.actorName)!;
                        for (const cmd of response.actorInfo.registeredCommands) {
                            signatures.set(cmd.name, cmd.parameterTypes);
                        }
                    }
                }
                
                if (this.debug) console.log('[Vitrus] Handshake successful, clientId:', this.clientId);
            } else {
                console.error('Handshake failed:', response.message);
                if (this.debug) console.log('[Vitrus] Handshake failed:', response.message);
            }
            return;
        }

        // Handle command from another client
        if (type === 'COMMAND') {
            if (this.debug) console.log('[Vitrus] Received command:', message);
            this.handleCommand(message);
            return;
        }

        // Handle workflow results
        if (type === 'WORKFLOW_RESULT') {
            const { requestId, result, error } = message as WorkflowResultMessage;
            if (this.debug) console.log('[Vitrus] Received workflow result for requestId:', requestId, { result, error });
            
            const pending = this.pendingRequests.get(requestId);
            if (pending) {
                if (error) {
                    pending.reject(new Error(error));
                } else {
                    pending.resolve(result);
                }
                this.pendingRequests.delete(requestId);
            }
            return;
        }

        // Handle custom messages
        const handlers = this.messageHandlers.get(type) || [];
        for (const handler of handlers) {
            handler(message);
        }
    }

    private handleCommand(message: CommandMessage): void {
        const { commandName, args, requestId, targetActorName, sourceChannel } = message;
        
        if (this.debug) console.log('[Vitrus] Handling command:', { commandName, targetActorName, requestId });

        const actorHandlers = this.actorCommandHandlers.get(targetActorName);
        if (actorHandlers) {
            const handler = actorHandlers.get(commandName);
            if (handler) {
                if (this.debug) console.log('[Vitrus] Found handler for command:', commandName);
                
                Promise.resolve()
                    .then(() => handler(...args))
                    .then((result) => {
                        if (this.debug) console.log('[Vitrus] Command executed successfully:', { commandName, result });
                        this.sendResponse({
                            type: 'RESPONSE',
                            targetChannel: sourceChannel || '',
                            requestId,
                            result,
                        });
                    })
                    .catch((error: Error) => {
                        if (this.debug) console.log('[Vitrus] Command execution failed:', { commandName, error: error.message });
                        this.sendResponse({
                            type: 'RESPONSE',
                            targetChannel: sourceChannel || '',
                            requestId,
                            error: error.message,
                        });
                    });
            } else if (this.debug) {
                console.log('[Vitrus] No handler found for command:', commandName);
            }
        } else if (this.debug) {
            console.log('[Vitrus] No actor found with name:', targetActorName);
        }
    }

    private sendResponse(response: ResponseMessage): void {
        if (this.debug) console.log('[Vitrus] Sending response:', response);
        this.sendMessage(response);
    }
    
    /**
     * Register a command with the server
     */
    async registerCommand(actorName: string, commandName: string, parameterTypes: Array<string>): Promise<void> {
        if (this.debug) console.log('[Vitrus] Registering command with server:', { actorName, commandName, parameterTypes });
        
        const message: RegisterCommandMessage = {
            type: 'REGISTER_COMMAND',
            actorName,
            commandName,
            parameterTypes
        };
        
        await this.sendMessage(message);
    }

    private generateRequestId(): string {
        const requestId = Math.random().toString(36).substring(2, 15);
        if (this.debug) console.log('[Vitrus] Generated requestId:', requestId);
        return requestId;
    }

    /**
     * Authenticate with the API
     */
    async authenticate(actorName?: string, metadata?: any): Promise<boolean> {
        if (this.debug) console.log('[Vitrus] Authenticating', actorName ? `with actor name: ${actorName}` : '');
        
        // Store actor name and metadata for use in connection
        this.actorName = actorName;
        if (actorName && metadata) {
            this.actorMetadata.set(actorName, metadata);
        }
        
        // Connect or reconnect with the provided actor name and metadata
        await this.connect(actorName, metadata);
        return this.authenticated;
    }

    /**
     * Register a command handler for an actor
     */
    registerActorCommandHandler(actorName: string, commandName: string, handler: Function, parameterTypes: Array<string> = []): void {
        if (this.debug) console.log('[Vitrus] Registering command handler:', { actorName, commandName, parameterTypes });
        
        // Store the command handler
        if (!this.actorCommandHandlers.has(actorName)) {
            this.actorCommandHandlers.set(actorName, new Map());
        }
        const actorHandlers = this.actorCommandHandlers.get(actorName)!;
        actorHandlers.set(commandName, handler);
        
        // Store the parameter types
        if (!this.actorCommandSignatures.has(actorName)) {
            this.actorCommandSignatures.set(actorName, new Map());
        }
        const actorSignatures = this.actorCommandSignatures.get(actorName)!;
        actorSignatures.set(commandName, parameterTypes);
    }

    /**
     * Create or get an actor
     */
    actor(name: string, options: any = {}): Actor {
        if (this.debug) console.log('[Vitrus] Creating actor:', name, options);
        
        // Store actor metadata
        this.actorMetadata.set(name, options);
        
        // Create actor instance but don't connect yet
        const actor = new Actor(this, name, options);
        
        // If not authenticated yet, auto-authenticate with this actor name
        if (!this.authenticated) {
            this.authenticate(name, options).catch(error => {
                console.error(`Failed to auto-authenticate actor ${name}:`, error);
            });
        }
        
        return actor;
    }

    /**
     * Get a scene
     */
    scene(sceneId: string): Scene {
        if (this.debug) console.log('[Vitrus] Getting scene:', sceneId);
        return new Scene(this, sceneId);
    }

    /**
     * Run a command on an actor
     */
    async runCommand(actorName: string, commandName: string, args: any[]): Promise<any> {
        if (this.debug) console.log('[Vitrus] Running command:', { actorName, commandName, args });
        
        // If not authenticated yet, auto-authenticate
        if (!this.authenticated) {
            await this.authenticate();
        }
        
        const requestId = this.generateRequestId();

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });

            const command: CommandMessage = {
                type: 'COMMAND',
                targetActorName: actorName,
                commandName,
                args,
                requestId,
            };

            this.sendMessage(command)
                .catch((error) => {
                    if (this.debug) console.log('[Vitrus] Failed to send command:', error);
                    this.pendingRequests.delete(requestId);
                    reject(error);
                });
        });
    }

    /**
     * Run a workflow
     */
    async workflow(workflowName: string, args: any = {}): Promise<any> {
        if (this.debug) console.log('[Vitrus] Running workflow:', { workflowName, args });
        
        // Automatically authenticate if not authenticated yet
        if (!this.authenticated) {
            await this.authenticate();
        }
        
        const requestId = this.generateRequestId();

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });

            const workflow: WorkflowMessage = {
                type: 'WORKFLOW',
                workflowName,
                args,
                requestId,
            };

            this.sendMessage(workflow)
                .catch((error) => {
                    if (this.debug) console.log('[Vitrus] Failed to send workflow:', error);
                    this.pendingRequests.delete(requestId);
                    reject(error);
                });
        });
    }

    /**
     * Upload an image
     */
    async upload_image(image: any, filename: string = "image"): Promise<string> {
        if (this.debug) console.log('[Vitrus] Uploading image:', filename);
        // Implementation would handle image uploads
        // For now, just return a mock URL
        return `https://vitrus.io/images/${filename}`;
    }

    /**
     * Add a record
     */
    async add_record(data: any, name?: string): Promise<string> {
        if (this.debug) console.log('[Vitrus] Adding record:', { data, name });
        // Implementation would store the record
        // For now, just return success
        return name || this.generateRequestId();
    }
}

export default Vitrus;
