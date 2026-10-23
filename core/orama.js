let oramaModule = null;

async function getOrama() {
    if (oramaModule) return oramaModule;
    try {
        oramaModule = await import('https://cdn.jsdelivr.net/npm/@orama/orama@2.0.24/dist/index.js');
        return oramaModule;
    } catch (_) {
        return {
            create: async (opts) => ({ docs: [], opts }),
            insert: async (db, doc) => { db.docs.push(doc); return doc.id; },
            search: async (db, params) => {
                const term = (params?.term || '').toLowerCase();
                const hits = db.docs
                    .filter(d => JSON.stringify(d).toLowerCase().includes(term))
                    .slice(0, params?.limit || 10)
                    .map(document => ({ document, score: 1 }));
                return { hits, count: hits.length };
            },
            save: async (db) => JSON.stringify(db.docs),
            load: async (db, data) => { db.docs = JSON.parse(data); },
        };
    }
}

export const create = async (opts) => (await getOrama()).create(opts);
export const insert = async (db, doc) => (await getOrama()).insert(db, doc);
export const search = async (db, params) => (await getOrama()).search(db, params);
export const save = async (db) => (await getOrama()).save(db);
export const load = async (db, data) => (await getOrama()).load(db, data);
