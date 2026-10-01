// tools-search.js
// Keyless search with strict memory/context guardrails to prevent browser OOM crashes

const SEARXNG_INSTANCES = [
    'https://searx.be',
    'https://cursus.space',
    'https://search.inetwork.fr'
];

// Hard character limit to protect browser-local model context windows from OOM
const MAX_CONTENT_LENGTH = 6000;
// Timeout (ms) for each individual fetch — prevents hanging on slow instances
const FETCH_TIMEOUT_MS = 10000;

/**
 * Fetch with an AbortController timeout.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export async function performWebSearch(query) {
    if (typeof query === 'object' && query !== null) {
        query = query.query || query.q || query.term || '';
    }
    query = String(query || '').trim();
    if (!query) {
        return [{ error: 'Search query cannot be empty.' }];
    }

    /** @type {Array<{title:string, url:string, snippet:string}>} */
    let candidateResults = [];

    // ── 1. General Web Search via Public SearXNG JSON API ────────────────
    for (const instance of SEARXNG_INSTANCES) {
        try {
            const searchUrl = `${instance}/search?q=${encodeURIComponent(query)}&format=json`;
            const res = await fetchWithTimeout(searchUrl, {
                headers: { 'Accept': 'application/json' }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    // Collect top 3 results for fallback crawling
                    candidateResults = data.results.slice(0, 3).map(r => ({
                        title: r.title || query,
                        url: r.url,
                        snippet: r.content || r.snippet || ''
                    }));
                    break;
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.warn(`SearXNG instance ${instance} timed out after ${FETCH_TIMEOUT_MS}ms`);
            } else {
                console.warn(`SearXNG instance ${instance} failed:`, e);
            }
        }
    }

    // ── 2. Fallback to Wikipedia API if SearXNG instances all fail ────────
    if (candidateResults.length === 0) {
        try {
            const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
            const res = await fetchWithTimeout(wikiUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.query && data.query.search && data.query.search.length > 0) {
                    candidateResults = data.query.search.slice(0, 3).map(item => ({
                        title: item.title,
                        url: `https://en.wikipedia.org/?curid=${item.pageid}`,
                        // Strip HTML tags and HTML entities from Wikipedia snippet
                        snippet: item.snippet ? item.snippet.replace(/<\/?[^>]+(>|$)|&[a-zA-Z0-9#]+;/g, '') : ''
                    }));
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.warn(`Wikipedia fallback timed out after ${FETCH_TIMEOUT_MS}ms`);
            } else {
                console.warn('Wikipedia search fallback failed:', e);
            }
        }
    }

    if (candidateResults.length === 0) {
        return [{ error: 'No search results found to crawl.' }];
    }

    // ── 3. Safe Auto-Crawl — try each candidate until we get non-empty content ──
    let fullPageText = candidateResults[0].snippet;
    let chosenResult = candidateResults[0];

    for (const candidate of candidateResults) {
        try {
            const crawlRes = await fetchWithTimeout(
                `https://r.jina.ai/${candidate.url}`,
                {
                    headers: {
                        'Accept': 'text/plain',
                        'X-Max-Tokens': '2000' // Instructs Jina Reader to trim response size
                    }
                }
            );

            if (crawlRes.ok) {
                let markdownText = await crawlRes.text();
                if (markdownText && markdownText.trim().length > 200) {
                    // Hard JavaScript safeguard: slice text if it exceeds browser safety limits
                    if (markdownText.length > MAX_CONTENT_LENGTH) {
                        markdownText = markdownText.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated to protect local browser memory limits...]';
                    }
                    fullPageText = markdownText;
                    chosenResult = candidate;
                    break; // Got good content — stop trying further results
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.warn(`Jina crawl timed out for ${candidate.url}`);
            } else {
                console.warn(`Auto-crawl failed for ${candidate.url}, trying next:`, e);
            }
        }
    }

    return [{
        engine: 'SearXNG / Wikipedia + Guarded Crawler',
        title: chosenResult.title,
        url: chosenResult.url,
        snippet: chosenResult.snippet,
        fullContent: fullPageText
    }];
}

/**
 * Unified tool runner wrapper.
 */
export async function executeSearch(query) {
    try {
        const results = await performWebSearch(query);
        const hasError = results && results.length > 0 && results[0].error;
        return {
            success: !hasError,
            results: hasError ? [] : results,
            error: hasError ? results[0].error : null
        };
    } catch (error) {
        return {
            success: false,
            results: [],
            error: error.message || 'Search operation failed.'
        };
    }
}