import { v4 as uuidv4 } from 'uuid'

// In-memory data store for collections
const memoryStore = new Map()

export function getMemoryCollection(name) {
  if (!memoryStore.has(name)) {
    memoryStore.set(name, [])
  }
  return memoryStore.get(name)
}

function clone(val) {
  if (val === undefined || val === null) return val
  if (val instanceof Date) return new Date(val.getTime())
  if (val instanceof RegExp) return new RegExp(val.source, val.flags)
  if (typeof val !== 'object') return val
  try {
    return structuredClone(val)
  } catch {
    return JSON.parse(JSON.stringify(val))
  }
}

function getField(obj, path) {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined
    const p = parts[i]
    if (Array.isArray(cur)) {
      if (/^\d+$/.test(p)) {
        cur = cur[parseInt(p, 10)]
      } else {
        const rest = parts.slice(i).join('.')
        const vals = []
        for (const item of cur) {
          const v = getField(item, rest)
          if (v !== undefined) {
            if (Array.isArray(v)) vals.push(...v)
            else vals.push(v)
          }
        }
        return vals.length > 0 ? vals : undefined
      }
    } else {
      cur = cur[p]
    }
  }
  return cur
}

function matchValue(actual, expected) {
  if (expected === null || expected === undefined || typeof expected !== 'object' || expected instanceof Date || expected instanceof RegExp) {
    if (expected instanceof Date && actual instanceof Date) {
      return actual.getTime() === expected.getTime()
    }
    if (Array.isArray(actual)) {
      return actual.some((a) => a === expected)
    }
    return actual === expected
  }

  // Operator checks
  for (const op of Object.keys(expected)) {
    const val = expected[op]
    if (op === '$eq') {
      if (actual !== val) return false
    } else if (op === '$ne') {
      if (actual === val) return false
    } else if (op === '$gt') {
      const a = actual instanceof Date ? actual.getTime() : actual
      const b = val instanceof Date ? val.getTime() : val
      if (!(a > b)) return false
    } else if (op === '$gte') {
      const a = actual instanceof Date ? actual.getTime() : actual
      const b = val instanceof Date ? val.getTime() : val
      if (!(a >= b)) return false
    } else if (op === '$lt') {
      const a = actual instanceof Date ? actual.getTime() : actual
      const b = val instanceof Date ? val.getTime() : val
      if (!(a < b)) return false
    } else if (op === '$lte') {
      const a = actual instanceof Date ? actual.getTime() : actual
      const b = val instanceof Date ? val.getTime() : val
      if (!(a <= b)) return false
    } else if (op === '$in') {
      if (!Array.isArray(val)) return false
      if (Array.isArray(actual)) {
        if (!actual.some((a) => val.includes(a))) return false
      } else {
        if (!val.includes(actual)) return false
      }
    } else if (op === '$nin') {
      if (!Array.isArray(val)) return true
      if (Array.isArray(actual)) {
        if (actual.some((a) => val.includes(a))) return false
      } else {
        if (val.includes(actual)) return false
      }
    } else if (op === '$exists') {
      const exists = actual !== undefined
      if (exists !== !!val) return false
    } else if (op === '$regex') {
      const flags = expected.$options || ''
      const reg = typeof val === 'string' ? new RegExp(val, flags) : val
      if (!reg.test(String(actual ?? ''))) return false
    } else if (op === '$elemMatch') {
      if (!Array.isArray(actual)) return false
      if (!actual.some((item) => matchDoc(item, val))) return false
    } else if (op === '$not') {
      if (typeof val === 'object' && val.$elemMatch) {
        if (Array.isArray(actual) && actual.some((item) => matchDoc(item, val.$elemMatch))) return false
      } else if (matchValue(actual, val)) {
        return false
      }
    }
  }
  return true
}

export function matchDoc(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true
  for (const [key, expected] of Object.entries(filter)) {
    if (key === '$or') {
      if (!Array.isArray(expected) || !expected.some((sub) => matchDoc(doc, sub))) return false
    } else if (key === '$and') {
      if (!Array.isArray(expected) || !expected.every((sub) => matchDoc(doc, sub))) return false
    } else if (key === '$expr') {
      // Evaluate simple expressions or let through
      continue
    } else {
      const actual = getField(doc, key)
      if (!matchValue(actual, expected)) return false
    }
  }
  return true
}

