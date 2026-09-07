import { safeStorage, app } from 'electron';
import path from 'path';
import fs from 'fs';

interface SecretStore {
  [providerId: string]: {
    [key: string]: string;
  };
}

const secrets: SecretStore = {};

function getSecretsFilePath(): string {
  return path.join(app.getPath('userData'), 'secrets.enc');
}

function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

async function persistSecrets(): Promise<void> {
  if (!isEncryptionAvailable()) {
    console.warn('safeStorage encryption unavailable - secrets will not be persisted');
    return;
  }

  try {
    const json = JSON.stringify(secrets);
    const encrypted = safeStorage.encryptString(json);
    const filePath = getSecretsFilePath();
    fs.writeFileSync(filePath, encrypted);
  } catch (err) {
    console.error('Failed to persist secrets:', err);
  }
}

export async function loadPersistedSecrets(): Promise<void> {
  if (!isEncryptionAvailable()) {
    console.warn('safeStorage encryption unavailable - cannot load persisted secrets');
    return;
  }

  const filePath = getSecretsFilePath();
  if (!fs.existsSync(filePath)) {
    return;
  }

  try {
    const encrypted = fs.readFileSync(filePath);
    const json = safeStorage.decryptString(encrypted);
    const loaded: SecretStore = JSON.parse(json);
    
    Object.keys(loaded).forEach((providerId) => {
      secrets[providerId] = loaded[providerId];
    });
  } catch (err) {
    console.error('Failed to load persisted secrets:', err);
  }
}

export async function setProviderSecret(providerId: string, key: string, value: string): Promise<void> {
  if (!secrets[providerId]) {
    secrets[providerId] = {};
  }
  secrets[providerId][key] = value;
  await persistSecrets();
}

export function getProviderSecret(providerId: string, key: string): string | undefined {
  const normalizedProviderId = providerId.toUpperCase().replace(/-/g, '_');
  return secrets[providerId]?.[key] || process.env[`${normalizedProviderId}_${key.toUpperCase()}`];
}

export function hasProviderSecret(providerId: string, key: string): boolean {
  return Boolean(getProviderSecret(providerId, key));
}

export async function clearProviderSecret(providerId: string, key: string): Promise<boolean> {
  if (secrets[providerId]?.[key]) {
    delete secrets[providerId][key];
    if (Object.keys(secrets[providerId]).length === 0) {
      delete secrets[providerId];
    }
    await persistSecrets();
    return true;
  }
  return false;
}

export function clearProviderSecrets(providerId: string): void {
  delete secrets[providerId];
}
