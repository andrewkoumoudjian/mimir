const fakeUser = {
  id: "mimir-reviewer",
  email: "reviewer@mimir.local",
  created_at: "2026-01-01T00:00:00.000Z",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
};

const fakeSession = {
  access_token: "mimir-local-token",
  refresh_token: "mimir-local-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: fakeUser,
};

const emptyResult = { data: null, error: null };

function createQueryBuilder() {
  const builder: any = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => emptyResult,
    maybeSingle: async () => emptyResult,
    then: (resolve: (value: unknown) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };

  return builder;
}

export function createFakeSupabaseClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: fakeUser }, error: null }),
      getSession: async () => ({ data: { session: fakeSession }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      verifyOtp: async () => ({ data: { session: fakeSession }, error: null }),
      exchangeCodeForSession: async () => ({
        data: { session: fakeSession },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        }),
        listFactors: async () => ({
          data: { totp: [], phone: [] },
          error: null,
        }),
        enroll: async () => ({ data: {}, error: null }),
        challenge: async () => ({ data: {}, error: null }),
        verify: async () => ({ data: {}, error: null }),
        unenroll: async () => ({ data: {}, error: null }),
      },
    },
    from: () => createQueryBuilder(),
    channel: () => ({
      on: () => ({
        on: () => ({
          subscribe: () => undefined,
        }),
        subscribe: () => undefined,
      }),
      subscribe: () => undefined,
    }),
    removeChannel: () => undefined,
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "" }, error: null }),
        remove: async () => ({ data: [], error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };
}