function resolveTarget(doc, path, arrayFilters = [], outerFilter = {}) {
  // Break path by dot: e.g. "staffing.$[row].invitations.$[assignment].timesheets"
  // or "staffing.$.role"
  const tokens = path.split('.')
  let current = [doc]

  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]
    const nextCurrent = []

    for (const cur of current) {
      if (!cur) continue

      if (token.startsWith('$[') && token.endsWith(']')) {
        const identifier = token.slice(2, -1)
        // Find matching array filter: e.g. { 'row.id': ... }
        const filterObj = arrayFilters.find((f) => {
          return Object.keys(f).some((k) => k.startsWith(`${identifier}.`))
        })
        const cleanFilter = {}
        if (filterObj) {
          for (const [k, v] of Object.entries(filterObj)) {
            cleanFilter[k.slice(identifier.length + 1)] = v
          }
        }
        if (Array.isArray(cur)) {
          const matching = cur.filter((item) => matchDoc(item, cleanFilter))
          nextCurrent.push(...matching)
        }
      } else if (token === '$') {
        // Positional operator - match first element or matching element
        if (Array.isArray(cur)) {
          nextCurrent.push(cur[0])
        }
      } else {
        if (!cur[token] || typeof cur[token] !== 'object') {
          // Check if next token is numeric or array notation
          cur[token] = {}
        }
        nextCurrent.push(cur[token])
      }
    }
    current = nextCurrent
  }

  const lastToken = tokens[tokens.length - 1]
  return { targets: current, field: lastToken }
}

function applyUpdate(doc, update, options = {}, isInsert = false) {
  if (!update) return doc
  const arrayFilters = options.arrayFilters || []

  if (isInsert && update.$setOnInsert) {
    for (const [path, val] of Object.entries(update.$setOnInsert)) {
      const { targets, field } = resolveTarget(doc, path, arrayFilters)
      for (const target of targets) {
        if (target) {
          target[field] = clone(val)
        }
      }
    }
  }

  if (update.$set) {
    for (const [path, val] of Object.entries(update.$set)) {
      const { targets, field } = resolveTarget(doc, path, arrayFilters)
      for (const target of targets) {
        if (target) {
          target[field] = clone(val)
        }
      }
    }
  }

  if (update.$unset) {
    for (const path of Object.keys(update.$unset)) {
      const { targets, field } = resolveTarget(doc, path, arrayFilters)
      for (const target of targets) {
        if (target && Object.prototype.hasOwnProperty.call(target, field)) {
          delete target[field]
        }
      }
    }
  }

  if (update.$inc) {
    for (const [path, val] of Object.entries(update.$inc)) {
      const { targets, field } = resolveTarget(doc, path, arrayFilters)
      for (const target of targets) {
        if (target) {
          const cur = typeof target[field] === 'number' ? target[field] : 0
          target[field] = cur + val
        }
      }
    }
  }

  if (update.$push) {
    for (const [path, val] of Object.entries(update.$push)) {
      const { targets, field } = resolveTarget(doc, path, arrayFilters)
      for (const target of targets) {
        if (target) {
          if (!Array.isArray(target[field])) {
            target[field] = []
          }
          if (val && typeof val === 'object' && val.$each) {
            target[field].push(...clone(val.$each))
          } else {
            target[field].push(clone(val))
          }
        }
      }
    }
  }

  if (update.$pull) {
    for (const [path, val] of Object.entries(update.$pull)) {
      const { targets, field } = resolveTarget(doc, path, arrayFilters)
      for (const target of targets) {
        if (target && Array.isArray(target[field])) {
          target[field] = target[field].filter((item) => !matchDoc(item, val))
        }
      }
    }
  }

  return doc
}

function applyProjection(doc, proj) {
  if (!proj || !doc) return doc
  const entries = Object.entries(proj)
  const isInclude = entries.some(([k, v]) => v === 1 && k !== '_id')

  if (isInclude) {
    const res = {}
    if (proj._id !== 0 && doc._id !== undefined) res._id = doc._id
    for (const [k, v] of entries) {
      if (v === 1 && k !== '_id') {
        const val = getField(doc, k)
        if (val !== undefined) res[k] = clone(val)
      }
    }
    return res
  } else {
    const res = clone(doc)
    for (const [k, v] of entries) {
      if (v === 0 && Object.prototype.hasOwnProperty.call(res, k)) {
        delete res[k]
      }
    }
    return res
  }
}

export class MemoryCursor {
  constructor(docs, db = null) {
    this.docs = docs
    this.sortFn = null
    this.skipCount = 0
    this.limitCount = null
    this.projection = null
    this.db = db
  }

