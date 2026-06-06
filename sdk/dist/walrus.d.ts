export interface WalrusStoreResponse {
    newlyCreated?: {
        blobObject: {
            blobId: string;
        };
    };
    alreadyCertified?: {
        blobId: string;
    };
}
export declare class WalrusClient {
    private publisherUrl;
    private aggregatorUrl;
    constructor(publisherUrl: string, aggregatorUrl: string);
    /**
     * Upload JSON object as a blob to Walrus.
     * @param data JSON object to store.
     * @returns The unique blobId string.
     */
    storeBlob(data: object): Promise<string>;
    /**
     * Retrieve JSON blob content from Walrus.
     * @param blobId The blob ID to fetch.
     * @returns Parsed JSON object.
     */
    getBlob(blobId: string): Promise<any>;
    /**
     * Performs client-side SHA-256 hash verification on retrieved content.
     * Uses the browser-native Web Crypto API (works in both Node 20+ and browsers).
     * @param content Raw Uint8Array or ArrayBuffer content to hash
     * @returns Hex-encoded SHA-256 hash string
     */
    verifyContentHash(content: Uint8Array | ArrayBuffer): Promise<string>;
}
