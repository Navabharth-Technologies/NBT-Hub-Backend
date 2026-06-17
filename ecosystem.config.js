module.exports = {
  apps: [{
    name: "nbt-backend",
    script: "./server.js",
    instances: "max", // Utilizes all available CPU cores
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
