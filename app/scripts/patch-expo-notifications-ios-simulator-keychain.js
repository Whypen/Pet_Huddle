const fs = require("fs");
const path = require("path");

const sourcePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo-notifications",
  "ios",
  "EXNotifications",
  "ServerRegistration",
  "ServerRegistrationModule.swift",
);

if (!fs.existsSync(sourcePath)) {
  process.exit(0);
}

const before = `  private func getRegistrationInfo() throws -> String? {
    return try fetchStringWithQuery(registrationGetQuery())
  }`;
const after = `  private func getRegistrationInfo() throws -> String? {
    #if targetEnvironment(simulator)
    // Push registration is unavailable on Simulator. Avoid the Keychain query
    // that iOS Simulator rejects for an ad-hoc development client.
    return nil
    #else
    return try fetchStringWithQuery(registrationGetQuery())
    #endif
  }`;
const source = fs.readFileSync(sourcePath, "utf8");

if (source.includes(after)) {
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error("expo-notifications no longer contains the expected persisted-registration reader.");
}

fs.writeFileSync(sourcePath, source.replace(before, after));
