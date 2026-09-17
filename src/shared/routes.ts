/** Every route path in one place, so the OpenAPI spec and the router cannot
 *  disagree about what exists. Paths here are RELATIVE to API_PREFIX. */
export const ALL_ROUTES = {
  health: '/health',

  me: '/me',

  talk: {
    base: '/talk',
    one: '/talk/:id',
    correct: '/talk/:id/correct',
    export: '/talk/export',
  },
} as const;
