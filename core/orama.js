import { create as oCreate, insert as oInsert, search as oSearch, save as oSave, load as oLoad } from 'https://cdn.jsdelivr.net/npm/@orama/orama@2.0.24/dist/index.js';

export const create = async (opts) => await oCreate(opts);
export const insert = async (db, doc) => await oInsert(db, doc);
export const search = async (db, params) => await oSearch(db, params);
export const save = async (db) => await oSave(db);
export const load = async (db, data) => await oLoad(db, data);
