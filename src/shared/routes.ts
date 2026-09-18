/** Every route path in one place, so the OpenAPI spec and the router cannot
 *  disagree about what exists. Paths here are RELATIVE to API_PREFIX. */
export const ALL_ROUTES = {
  health: '/health',

  me: '/me',

  sessions: {
    base: '/sessions',
    one: '/sessions/:id',
  },

  files: {
    base: '/files',
    one: '/files/:id',
    readPending: '/files/read-pending',
    content: '/files/:id/content',
  },

  agentKeys: {
    base: '/agent-keys',
    one: '/agent-keys/:id',
  },

  talk: {
    base: '/talk',
    // NOTE: /talk/export must be registered BEFORE /talk/:id, or Express matches
    // "export" as an id and the export route becomes unreachable.
    export: '/talk/export',
    one: '/talk/:id',
    correct: '/talk/:id/correct',
  },
} as const;
