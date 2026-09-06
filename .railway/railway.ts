import {
  defineRailway,
  github,
  project,
  service,
  volume,
} from "railway/iac";

export default defineRailway(() => {
  const data = volume("caoschat-data", {
    region: "us-east4-eqdc4a",
    sizeMB: 512,
  });

  const web = service("caoschat", {
    source: github("raracalma/Caosrael", { branch: "main" }),
    start: "node dist-server/index.js",
    healthcheck: "/api/health",
    healthcheckTimeout: 30,
    replicas: { "us-east4-eqdc4a": 1 },
    volumeMounts: {
      "/data": data,
    },
    env: {
      NODE_ENV: "production",
      COOKIE_SECURE: "true",
      HOST: "0.0.0.0",
      DATA_DIR: "/data",
    },
  });

  return project("caoschat", {
    resources: [web, data],
  });
});
