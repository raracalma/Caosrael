import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function parsePort(value: string | undefined) {
  const port = Number(value ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT inválida: "${value ?? ""}". Use um número entre 1 e 65535.`);
  }
  return port;
}

export function resolveSessionSecret({
  dataDirectory,
  isProduction,
  providedSecret,
}: {
  dataDirectory: string;
  isProduction: boolean;
  providedSecret?: string;
}) {
  if (providedSecret?.trim()) return providedSecret;
  if (!isProduction) return "caoschat-dev-only";

  const secretPath = path.join(dataDirectory, ".session-secret");
  try {
    const storedSecret = fs.readFileSync(secretPath, "utf8").trim();
    if (storedSecret.length >= 32) {
      console.warn(
        "SESSION_SECRET ausente; usando o segredo persistido no diretório de dados.",
      );
      return storedSecret;
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw new Error(
        `Não foi possível ler o segredo de sessão em ${secretPath}.`,
        { cause: error },
      );
    }
  }

  const generatedSecret = randomBytes(48).toString("base64url");
  try {
    fs.writeFileSync(secretPath, generatedSecret, {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch (error) {
    throw new Error(
      `SESSION_SECRET não foi definida e não foi possível gravar ${secretPath}.`,
      { cause: error },
    );
  }

  console.warn(
    "SESSION_SECRET ausente; um segredo aleatório foi criado no diretório de dados. Configure a variável no Railway para gerenciá-lo explicitamente.",
  );
  return generatedSecret;
}
