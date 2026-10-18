// PM2: one process only. Schedulers, rate limits and the page cache live in
// memory, so cluster mode would run jobs twice. Env comes from APP_DIR/.env.
module.exports = {
  apps: [
    {
      name: "findtern-next",
      cwd: __dirname + "/..",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "1G",
      env_production: { NODE_ENV: "production" },
    },
  ],
};
