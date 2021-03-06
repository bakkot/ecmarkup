import Production from './Production';

class EnvRec extends Array<BiblioEntry> {
  _parent: EnvRec | undefined;
  _namespace: string;
  _children: EnvRec[];
  _byType: { [key: string]: BiblioEntry[] };
  _byLocation: { [key: string]: BiblioEntry[] };
  _byProductionName: { [key: string]: ProductionBiblioEntry };
  _byAoid: { [key: string]: AlgorithmBiblioEntry };

  constructor (parent: EnvRec | undefined, namespace: string) {
    super();

    this._parent = parent;
    this._children = [];
    if (this._parent) {
      this._parent._children.push(this);
    }

    this._namespace = namespace;
    this._byType = {};
    this._byLocation = {};
    this._byProductionName = {};
    this._byAoid = {};
  }

  push(...items: BiblioEntry[]) {
    for (const item of items) {
      item.location = item.location || '';
      item.referencingIds = item.referencingIds || [];

      pushKey(this._byType, item.type, item);
      pushKey(this._byLocation, item.location, item);

      if (item.type === 'clause' && item.aoid) {
        const op: BiblioEntry = {
          type: 'op',
          aoid: item.aoid,
          refId: item.id,
          location: item.location,
          referencingIds: []
        };
        this.push(op);
      }

      if (item.type === 'op') {
        this._byAoid[item.aoid] = item;
      }

      if (item.type === 'production') {
        this._byProductionName[item.name] = item;
      }

      if (!item.key) {
        item.key = getKey(item);
      }
    }

    return super.push(...items);
  }
}

// Map, etc. returns array.
Object.defineProperty(EnvRec, Symbol.species, { value: Array });

/*@internal*/
export default class Biblio {
  private _byId: { [id: string]: BiblioEntry; };
  private _location: string;
  private _root: EnvRec;
  private _nsToEnvRec: { [namespace: string]: EnvRec | undefined; };

  constructor(location: string) {
    this._byId = {};
    this._location = location;
    this._root = new EnvRec(undefined, 'global');
    this._nsToEnvRec = {'global': this._root};

    this.createNamespace(location, 'global');
  }

  byId(id: string) {
    return this._byId[id];
  }

  byNamespace(ns: string): EnvRec {
    const env = this._nsToEnvRec[ns];
    if (!env) {
      throw new Error('Namespace ' + ns + ' not found');
    }

    return env;
  }

  byProductionName(name: string, ns?: string) {
    ns = ns || this._location;
    return this.lookup(ns, env => env._byProductionName[name]);
  }

  byAoid(aoid: string, ns?: string) {
    ns = ns || this._location;
    return this.lookup(ns, env => env._byAoid[aoid]);
  }

  inScopeByType(ns: string, type: 'op'): AlgorithmBiblioEntry[];
  inScopeByType(ns: string, type: 'production'): ProductionBiblioEntry[];
  inScopeByType(ns: string, type: 'clause'): ClauseBiblioEntry[];
  inScopeByType(ns: string, type: 'term'): TermBiblioEntry[];
  inScopeByType(ns: string, type: 'table' | 'figure' | 'example' | 'note'): FigureBiblioEntry[];
  inScopeByType(ns: string, type: string): BiblioEntry[];
  inScopeByType(ns: string, type: string) {
    let seen = new Set<string>();
    let results: BiblioEntry[] = [];
    let current = this._nsToEnvRec[ns];
    while (current) {
      (current._byType[type] || []).forEach(entry => {
        if (!seen.has(entry.key!)) {
          seen.add(entry.key!);
          results.push(entry);
        }
      });
      current = current._parent;
    }

    return results;
  }

  private lookup<T>(ns: string, cb: (env: EnvRec) => T) {
    let env = this._nsToEnvRec[ns];
    if (!env) {
      throw new Error('Namespace ' + ns + ' not found');
    }

    while (env) {
      const result = cb(env);
      if (result) {
        return result;
      }
      env = env._parent;
    }

    return undefined;
  }

