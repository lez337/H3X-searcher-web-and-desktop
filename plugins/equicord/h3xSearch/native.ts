import type {IpcMainInvokeEvent} from 'electron';
import type {CardItem} from './presentation';

// Add your own H3X custom domain here if you do not use workers.dev.
const CUSTOM_HOSTS: string[] = [];
export type SearchBy = 'both' | 'username' | 'id';
export async function search(_event: IpcMainInvokeEvent, site: string, key: string, userId: string, username: string, connectedUsernames: string[] = [], searchBy: SearchBy = 'both') {
    const url = new URL(site);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !(url.hostname.endsWith('.workers.dev') || CUSTOM_HOSTS.includes(url.hostname)))
        throw new Error('Use your HTTPS workers.dev URL, or add your H3X domain to CUSTOM_HOSTS in native.ts.');
    if (!/^h3x_[a-f0-9]{64}_[a-f0-9]{64}$/.test(key)) throw new Error('Set your H3X account API key in plugin settings.');
    if (typeof userId !== 'string' || !/^\d{14,20}$/.test(userId) || typeof username !== 'string' || !/^\S{2,32}$/.test(username) || /[\x00-\x1f\x7f]/.test(username)) throw new Error('Invalid Discord user.');
    if (!Array.isArray(connectedUsernames) || connectedUsernames.length > 10 || connectedUsernames.some(name => typeof name !== 'string' || !name.trim() || name.length > 100 || /[\x00-\x1f\x7f]/.test(name))) throw new Error('Invalid connected account names.');
    if (!['both', 'username', 'id'].includes(searchBy) || (searchBy === 'id' && connectedUsernames.length)) throw new Error('Invalid search selection.');
    const response = await fetch(new URL('/api/v1/discord/search', url.origin), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(connectedUsernames.length ? 245000 : 50000),
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`},
        body: JSON.stringify({userId, username, connectedUsernames, ...(searchBy === 'both' ? {} : {searchBy})})
    });
    // Bound data returned over IPC, including HTML error pages from a wrong server URL.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('H3X returned an empty response.');
    const decoder = new TextDecoder(); let text = '', bytes = 0;
    try {
        while (true) {
            const part = await reader.read(); if (part.done) break;
            bytes += part.value.length;
            if (bytes > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('H3X response too large.'); }
            text += decoder.decode(part.value, {stream: true});
        }
        text += decoder.decode();
    } finally { reader.releaseLock(); }
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('H3X returned an invalid response. Check the site URL and deployment.'); }
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `H3X returned HTTP ${response.status}.`);
    if (searchBy !== 'both' && data?.searchBy !== searchBy) throw new Error('Update and redeploy your H3X Worker to use username-only or Discord ID-only searches.');
    if (!data || typeof data.notice !== 'string' || !Array.isArray(data.items) || !Array.isArray(data.providerStatus) ||
        data.items.some((item: CardItem) => !item || typeof item.id !== 'string' || typeof item.source !== 'string' || typeof item.matchNote !== 'string' || !item.fields || typeof item.fields !== 'object' || Array.isArray(item.fields)) ||
        data.providerStatus.some((provider: {source: string; status: string; count: number; message?: string; httpStatus?: number}) => !provider || typeof provider.source !== 'string' || !['complete', 'error', 'skipped'].includes(provider.status) || !Number.isInteger(provider.count) || provider.count < 0 || (provider.message !== undefined && typeof provider.message !== 'string') || (provider.httpStatus !== undefined && !Number.isInteger(provider.httpStatus))))
        throw new Error('H3X returned an invalid search response. Check the site URL and deployment.');
    return data;
}