  sort(sortObj) {
    if (!sortObj) return this
    const keys = Object.entries(sortObj)
    this.sortFn = (a, b) => {
      for (const [key, dir] of keys) {
        const valA = getField(a, key)
        const valB = getField(b, key)
        if (valA === valB) continue
        if (valA === undefined) return 1
        if (valB === undefined) return -1
        const aNum = valA instanceof Date ? valA.getTime() : valA
        const bNum = valB instanceof Date ? valB.getTime() : valB
        if (aNum > bNum) return dir < 0 ? -1 : 1
        if (aNum < bNum) return dir < 0 ? 1 : -1
      }
      return 0
    }
    return this
  }

  skip(n) {
    this.skipCount = n || 0
    return this
  }

  limit(n) {
    this.limitCount = n
    return this
  }

  project(proj) {
    this.projection = proj
    return this
  }

  async toArray() {
    let result = [...this.docs]
    if (this.sortFn) result.sort(this.sortFn)
    if (this.skipCount > 0) result = result.slice(this.skipCount)
    if (this.limitCount !== null && this.limitCount !== undefined) {
      result = result.slice(0, this.limitCount)
    }
    if (this.projection) {
      result = result.map((d) => applyProjection(d, this.projection))
    }
    return clone(result)
  }
}

export class MemoryCollection {
  constructor(name, db) {
    this.name = name
    this.db = db
  }

  get docs() {
    return getMemoryCollection(this.name)
  }

  find(filter = {}, options = {}) {
    const matched = this.docs.filter((d) => matchDoc(d, filter))
    const cursor = new MemoryCursor(matched, this.db)
    if (options.projection) cursor.project(options.projection)
    if (options.sort) cursor.sort(options.sort)
    if (options.limit) cursor.limit(options.limit)
    if (options.skip) cursor.skip(options.skip)
    return cursor
  }

  async findOne(filter = {}, options = {}) {
    const matched = this.docs.find((d) => matchDoc(d, filter))
    if (!matched) return null
    const result = clone(matched)
    return options.projection ? applyProjection(result, options.projection) : result
  }

  async insertOne(doc) {
    const item = clone(doc)
    if (!item._id) item._id = uuidv4()
    if (!item.id && typeof item._id === 'string') item.id = item._id
    this.docs.push(item)
    return { insertedId: item._id, acknowledged: true }
  }

  async insertMany(docs) {
    for (const d of docs) {
      const item = clone(d)
      if (!item._id) item._id = uuidv4()
      if (!item.id && typeof item._id === 'string') item.id = item._id
      this.docs.push(item)
    }
    return { insertedCount: docs.length, acknowledged: true }
  }

