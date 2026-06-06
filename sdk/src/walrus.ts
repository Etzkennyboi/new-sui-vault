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

export class WalrusClient {
  private publisherUrl: string;
  private aggregatorUrl: string;

  constructor(publisherUrl: string, aggregatorUrl: string) {
    this.publisherUrl = publisherUrl.replace(/\/$/, '');
    this.aggregatorUrl = aggregatorUrl.replace(/\/$/, '');
  }

  /**
   * Upload JSON object as a blob to Walrus.
   * @param data JSON object to store.
   * @returns The unique blobId string.
   */
  async storeBlob(data: object): Promise<string> {
    const jsonString = JSON.stringify(data);
    const encoder = new TextEncoder();
    const buffer = encoder.encode(jsonString);

    // PUT to /v1/blobs?epochs=1
    const response = await fetch(`${this.publisherUrl}/v1/blobs?epochs=1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    });

    if (!response.ok) {
      throw new Error(`Failed to store blob on Walrus: ${response.statusText}`);
    }

    const result = (await response.json()) as WalrusStoreResponse;
    const blobId = result.newlyCreated?.blobObject?.blobId || result.alreadyCertified?.blobId;

    if (!blobId) {
      throw new Error(`No blob ID returned from Walrus. Response: ${JSON.stringify(result)}`);
    }

    return blobId;
  }

  /**
   * Retrieve JSON blob content from Walrus.
   * @param blobId The blob ID to fetch.
   * @returns Parsed JSON object.
   */
  async getBlob(blobId: string): Promise<any> {
    const response = await fetch(`${this.aggregatorUrl}/v1/blobs/${blobId}`);

    if (!response.ok) {
      throw new Error(`Failed to retrieve blob ${blobId} from Walrus: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    const jsonString = decoder.decode(arrayBuffer);

    return JSON.parse(jsonString);
  }

  /**
   * Performs client-side SHA-256 hash verification on retrieved content.
   * Uses the browser-native Web Crypto API (works in both Node 20+ and browsers).
   * @param content Raw Uint8Array or ArrayBuffer content to hash
   * @returns Hex-encoded SHA-256 hash string
   */
  async verifyContentHash(content: Uint8Array | ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', content as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

