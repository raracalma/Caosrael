import {
  defineRailway,
  github,
  project,
  service,
  volume,
} from "railway/iac";

export default defineRailway((context) => {
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
      DATA_DIR: "/data",
      SESSION_SECRET: context.shared.SESSION_SECRET,
    },
  });

  return project("caoschat", {
    resources: [web, data],
  });
});
