module.exports = {
  apps: [
    {
      name: "chatsim-api",
      cwd: __dirname,
      script: "npm",
      args: "run start:api",
      env: {
        NODE_ENV: "production",
        CHATSIM_API_PORT: "8787",
        CHATSIM_STORE_FILE: "server/data/story-store.local.json"
      }
    }
  ]
};
