const fs = require("fs");
const path = require("path");

const interopPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@stripe",
  "stripe-react-native",
  "ios",
  "StripeSwiftInterop.h",
);

if (!fs.existsSync(interopPath)) {
  process.exit(0);
}

const before = "typedef NS_ENUM(NSUInteger, STPPaymentStatus);";
const after = "typedef NS_ENUM(NSInteger, STPPaymentStatus);";
const source = fs.readFileSync(interopPath, "utf8");

if (source.includes(after)) {
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error("StripeSwiftInterop.h no longer contains the expected STPPaymentStatus declaration.");
}

fs.writeFileSync(interopPath, source.replace(before, after));
