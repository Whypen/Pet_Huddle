import { useLanguage } from "@/contexts/LanguageContext";

export const privacyContent = `
# Privacy Policy

**Effective Date: January 1, 2026**

## 1. Information We Collect

We collect information you provide directly to us, such as when you create an account, update your profile, add pet information, or contact us for support.

### 1.1 Account Information
- Email address
- Display name
- Phone number (optional)
- Date of birth
- Profile photos

### 1.2 Pet Information
- Pet names, species, breeds
- Health records and vaccinations
- Photos and behavioral notes

### 1.3 Location Data
- GPS coordinates for map features
- Broadcast alert locations
- Veterinary clinic searches

## 2. How We Use Your Information

We use the information we collect to:
- Provide, maintain, and improve our services
- Connect you with other pet owners and caregivers
- Send you notifications about matches, alerts, and updates
- Ensure the safety and security of our platform

## 3. Information Sharing

We do not sell your personal information. We may share information:
- With your consent
- With service providers who assist our operations
- To comply with legal obligations
- To protect the safety of users and pets

## 4. Data Security

We implement industry-standard security measures to protect your data, including encryption, secure servers, and regular security audits.

## 5. Your Rights

You have the right to:
- Access your personal data
- Correct inaccurate data
- Delete your account and data
- Export your data
- Opt out of marketing communications

## 6. Contact Us

For privacy-related inquiries, please contact us at privacy@huddle.app

---

*Last updated: January 2026*
`;

export const termsContent = `
# Terms of Service

**Effective Date: January 1, 2026**

## 1. Acceptance of Terms

By accessing or using huddle ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.

## 2. Description of Service

huddle is a pet care and social platform that connects pet owners, caregivers, and animal lovers. Our services include:
- Social networking for pet owners
- Pet caregiver matching
- AI-powered pet health information
- Map-based pet alerts and resources

## 3. User Accounts

### 3.1 Registration
You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your login credentials.

### 3.2 Eligibility
You must be at least 18 years old to use huddle. By using the Service, you represent that you meet this requirement.

### 3.3 Account Termination
We reserve the right to suspend or terminate accounts that violate these terms or engage in harmful behavior.

## 4. User Conduct

You agree not to:
- Post false, misleading, or harmful content
- Harass, abuse, or threaten other users
- Use the Service for illegal purposes
- Attempt to gain unauthorized access to the Service
- Impersonate others or misrepresent your identity

## 5. Pet Safety

While we strive to connect responsible pet owners and caregivers, you acknowledge that:
- All pet care arrangements are made at your own risk
- You should verify credentials and references independently
- huddle is not responsible for the actions of other users

## 6. AI Assistant Disclaimer

Dr. huddle (our AI assistant) provides general pet information only. It is not a substitute for professional veterinary care. Always consult a licensed veterinarian for medical advice.

## 7. Premium Subscription

### 7.1 Billing
Premium subscriptions are billed monthly. You authorize us to charge your payment method on a recurring basis.

### 7.2 Cancellation
You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.

### 7.3 Refunds
Subscription fees are generally non-refundable, except as required by law.

## 8. Intellectual Property

All content, features, and functionality of the Service are owned by huddle and protected by intellectual property laws.

## 9. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, huddle SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

## 10. Governing Law

These Terms shall be governed by the laws of Hong Kong SAR, without regard to conflict of law principles.

## 11. Changes to Terms

We may update these Terms from time to time. We will notify you of significant changes through the Service or via email.

## 12. Contact Us

For questions about these Terms, please contact us at legal@huddle.app

---

*Last updated: January 2026*
`;

export const LegalContent = ({ type }: { type: "privacy" | "terms" }) => {
  const { t } = useLanguage();
  const content = type === "privacy" ? privacyContent : termsContent;

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert font-huddle">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("# ")) {
          return (
            <h1 key={i} className="text-xl font-bold">
              {t(line.replace("# ", ""))}
            </h1>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="text-lg font-semibold mt-4">
              {t(line.replace("## ", ""))}
            </h2>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <h3 key={i} className="text-base font-semibold mt-3">
              {t(line.replace("### ", ""))}
            </h3>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <li key={i} className="ml-4 list-disc">
              {t(line.replace("- ", ""))}
            </li>
          );
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={i} className="font-semibold">
              {t(line.replace(/\*\*/g, ""))}
            </p>
          );
        }
        if (line.startsWith("*") && line.endsWith("*")) {
          return (
            <p key={i} className="text-xs text-muted-foreground italic">
              {t(line.replace(/\*/g, ""))}
            </p>
          );
        }
        if (line === "---") {
          return <hr key={i} className="my-4" />;
        }
        if (!line.trim()) {
          return <div key={i} className="h-2" />;
        }
        return (
          <p key={i}>
            {t(line)}
          </p>
        );
      })}
    </div>
  );
};