  add(entry: BiblioEntry, ns?: string | null) {
    ns = ns || this._location;
    const env = this._nsToEnvRec[ns];
    entry.namespace = ns;
    env!.push(entry);
    if (entry.id) {
      this._byId[entry.id] = entry;
    }
  }

  createNamespace(ns: string, parent: string) {
    const existingNs = this._nsToEnvRec[ns];
    if (existingNs) {
      if (existingNs._parent!._namespace === parent) {
        return;
      } else {
        throw new Error('Namespace ' + ns + ' already in use.');
      }
    }
    if (!parent) {
      throw new Error('Cannot create namespace without parent');
    }

    const parentEnv = this._nsToEnvRec[parent];

    if (!parentEnv) {
      throw new Error('Cannot find namespace with name ' + parent);
    }

    if (!ns) {
      throw new Error('Cannot create namespace without a name');
    }

    let env = new EnvRec(parentEnv, ns);
    this._nsToEnvRec[ns] = env;
  }

  addExternalBiblio(biblio: BiblioData) {
    Object.keys(biblio).forEach(site => {
      biblio[site].forEach(entry => {
        entry.location = site;
        this.add(entry, 'global');
      });
    });
  }

  toJSON() {
    let root: BiblioEntry[] = [];

    function addEnv(env: EnvRec) {
      root = root.concat(env);
      env._children.forEach(addEnv);
    }
    addEnv(this.byNamespace(this._location));
    return root;
  }

  dump() {
    dumpEnv(this._root);
  }
}

export interface BiblioData {
  [namespace: string]: BiblioEntry[];
}

export interface BiblioEntryBase {
  type: string;
  location?: string;
  namespace?: string;
  id?: string;
  aoid?: string;
  refId?: string;
  clauseId?: string;
  name?: string;
  key?: string;
  title?: string;
  number?: string | number;
  caption?: string;
  term?: string;
  referencingIds: string[];
}

export interface AlgorithmBiblioEntry extends BiblioEntryBase {
  type: 'op';
  aoid: string;
  refId?: string;
}

export interface ProductionBiblioEntry extends BiblioEntryBase {
  type: 'production';
  id?: string;
  name: string;
  /*@internal*/ _instance?: Production;
}

export interface ClauseBiblioEntry extends BiblioEntryBase {
  type: 'clause';
  id: string;
  aoid: string;
  title: string;
  titleHTML: string;
  number: string | number;
}

export interface TermBiblioEntry extends BiblioEntryBase {
  type: 'term';
  term: string;
  refId: string;
  id?: string;
}

export interface FigureBiblioEntry extends BiblioEntryBase {
  type: 'table' | 'figure' | 'example' | 'note';
  id: string;
  number: string | number;
  clauseId?: string;
  caption?: string;
}

export type BiblioEntry =
  AlgorithmBiblioEntry |
  ProductionBiblioEntry |
  ClauseBiblioEntry |
  TermBiblioEntry |
  FigureBiblioEntry;

function dumpEnv(env: EnvRec) {
  console.log('## ' + env._namespace);
  console.log(env.map(function(entry) {
    return JSON.stringify(entry);
  }).join(', '));

  env._children.forEach(function(child) {
    dumpEnv(child);
  });
}

function pushKey(arr: { [key: string]: BiblioEntry[] }, key: string, value: BiblioEntry) {
  if (arr[key] === undefined) {
    arr[key] = [];
  }

  arr[key].push(value);
}

function getKey(item: BiblioEntry) {
  switch (item.type) {
  case 'clause': return item.title;
  case 'production': return item.name;
  case 'op': return item.aoid;
  case 'term': return item.term;
  case 'table':
  case 'figure':
  case 'example':
  case 'note':
    return item.caption;
  default:
    throw new Error('Can\'t get key for ' + (<BiblioEntry>item).type);
  }
}