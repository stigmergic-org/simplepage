export const CHANGE_TYPE = Object.freeze({
  EDIT: 'edit',
  DELETE: 'delete',
  NEW: 'new',
  UPGRADE: 'upgrade'
})

export const RESERVED_PATH_PREFIXES = Object.freeze([
  '/feed',
  '/rss.xml'
])

export const isReservedPath = (path) => {
  const normalized = path.endsWith('/') ? path : `${path}/`
  return RESERVED_PATH_PREFIXES.some(prefix => normalized.startsWith(prefix))
}