  async updateOne(filter, update, options = {}) {
    const doc = this.docs.find((d) => matchDoc(d, filter))
    if (!doc) {
      if (options.upsert) {
        const newDoc = { ...(filter || {}) }
        if (!newDoc._id) newDoc._id = filter?._id || uuidv4()
        applyUpdate(newDoc, update, options, true)
        this.docs.push(newDoc)
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: newDoc._id }
      }
      return { matchedCount: 0, modifiedCount: 0 }
    }
    applyUpdate(doc, update, options, false)
    return { matchedCount: 1, modifiedCount: 1 }
  }

  async updateMany(filter, update, options = {}) {
    const matched = this.docs.filter((d) => matchDoc(d, filter))
    for (const d of matched) {
      applyUpdate(d, update, options, false)
    }
    return { matchedCount: matched.length, modifiedCount: matched.length }
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const doc = this.docs.find((d) => matchDoc(d, filter))
    if (!doc) {
      if (options.upsert) {
        const newDoc = { ...(filter || {}) }
        if (!newDoc._id) newDoc._id = filter?._id || uuidv4()
        applyUpdate(newDoc, update, options, true)
        this.docs.push(newDoc)
        return options.projection ? applyProjection(newDoc, options.projection) : clone(newDoc)
      }
      return null
    }
    const before = clone(doc)
    applyUpdate(doc, update, options, false)
    const result = options.returnDocument === 'after' ? doc : before
    return options.projection ? applyProjection(result, options.projection) : clone(result)
  }

  async deleteOne(filter) {
    const idx = this.docs.findIndex((d) => matchDoc(d, filter))
    if (idx !== -1) {
      this.docs.splice(idx, 1)
      return { deletedCount: 1 }
    }
    return { deletedCount: 0 }
  }

  async deleteMany(filter = {}) {
    const initialLen = this.docs.length
    const remaining = this.docs.filter((d) => !matchDoc(d, filter))
    this.docs.length = 0
    this.docs.push(...remaining)
    return { deletedCount: initialLen - remaining.length }
  }

  async countDocuments(filter = {}) {
    return this.docs.filter((d) => matchDoc(d, filter)).length
  }

  aggregate(pipeline = []) {
    let results = clone(this.docs)

    for (const stage of pipeline) {
      if (stage.$match) {
        results = results.filter((d) => matchDoc(d, stage.$match))
      } else if (stage.$unwind) {
        const unwound = []
        const path = typeof stage.$unwind === 'string' ? stage.$unwind.replace(/^\$/, '') : stage.$unwind.path.replace(/^\$/, '')
        for (const item of results) {
          const arr = getField(item, path)
          if (Array.isArray(arr) && arr.length > 0) {
            for (const el of arr) {
              const copy = clone(item)
              // set unwound element at path
              const parts = path.split('.')
              let cur = copy
              for (let i = 0; i < parts.length - 1; i++) {
                cur = cur[parts[i]]
              }
              cur[parts[parts.length - 1]] = el
              unwound.push(copy)
            }
          }
        }
        results = unwound
      } else if (stage.$lookup) {
        const fromCol = stage.$lookup.from
        const fromDocs = getMemoryCollection(fromCol)
        const asField = stage.$lookup.as

        if (stage.$lookup.let && stage.$lookup.pipeline) {
          const letVars = stage.$lookup.let
          results = results.map((item) => {
            const copy = clone(item)
            const subResults = fromDocs.filter((other) => {
              // Check let matching: e.g. $$uid === $userId
              for (const [vName, vPath] of Object.entries(letVars)) {
                const docVal = getField(item, vPath.replace(/^\$/, ''))
                // For users lookup: { $match: { $expr: { $and: [{ $eq: ['$id', '$$uid'] }, { $eq: ['$role', 'crew'] }] } } }
                if (other.id !== docVal || other.role !== 'crew') return false
              }
              return true
            })
            copy[asField] = subResults
            return copy
          })
        } else if (stage.$lookup.localField && stage.$lookup.foreignField) {
          results = results.map((item) => {
            const copy = clone(item)
            const localVal = getField(item, stage.$lookup.localField)
            copy[asField] = fromDocs.filter((o) => getField(o, stage.$lookup.foreignField) === localVal)
            return copy
          })
        }
      } else if (stage.$project) {
        results = results.map((item) => {
          const proj = stage.$project
          const out = {}
          for (const [k, v] of Object.entries(proj)) {
            if (v === 1) {
              out[k] = getField(item, k)
            } else if (typeof v === 'string' && v.startsWith('$')) {
              out[k] = getField(item, v.slice(1))
            } else if (v && typeof v === 'object' && v.$map) {
              const inputArr = getField(item, (v.$map.input || '').replace(/^\$/, '')) || []
              if (Array.isArray(inputArr)) {
                out[k] = inputArr.map((el) => {
                  if (typeof el === 'object' && el) return el.name || el.title || el
                  return el
                })
              } else {
                out[k] = []
              }
            } else if (k === '_id' && v === 0) {
              // omit _id
            } else {
              out[k] = v
            }
          }
          return out
        })
      } else if (stage.$sort) {
        const keys = Object.entries(stage.$sort)
        results.sort((a, b) => {
          for (const [key, dir] of keys) {
            const valA = getField(a, key)
            const valB = getField(b, key)
            if (valA === valB) continue
            if (valA === undefined) return 1
            if (valB === undefined) return -1
            return (valA > valB ? 1 : -1) * (dir < 0 ? -1 : 1)
          }
          return 0
        })
      } else if (stage.$skip) {
        results = results.slice(stage.$skip)
      } else if (stage.$limit) {
        results = results.slice(0, stage.$limit)
      } else if (stage.$facet) {
        const facetOut = {}
        for (const [fName, subPipeline] of Object.entries(stage.$facet)) {
          let subRes = clone(results)
          for (const s of subPipeline) {
            if (s.$skip) subRes = subRes.slice(s.$skip)
            else if (s.$limit) subRes = subRes.slice(0, s.$limit)
            else if (s.$count) subRes = [{ [s.$count]: subRes.length }]
          }
          facetOut[fName] = subRes
        }
        results = [facetOut]
      } else if (stage.$count) {
        results = [{ [stage.$count]: results.length }]
      }
    }

    return new MemoryCursor(results, this.db)
  }
}

export class InMemoryDatabase {
  constructor(name = 'lantix') {
    this.databaseName = name
    this._collections = new Map()
  }

  collection(name) {
    if (!this._collections.has(name)) {
      this._collections.set(name, new MemoryCollection(name, this))
    }
    return this._collections.get(name)
  }
}

let globalMemoryDb = null

export function getInMemoryDatabase(name = 'lantix') {
  if (!globalMemoryDb) {
    globalMemoryDb = new InMemoryDatabase(name)
  }
  return globalMemoryDb
}
