export default {
  // Seeded by auth-service/src/seeds/*_users.js (see .env's ADMIN_USER_*/
  // MODERATOR_USER_*) — real accounts that already exist, not created by
  // the tests.
  admin: {
    email: "admin@transport.local",
    password: process.env.USER_ADMIN_PASSWORD ?? null,
  },
  moderator: {
    email: "moderator@transport.local",
    password: process.env.USER_MODERATOR_PASSWORD ?? null,
  },
  test: {
    email: "test@transport.local",
    password: process.env.USER_TEST_PASSWORD ?? null,
  },

  // Throwaway user the signup/activate/login/... lifecycle test creates
  // and deletes itself — not seeded, not persisted between runs.
  fresh: {
    name: "Tester Fresh User",
    newName: "Tester Fresh User (updated)",
    email: process.env.USER_FRESH_EMAIL ?? "fresh@transport.local",
    password: process.env.USER_FRESH_PASSWORD ?? null,
    newPassword: process.env.USER_FRESH_NEW_PASSWORD ?? null,
  },

  // Same idea as "fresh", own email — sync.spec.mjs's own throwaway
  // identity, kept separate from auth.spec.mjs's so the two test files
  // never race over the same row.
  freshSync: {
    name: "Tester Sync User",
    newName: "Tester Sync User (updated)",
    email: process.env.USER_FRESH_SYNC_EMAIL ?? "fresh-sync@transport.local",
    password: process.env.USER_FRESH_SYNC_PASSWORD ?? null,
  },

  // Same idea again — avatar.spec.mjs's own throwaway identity.
  freshAvatar: {
    name: "Tester Avatar User",
    email: process.env.USER_FRESH_AVATAR_EMAIL ?? "fresh-avatar@transport.local",
    password: process.env.USER_FRESH_AVATAR_PASSWORD ?? null,
  },
};
