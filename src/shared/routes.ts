/** Every route path in one place, so the OpenAPI spec and the router cannot
 *  disagree about what exists. Paths here are RELATIVE to API_PREFIX. */
export const ALL_ROUTES = {
  health: '/health',

  me: '/me',

  /// Settings a browser may know. Served BEFORE the auth boundary: the app
  /// needs them on the sign-in screen, before anyone has signed in.
  clientConfig: '/config',

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

  farm: {
    base: '/farm',
    /// Public: someone meets their tree before being asked for anything.
    quiz: '/farm/quiz',
    plant: '/farm/plant',
    discoveries: '/farm/discoveries',
    neighbours: '/farm/neighbours',
    invite: '/farm/invite',
    /// Public: a visitor sees the farm and the plot saved for them.
    preview: '/farm/invite/:code',
    accept: '/farm/invite/:code/accept',
  },

  care: {
    base: '/care',
    one: '/care/:id',
    pause: '/care/:id/pause',
    view: '/care/view/:ownerId',
  },

  goals: {
    base: '/goals',
    propose: '/goals/propose',
    one: '/goals/:id',
    confirm: '/goals/:id/confirm',
  },

  plan: {
    base: '/plan',
    done: '/plan/:id/done',
  },

  talk: {
    base: '/talk',
    // NOTE: /talk/export must be registered BEFORE /talk/:id, or Express matches
    // "export" as an id and the export route becomes unreachable.
    export: '/talk/export',
    one: '/talk/:id',
    correct: '/talk/:id/correct',
    record: '/talk/:id/record',
  },
} as const;
