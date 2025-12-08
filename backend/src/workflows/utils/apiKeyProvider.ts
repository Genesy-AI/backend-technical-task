import * as dotenv from 'dotenv';

dotenv.config();

export const apiKeys = {
    orionConnect: process.env.ORION_CONNECT_API_KEY || '',
    astraDialer: process.env.ASTRA_DIALER_API_KEY || '',
    nimbusLookup: process.env.NIMBUS_LOOKUP_API_KEY || '',
} as const;

export function getApiKey(provider: keyof typeof apiKeys): string {
    const key = apiKeys[provider];
    if (!key) {
        throw new Error(`API key for provider "${provider}" is not configured`);
    }
    return key;
}