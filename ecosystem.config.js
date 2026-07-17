module.exports = {
  apps: [{
    name: "nbt-backend",
    script: "./server.js",
    instances: 2, // Changed from max to 2 to prevent local SQL Server memory exhaustion
    exec_mode: "cluster",
    watch: false,
    env: {
      NODE_ENV: "development",
    },
    env_production: {
      NODE_ENV: "production",
    }
  }]
};
