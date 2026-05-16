export {};

declare global {
  interface Window {
    Omise?: {
      setPublicKey(key: string): void;
      createToken(
        type: 'card',
        tokenParameters: Record<string, string | number>,
        callback: (statusCode: number, response: OmiseTokenResponse) => void,
      ): void;
    };
  }
}

interface OmiseTokenResponse {
  object?: string;
  id?: string;
  message?: string;
}
