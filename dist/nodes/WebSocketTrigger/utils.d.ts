import type { IncomingMessage } from 'http';
import type { IDataObject, ICredentialDataDecryptedObject } from 'n8n-workflow';
export declare class WebSocketAuthorizationError extends Error {
    responseCode: number;
    constructor(responseCode: number, message?: string);
}
export declare function validateWebSocketAuthentication(req: IncomingMessage, authentication: string, getCredentials: (type: string) => Promise<ICredentialDataDecryptedObject | undefined>): Promise<IDataObject | undefined>;
