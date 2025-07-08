"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateWebSocketAuthentication = exports.WebSocketAuthorizationError = void 0;
const basic_auth_1 = __importDefault(require("basic-auth"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class WebSocketAuthorizationError extends Error {
    constructor(responseCode, message) {
        super(message || 'Authorization failed');
        this.responseCode = responseCode;
        this.name = 'WebSocketAuthorizationError';
    }
}
exports.WebSocketAuthorizationError = WebSocketAuthorizationError;
async function validateWebSocketAuthentication(req, authentication, getCredentials) {
    if (authentication === 'none')
        return;
    const headers = req.headers;
    if (authentication === 'basicAuth') {
        let expectedAuth;
        try {
            expectedAuth = await getCredentials('httpBasicAuth');
        }
        catch { }
        if (expectedAuth === undefined || !expectedAuth.user || !expectedAuth.password) {
            throw new WebSocketAuthorizationError(500, 'No authentication data defined on node!');
        }
        const providedAuth = (0, basic_auth_1.default)(req);
        if (!providedAuth)
            throw new WebSocketAuthorizationError(401);
        if (providedAuth.name !== expectedAuth.user || providedAuth.pass !== expectedAuth.password) {
            throw new WebSocketAuthorizationError(403);
        }
    }
    else if (authentication === 'headerAuth') {
        let expectedAuth;
        try {
            expectedAuth = await getCredentials('httpHeaderAuth');
        }
        catch { }
        if (expectedAuth === undefined || !expectedAuth.name || !expectedAuth.value) {
            throw new WebSocketAuthorizationError(500, 'No authentication data defined on node!');
        }
        const headerName = expectedAuth.name.toLowerCase();
        const expectedValue = expectedAuth.value;
        if (!headers.hasOwnProperty(headerName) ||
            headers[headerName] !== expectedValue) {
            throw new WebSocketAuthorizationError(403);
        }
    }
    else if (authentication === 'jwtAuth') {
        let expectedAuth;
        try {
            expectedAuth = await getCredentials('jwtAuth');
        }
        catch { }
        if (expectedAuth === undefined) {
            throw new WebSocketAuthorizationError(500, 'No authentication data defined on node!');
        }
        const authHeader = req.headers.authorization;
        const token = authHeader === null || authHeader === void 0 ? void 0 : authHeader.split(' ')[1];
        if (!token) {
            throw new WebSocketAuthorizationError(401, 'No token provided');
        }
        let secretOrPublicKey;
        if (expectedAuth.keyType === 'passphrase') {
            secretOrPublicKey = expectedAuth.secret;
        }
        else {
            secretOrPublicKey = expectedAuth.publicKey;
        }
        try {
            return jsonwebtoken_1.default.verify(token, secretOrPublicKey, {
                algorithms: [expectedAuth.algorithm],
            });
        }
        catch (error) {
            throw new WebSocketAuthorizationError(403, error.message);
        }
    }
}
exports.validateWebSocketAuthentication = validateWebSocketAuthentication;
//# sourceMappingURL=utils.js.map