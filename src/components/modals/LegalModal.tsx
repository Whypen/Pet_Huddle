import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "privacy" | "terms";
}

const privacyContent = `
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

const termsContent = `
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

Dr. Huddle (our AI assistant) provides general pet information only. It is not a substitute for professional veterinary care. Always consult a licensed veterinarian for medical advice.

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

TO THE MAXIMUM EXTENT PERMITTED BY LAW, HUDDLE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

## 10. Governing Law

These Terms shall be governed by the laws of Hong Kong SAR, without regard to conflict of law principles.

## 11. Changes to Terms

We may update these Terms from time to time. We will notify you of significant changes through the Service or via email.

## 12. Contact Us

For questions about these Terms, please contact us at legal@huddle.app

---

*Last updated: January 2026*
`;

export const LegalModal = ({ isOpen, onClose, type }: LegalModalProps) => {
  const { t } = useLanguage();
  const content = type === "privacy" ? privacyContent : termsContent;
  const title = type === "privacy" ? t("settings.privacy_policy") : t("settings.terms");

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-4 top-16 bottom-16 bg-card rounded-2xl z-50 overflow-hidden shadow-elevated flex flex-col max-w-lg mx-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                {content.split("\n").map((line, i) => {
                  if (line.startsWith("# ")) {
                    return <h1 key={i} className="text-xl font-bold mb-4">{line.slice(2)}</h1>;
                  } else if (line.startsWith("## ")) {
                    return <h2 key={i} className="text-lg font-semibold mt-6 mb-3">{line.slice(3)}</h2>;
                  } else if (line.startsWith("### ")) {
                    return <h3 key={i} className="text-base font-medium mt-4 mb-2">{line.slice(4)}</h3>;
                  } else if (line.startsWith("- ")) {
                    return <li key={i} className="ml-4 text-muted-foreground">{line.slice(2)}</li>;
                  } else if (line.startsWith("**") && line.endsWith("**")) {
                    return <p key={i} className="font-semibold text-sm text-muted-foreground">{line.slice(2, -2)}</p>;
                  } else if (line.startsWith("*") && line.endsWith("*")) {
                    return <p key={i} className="text-xs text-muted-foreground italic">{line.slice(1, -1)}</p>;
                  } else if (line === "---") {
                    return <hr key={i} className="my-6 border-border" />;
                  } else if (line.trim()) {
                    return <p key={i} className="text-sm text-muted-foreground mb-2">{line}</p>;
                  }
                  return null;
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border text-center">
              <span className="text-xs text-muted-foreground">{t("v1.0.0 (2026)")}</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
