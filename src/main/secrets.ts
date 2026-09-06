import { safeStorage } from 'electron';

interface SecretStore {
  [providerId: string]: {
    [key: string]: string;
  };
}

const secrets: SecretStore = {};

export function setProviderSecret(providerId: string, key: string, value: string): void {
  if (!secrets[providerId]) {
    secrets[providerId] = {};
  }
  secrets[providerId][key] = value;
}

export function getProviderSecret(providerId: string, key: string): string | undefined {
  return secrets[providerId]?.[key] || process.env[`${providerId.toUpperCase()}_${key.toUpperCase()}`];
}

export function hasProviderSecret(providerId: string, key: string): boolean {
  return Boolean(getProviderSecret(providerId, key));
}

export function clearProviderSecrets(providerId: string): void {
  delete secrets[providerId];
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
