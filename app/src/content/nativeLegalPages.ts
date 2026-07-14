export type NativeLegalSection = {
  title: string;
  body: string[];
  bullets?: string[];
};

export type NativeLegalPageContent = {
  path: string;
  title: string;
  effectiveDate: string;
  intro: string[];
  sections: NativeLegalSection[];
};

const privacy: NativeLegalPageContent = {
  path: "/privacy",
  title: "Privacy Policy",
  effectiveDate: "20 May 2026",
  intro: [
    "This Policy explains what personal information Huddle collects, why it is used, when it is shared, how long it is kept, and what rights and choices you have.",
  ],
  sections: [
    {
      title: "1. Scope",
      body: [
        "This Policy applies to Huddle's app, websites, support channels, and all features including messaging, social feed, map, care marketplace, subscriptions, and identity verification.",
      ],
    },
    {
      title: "2. What Huddle collects",
      body: ["Huddle may collect the following categories of information:"],
      bullets: [
        "Account information: email address, password credentials, date of birth, and phone number.",
        "Sign-in information: where you use Apple Sign-In, the Apple subject identifier and any email Apple provides. Huddle receives only what Apple shares, which may be a private relay address.",
        "Profile and pet information: display name, photos, social handle, bio, location name, pet name, species, date of birth, weight, photos, and publicly shared pet details.",
        "Identity verification data: legal name, government-issued ID or passport document data, payment method confirmation through our payment partner, and liveness or human-presence data captured via the device camera to confirm a real person is present and to prevent fraud. Document data is processed for verification only. Huddle does not store raw facial templates or biometric identifiers after verification completes.",
        "Security credentials: two-factor authentication (TOTP) enrolment status. Biometric credentials (Face ID, Touch ID) are stored on your device only and are never transmitted to Huddle.",
        "Content and communications: messages, social posts, comments, media uploads, care booking details, handoff records, Start PIN events, mid-care photos, check-in submissions, emergency contact, care instructions, and medication, allergy, and behaviour notes submitted in bookings.",
        "Payment and subscription data: subscription tier and billing status, billing events, refund and dispute records, and limited payment metadata. Raw card numbers are not stored by Huddle.",
        "Device and app data: device type, operating system, app version, push notification token, IP address, and crash data.",
        "Location data: coordinates and timestamps where you enable location or pin your location on the map, including pin expiry information.",
        "Trust and safety data: phone-verification status, identity-verification status, fraud signals, moderation records, and complaint records.",
        "Support information: messages and correspondence sent through support channels.",
        "Third-party data from app stores, payment partners, analytics providers, and other users where relevant.",
      ],
    },
    {
      title: "3. How Huddle uses information",
      body: ["Huddle uses information to:"],
      bullets: [
        "Authenticate accounts and support sign-in methods including email/password, Apple Sign-In, biometric login, and two-factor authentication.",
        "Provide messaging, discovery, social feed, map, care marketplace, subscription, and identity-verification features.",
        "Process care bookings, payments via Stripe, and provider payouts via Stripe Connect.",
        "Deliver push notifications via Expo.",
        "Personalise content, recommendations, and in-app experience.",
        "Detect and prevent fraud, enforce policies, and protect platform safety.",
        "Resolve disputes, process refunds, and maintain booking and payment records.",
        "Comply with law, respond to legal process, and protect the rights and safety of users, pets, and the public.",
        "Improve, analyse, and develop the service.",
      ],
    },
    {
      title: "4. When Huddle shares information",
      body: ["Huddle may share information with:"],
      bullets: [
        "Supabase — database, authentication, real-time messaging, and storage infrastructure.",
        "Stripe — payment processing and provider payout services via Stripe Connect.",
        "Mapbox — map tile rendering and address lookup.",
        "Expo — push notification delivery.",
        "Apple and Google — app distribution, in-app purchase processing, and Apple Sign-In.",
        "Other users — profile information, map pins, social posts, and booking details shared with your counterpart as required to provide the feature you are using.",
        "Analytics, measurement, or advertising partners — subject to applicable law and any required consent or opt-out.",
        "Legal authorities — where required by law, court order, or to protect safety.",
        "Parties in a merger, acquisition, or sale of assets.",
      ],
    },
    {
      title: "5. Location and map data",
      body: [
        "If you pin your location on the map, your approximate location is visible to other users for the duration of your pin. You can remove your pin at any time through the map. Location data may also be used for nearby discovery, care matching, alert features, fraud prevention, and analytics. You can manage location access in your device settings.",
      ],
    },
    {
      title: "6. Retention and security",
      body: [
        "Huddle retains information for as long as needed for service operation, legal compliance, fraud prevention, dispute resolution, and safety. Huddle uses technical and organisational controls to protect information. No system is completely secure. Where required by law, Huddle will notify affected users or authorities of data breaches.",
      ],
    },
    {
      title: "7. Age rules",
      body: [
        "Huddle is for users aged 13 and above. Discover, stranger chat, and certain social features are limited to users aged 16 and above. Identity verification and care marketplace access require users to be at least 18. Huddle uses age data, feature gating, and enforcement to apply these limits.",
      ],
    },
    {
      title: "8. International transfers",
      body: [
        "Information may be processed outside your country. Where required by law, Huddle applies appropriate transfer safeguards.",
      ],
    },
    {
      title: "9. Your rights and choices",
      body: [
        "Depending on applicable law, you may have rights to access, correct, delete, restrict, object to, or receive a copy of your personal information, to withdraw consent where processing is consent-based, and to opt out of certain marketing or advertising uses. To exercise these rights, see Privacy Choices.",
      ],
    },
    {
      title: "10. Deleting your account",
      body: [
        "You can delete your Huddle account at any time from Account → Delete Account in the app. When you delete your account, your profile, photos, posts, pets, chats, and uploaded content are permanently removed, and your email is removed from Huddle's mailing lists. Huddle may retain a minimal record — such as hashed identifiers, moderation history for banned accounts, and transaction records — where required by law, to prevent abuse, or to resolve disputes.",
        "If you would like a copy of your data before deleting, email support@huddle.pet and Huddle will respond within 30 days where required by applicable law.",
      ],
    },
  ],
};

const terms: NativeLegalPageContent = {
  path: "/terms",
  title: "Terms of Service",
  effectiveDate: "20 May 2026",
  intro: [
    "These Terms govern your access to and use of Huddle's app, websites, messaging, social feed, map, care marketplace, subscriptions, identity verification, and all related features and services. By using Huddle, you agree to these Terms.",
  ],
  sections: [
    {
      title: "1. Who can use Huddle",
      body: [
        "Huddle is for users aged 13 and above. Discover and stranger chat are limited to users aged 16 and above. The care marketplace and identity verification require users to be at least 18. You must provide accurate information, keep your credentials secure, and use only your own account. Huddle may require phone verification, identity verification, ID/passport checks, liveness checks, payment method confirmation, or other trust steps to access or continue using certain features.",
      ],
    },
    {
      title: "2. What Huddle is — and is not",
      body: [
        "Huddle is a communication, community, and care marketplace platform. Huddle is not a care provider, employer, veterinarian, or emergency service. Unless Huddle expressly states otherwise, Huddle does not provide, supervise, guarantee, or insure any care service listed on the platform.",
        "Identity verification badges, trust indicators, and credential displays reflect completion of Huddle's applicable verification steps at the time they are issued. They are not a guarantee of any user's current qualifications, conduct, insurance, or suitability.",
      ],
    },
    {
      title: "3. Your content",
      body: [
        "You keep ownership of content you submit to Huddle. By submitting content, you grant Huddle a worldwide, irrevocable, royalty-free, sublicensable licence to host, store, copy, adapt, publish, display, distribute, and promote that content to operate, protect, improve, and market Huddle, subject to applicable law and the Privacy Policy. Private messages and booking communications are not used for public advertising or social media promotion without your separate consent.",
      ],
    },
    {
      title: "4. Subscriptions and virtual items",
      body: [
        "Some features require a paid subscription. Huddle offers Huddle+ and Huddle Gold subscription tiers. Subscriptions renew automatically until cancelled. You must cancel through the channel where you subscribed — Apple App Store or Google Play. Deleting the app or your Huddle account does not cancel your subscription and does not entitle you to a refund of any remaining subscription period.",
        "The Family Sharing feature on paid tiers extends plan benefits to one linked account. Family Sharing does not include add-on purchases (Super Broadcast, Top Profile Booster, Share Perks, or other add-ons).",
        "Stars, broadcast credits, profile boosts, and similar virtual items are licensed features — not sold. They have no cash value, are non-transferable, and may be modified or withdrawn where allowed by law.",
      ],
    },
    {
      title: "5. Payments and fees",
      body: [
        "Huddle processes payments through Stripe. For care bookings, Huddle charges a 10% platform fee on the agreed care scope price. This fee is shown as a separate line item before you confirm payment.",
        "Huddle or Stripe may hold, delay, or reverse payments for fraud review, disputes, chargebacks, policy enforcement, or legal compliance. Fees are generally non-refundable once a paid period or feature has started, except where required by law or the applicable app store's refund rules.",
      ],
    },
    {
      title: "6. Acceptable use",
      body: [
        "You must not: impersonate anyone; misrepresent your age, identity, or qualifications; harass, threaten, or exploit any person or animal; post unlawful or harmful content; endanger people or pets; submit fake reviews, fake bookings, or false map alerts; misuse safety or moderation systems; solicit or accept off-platform payments to bypass Huddle's fees, booking system, or dispute process; create duplicate or evasion accounts after suspension or banning; or interfere with the security or operation of the service.",
      ],
    },
    {
      title: "7. Enforcement",
      body: [
        "Huddle may investigate, restrict, suspend, or terminate accounts or access — with or without prior notice — where Huddle reasonably believes a user has breached these Terms, created safety or legal risk, or harmed the platform or its users. Enforcement may include content removal, feature suspension, payment holds, trust badge revocation, and permanent bans. Huddle may block related devices, phone numbers, or payment methods to prevent re-entry where permitted by law.",
      ],
    },
    {
      title: "8. Disclaimers",
      body: [
        "To the maximum extent permitted by law, Huddle is provided \"as is\" and \"as available\" without any warranty of uninterrupted availability, error-free operation, accuracy of user-submitted content, or any particular outcome.",
      ],
    },
    {
      title: "9. Limitation of liability",
      body: [
        "To the maximum extent permitted by law, Huddle's total liability for any claim arising from these Terms or the service is limited to the greater of: (a) the amount you paid Huddle in the 12 months before the event giving rise to the claim, or (b) USD $100. Huddle is not liable for indirect, incidental, consequential, or punitive damages, or for loss of data, revenue, goodwill, or opportunity. Nothing in these Terms limits liability that cannot be excluded or limited by applicable law.",
      ],
    },
    {
      title: "10. Governing law and disputes",
      body: [
        "These Terms apply globally and are governed by the law that applies to the huddle entity contracting with you, without regard to conflict-of-law rules, except where mandatory law in your country of residence requires otherwise. Before starting a legal claim, contact support@huddle.pet and give huddle a reasonable opportunity to resolve the matter informally.",
      ],
    },
    {
      title: "11. Changes",
      body: [
        "Huddle may update these Terms at any time. Continued use of Huddle after updated Terms take effect constitutes acceptance, to the extent permitted by law.",
      ],
    },
  ],
};

const communityGuidelines: NativeLegalPageContent = {
  path: "/community-guidelines",
  title: "Community Guidelines",
  effectiveDate: "20 May 2026",
  intro: [
    "These rules apply across every part of Huddle — profiles, pets, photos, messages, social posts, comments, map features, care bookings, reviews, and support interactions.",
  ],
  sections: [
    {
      title: "1. Be real",
      body: [
        "Do not impersonate anyone. Do not misrepresent your age, identity, qualifications, care experience, or trust status. Do not create duplicate or evasion accounts after being suspended or banned.",
      ],
    },
    {
      title: "2. Protect people and pets",
      body: [
        "Do not threaten, harass, bully, stalk, exploit, or intimidate anyone. Do not post or send violent, hateful, sexually exploitative, abusive, or illegal content. Do not endanger any person or animal.",
      ],
    },
    {
      title: "3. Respect privacy",
      body: [
        "Do not share another person's private information without their consent — including phone numbers, home addresses, payment details, identity documents, or private messages. Do not misuse location features to track or intimidate anyone.",
      ],
    },
    {
      title: "4. No fraud or manipulation",
      body: [
        "Do not submit false or fabricated lost-pet, stray, or caution alerts on the map. Do not solicit, submit, or offer fake reviews or inflate ratings for care providers or customers. Do not fabricate or tamper with booking evidence, handoff records, or Start PIN confirmations. Do not engage in off-platform payment schemes to avoid Huddle's fees, safety tools, or dispute process.",
      ],
    },
    {
      title: "5. Care marketplace conduct",
      body: [
        "Do not misrepresent care qualifications, insurance, licences, or certifications — including claiming credentials listed as Self-declared are independently verified. Do not misuse emergency vet permission; it exists only for genuine emergencies and may not be used to authorise non-emergency treatment. Do not coerce, pressure, or manipulate customers or providers in connection with bookings, reviews, payments, or dispute processes.",
      ],
    },
    {
      title: "6. Follow the law",
      body: [
        "Comply with all applicable laws, including animal welfare regulations. Do not use Huddle for unlawful commerce, harassment, fraud, money laundering, or any other illegal purpose.",
      ],
    },
    {
      title: "7. Enforcement",
      body: [
        "Violations may result in content removal, feature suspension, payout holds, trust badge revocation, account suspension, or permanent ban. Huddle may block related devices, phone numbers, or payment methods to prevent re-entry where permitted by law.",
      ],
    },
  ],
};

const cookies: NativeLegalPageContent = {
  path: "/cookies",
  title: "Cookies and Similar Technologies Notice",
  effectiveDate: "20 May 2026",
  intro: [
    "Huddle may use cookies, SDKs, local storage, and similar technologies in its app, websites, and related services.",
  ],
  sections: [
    {
      title: "1. Why Huddle uses these tools",
      body: [
        "These technologies support authentication, security, session persistence, usage analytics, recommendations, crash reporting, and advertising measurement.",
      ],
    },
    {
      title: "2. Your choices",
      body: [
        "Depending on the technology and your location, choices may be available through your device settings, app permissions, or privacy controls within the app. Where consent is required by law before non-essential technologies are used, Huddle will request it.",
      ],
    },
    {
      title: "3. More information",
      body: [
        "For full details on how Huddle uses personal information, see the Privacy Policy. To manage your privacy choices or submit a request, see Privacy Choices.",
      ],
    },
  ],
};

const nativePrivacyChoices: NativeLegalPageContent = {
  path: "/nativeprivacychoices",
  title: "Privacy Choices",
  effectiveDate: "20 May 2026",
  intro: [
    "This page explains how to manage your privacy settings in the app and how to contact Huddle for requests that cannot be completed in-app.",
  ],
  sections: [
    {
      title: "1. In-app controls",
      body: [
        "You can manage many settings directly in the app, including profile visibility, map pin status, notification preferences, location access, and account details.",
      ],
    },
    {
      title: "2. Submitting a request",
      body: [
        "For access, correction, deletion, restriction, data portability, consent withdrawal, marketing opt-out, or any other privacy or legal request, email support@huddle.pet. Include the email address or phone number linked to your account, the type of request, sufficient detail for Huddle to understand and locate the relevant information, and reasonable information to verify your identity.",
      ],
    },
    {
      title: "3. How requests are handled",
      body: [
        "Huddle may verify your identity before acting on a request. Huddle may decline or limit a request where permitted by law — for example, where information must be retained for fraud prevention, dispute resolution, legal compliance, or safety. Huddle will respond within the timeframe required by applicable law.",
      ],
    },
    {
      title: "4. Complaints",
      body: [
        "If you have a privacy complaint, contact Huddle first at support@huddle.pet. You may also have the right to file a complaint with the data protection authority in your country of residence.",
      ],
    },
  ],
};

const serviceProviderAgreement: NativeLegalPageContent = {
  path: "/service-provider-agreement",
  title: "Care Service Provider Agreement",
  effectiveDate: "20 May 2026",
  intro: [
    "This Agreement applies to any user who registers, is approved, or offers care services through Huddle. These users are called Care Service Providers. By registering or providing services through Huddle, you agree to this Agreement, the Terms of Service, Privacy Policy, and Community Guidelines. Where this Agreement conflicts with the Terms of Service, this Agreement controls for provider matters.",
  ],
  sections: [
    {
      title: "1. Huddle's role",
      body: [
        "Huddle is a technology platform that enables users to find each other, communicate, and arrange care services. Huddle does not provide, supervise, direct, or control how you perform any care service and does not employ you.",
      ],
    },
    {
      title: "2. Independent provider status",
      body: [
        "You are an independent service provider — not an employee, worker, agent, partner, or joint venturer of Huddle. You are solely responsible for your own taxes, licences, permits, insurance, and legal compliance. You must not represent yourself as an employee, agent, or representative of Huddle to customers or any third party.",
      ],
    },
    {
      title: "3. Eligibility and identity verification",
      body: [
        "You must be at least 18 years old. You must complete all identity verification, ID/passport checks, payment method confirmation, and trust steps Huddle requires before accessing the care marketplace. Your marketplace access is conditional on maintaining good standing, up-to-date verification, and a valid Stripe Connect payout account. Huddle may pause or revoke your marketplace access if any required verification lapses or becomes invalid.",
      ],
    },
    {
      title: "4. Profile accuracy and credentials",
      body: [
        "Your profile, listings, rates, availability, qualifications, and service descriptions must be accurate and not misleading at all times.",
        "Credential badges on your profile are labelled as either verified (Registry matched, Certificate matched, Organisation matched, or Directory matched) or Self-declared. Self-declared badges are based solely on your own claim and are not verified by Huddle. Huddle makes no representation about the accuracy of self-declared credentials.",
        "You must notify Huddle promptly if any listed credential lapses, is suspended, or materially changes. You must never claim qualifications, licences, insurance, or certifications you do not hold.",
      ],
    },
    {
      title: "5. Care standards and handoff obligations",
      body: [
        "You must provide care with reasonable skill, care, and professionalism; follow all agreed care instructions; communicate with customers in a timely manner; and complete confirmed bookings unless prevented by genuine emergency.",
        "Where a booking requires a Start PIN or check-in photo, you must not submit or record a start confirmation until the customer has genuinely completed handoff and you are ready to begin care. Submitting false, fabricated, or misleading handoff evidence — including confirming a Start PIN you did not receive from the customer, or uploading a check-in photo that does not reflect the actual start of care — is a material breach of this Agreement. It may result in immediate suspension, forfeiture of payout, and permanent ban.",
        "You must report any serious incident — including pet injury, illness, escape, property damage, safety concerns, or police involvement — to both Huddle and the customer without undue delay.",
      ],
    },
    {
      title: "6. Emergency vet permission",
      body: [
        "Where a customer grants emergency vet permission in a booking, you are authorised to consent to emergency veterinary treatment on the customer's behalf only where: (a) the pet faces a genuine, time-critical medical emergency, and (b) you have made reasonable attempts to contact the customer first and could not reach them in time.",
        "All veterinary costs arising from treatment authorised under emergency vet permission are the customer's sole financial responsibility. Huddle is not liable for any veterinary costs, treatment outcomes, or decisions made under this permission.",
        "This permission does not authorise you to consent to elective, non-urgent, or preventative treatment. Misusing emergency vet permission — including using it outside a genuine emergency — is a breach of this Agreement and the Community Guidelines.",
      ],
    },
    {
      title: "7. Fees, payouts, and Stripe Connect",
      body: [
        "Huddle charges a 10% platform fee on the agreed care scope price. You receive 90% of the agreed price, less any applicable Stripe Connect processing fees, taxes, and deductions for refunds, chargebacks, or dispute resolutions.",
        "Payouts are processed through Stripe Connect. You must complete Stripe Connect onboarding and maintain a valid payout account. Huddle is not responsible for payout delays caused by incomplete Stripe onboarding, bank processing times, or Stripe's own processing requirements. Payouts may be held where required for fraud review, dispute resolution, regulatory compliance, or platform risk management. Where a payout is held, Huddle will notify you and release it as soon as reasonably practicable once the relevant review is resolved.",
      ],
    },
    {
      title: "8. Cancellations and disputes",
      body: [
        "You must honour all confirmed bookings. Acceptable grounds for cancellation are: a genuine emergency preventing you from performing care; a safety concern for you, the pet, or a third party that Huddle accepts; customer failure to complete handoff as required; or a Huddle-authorised cancellation. Repeated or unexplained cancellations may reduce your visibility, ranking, and marketplace access.",
        "Where a dispute is raised, Huddle will review platform records, messages, timestamps, handoff evidence, Start PIN logs, check-in submissions, and mid-care photos. Huddle's determination of the final payout amount and customer refund is binding. You may appeal a dispute decision in writing to support@huddle.pet within 5 business days of the decision. Huddle will respond to appeals within 10 business days.",
      ],
    },
    {
      title: "9. Reviews",
      body: [
        "Customers may submit a post-booking review including a star rating, review tags, written feedback, and up to six media files. Reviews are posted publicly on your provider profile. Huddle may moderate or remove reviews that violate the Terms of Service or Community Guidelines.",
        "You must not solicit, offer, or arrange for false, coerced, or incentivised reviews. You must not retaliate against customers who submit honest negative reviews.",
      ],
    },
    {
      title: "10. Customer data and confidentiality",
      body: [
        "You may receive personal information about customers and pets — including names, addresses, contact details, medical information, behaviour notes, and access instructions — solely to perform confirmed bookings. You must not use, share, copy, retain, or otherwise process this information for any other purpose. This obligation survives termination of your marketplace access.",
      ],
    },
    {
      title: "11. Suspension and termination",
      body: [
        "Huddle may suspend, restrict, or permanently revoke your marketplace access — with or without prior notice — for breach of this Agreement or any Huddle policy; safety, fraud, legal, quality, or reputational risk; repeated customer complaints; failure to maintain required verification or Stripe Connect status; or conduct that harms users, pets, or the platform. Huddle may block related devices, phone numbers, or payout accounts to prevent re-entry where permitted by law.",
      ],
    },
    {
      title: "12. Other applicable terms",
      body: [
        "The disclaimers, liability limits, indemnity provisions, governing law, and dispute process in the Terms of Service apply to you as a Care Service Provider.",
      ],
    },
  ],
};

const bookingTerms: NativeLegalPageContent = {
  path: "/booking-terms",
  title: "Care Service Booking Terms",
  effectiveDate: "20 May 2026",
  intro: [
    "These terms apply when you create a Care Scope Request, book, pay for, or receive care services through Huddle as a pet owner or care customer. They work together with the Terms of Service, Privacy Policy, and Community Guidelines. Where these terms conflict with the Terms of Service, these terms control for booking matters.",
  ],
  sections: [
    {
      title: "1. Huddle's role",
      body: [
        "Huddle is a technology platform. It enables users to find providers, communicate, and arrange care. Huddle is not the care provider, does not employ providers, and does not supervise or control how care is performed.",
      ],
    },
    {
      title: "2. Your responsibilities as a customer",
      body: ["Before confirming payment, you must provide complete, accurate, and up-to-date booking information, including:"],
      bullets: [
        "Pet details: species, breed, age, weight, temperament, and any known behaviour or escape risks.",
        "Health information: existing conditions, current medications, allergies, dietary restrictions, and any care limitations.",
        "Booking logistics: service dates and times, location, access method, access instructions, and a valid emergency contact.",
        "Emergency vet contact: the name and contact number of your pet's usual veterinarian.",
        "Care instructions: all instructions the provider needs to perform the service safely and as agreed.",
      ],
    },
    {
      title: "3. Consequences of inaccurate information",
      body: [
        "Providing incomplete, inaccurate, or misleading booking information, including omitting known health conditions, behaviour risks, medication needs, or access hazards, is a breach of these terms. Huddle or the provider may reject, cancel, or stop a booking without refund where booking information is materially incomplete or misleading.",
        "Where a care incident arises from information you failed to disclose or misrepresented, your ability to make a claim against the provider or Huddle for that incident may be reduced or extinguished.",
      ],
    },
    {
      title: "4. Emergency vet permission",
      body: [
        "The booking flow includes an option to grant emergency vet permission. If you grant this permission, you authorise the provider to consent to emergency veterinary treatment on your pet's behalf only where: (a) your pet faces a genuine, time-critical medical emergency, and (b) the provider cannot reach you in time.",
        "Granting emergency vet permission does not transfer any financial obligation to the provider or to Huddle. All costs for emergency veterinary treatment authorised under this permission are your sole financial responsibility. Neither the provider nor Huddle is liable for any veterinary costs, treatment decisions, or treatment outcomes resulting from care authorised under this permission.",
      ],
    },
    {
      title: "5. Start PIN and handoff",
      body: [
        "Some bookings use a Start PIN or check-in photo to confirm the start of care. Share your Start PIN only when you have completed handoff and you are ready for the provider to begin. Sharing the Start PIN records your consent that handoff is complete.",
        "If you do not complete handoff as required and the provider reports a handoff issue, Huddle may determine that care did not start due to your action or inaction. A no-start charge may apply where it is expressly disclosed to you before payment and permitted by applicable law. The amount or calculation method will be shown during the booking or payment confirmation flow if applicable.",
      ],
    },
    {
      title: "6. Cancellation policy",
      body: [
        "You can cancel a paid booking from the chat at any time before care starts.",
        "Cancellations made within 24 hours of the scheduled start of care are non-refundable. The provider keeps the booking amount in recognition of the time they reserved.",
        "Huddle does not commit to a specific refund schedule for cancellations outside the non-refundable window. Refunds are reviewed case by case, taking into account the situation, the provider's response, and the booking history.",
        "If the provider cancels, does not show up, or Huddle cancels the booking, you receive a full refund of the booking amount to your original payment method.",
        "For urgent or exceptional circumstances — medical emergency, family crisis, or safety concern — contact support@huddle.pet. Huddle may cover the cancellation cost on your behalf as a goodwill exception, at its discretion.",
        "Nothing in this section limits rights you have under applicable consumer protection law.",
      ],
    },
    {
      title: "7. Trust & Safety review",
      body: [
        "If something serious happens — the provider did not show up, there was a problem at handoff, or you have a safety concern about how care was delivered — you can send the case with evidence to support@huddle.pet. Huddle will hold payment to the provider while the Trust & Safety team reviews it.",
        "The Trust & Safety team reviews booking records, messages, timestamps, Start PIN events, check-in photos, and any evidence you share. Outcomes range from a full refund, to a partial refund, to releasing payment to the provider, depending on what the records show.",
        "Raise any serious issue within 48 hours of the actual or expected completion of care. Issues raised outside this window may not be eligible for review.",
      ],
    },
    {
      title: "8. Provider credentials and suitability",
      body: [
        "You are responsible for reviewing a provider's profile, listed credentials, ratings, and limitations before booking. Credential badges marked Self-declared are based solely on the provider's own claim and have not been verified by Huddle. Verified badges reflect completion of Huddle's applicable verification steps at the time of issue only and do not guarantee the provider's current qualifications, insurance, conduct, or fitness for the care you require.",
      ],
    },
    {
      title: "9. Off-platform dealings",
      body: [
        "You must not agree with or pressure providers to make payments outside Huddle's system, proceed without a confirmed booking, or otherwise bypass Huddle's fees, safety tools, booking records, or dispute process where Huddle requires use of in-app booking, messaging, and payment tools.",
      ],
    },
    {
      title: "10. Post-booking reviews",
      body: [
        "After a booking is completed, you may submit a review including a star rating, review tags, written feedback, and up to six media files. Your review will be posted publicly on the provider's profile. You must not submit false, misleading, coerced, or incentivised reviews. Reviews may be moderated or removed by Huddle for policy violations.",
      ],
    },
    {
      title: "11. Incident reporting",
      body: [
        "Report any serious incident to Huddle within 48 hours. A serious incident includes: pet injury or illness during or following care; property damage; provider misconduct or a safety concern; a booking that did not start or complete as agreed; or any other event a reasonable person would consider material to the care provided.",
      ],
    },
    {
      title: "12. Session history and records",
      body: [
        "Completed care sessions are removed from your active view 14 days after the session ends. They remain accessible in Care History within the app. Huddle also retains booking records for safety, legal compliance, dispute resolution, financial purposes, and audit, regardless of what is shown in your active view.",
      ],
    },
    {
      title: "13. Disclaimers and liability",
      body: [
        "To the maximum extent permitted by law, Huddle is not responsible for the acts, omissions, conduct, quality, safety, qualifications, or suitability of any provider, care service, or booking outcome. Huddle does not provide insurance or guaranteed reimbursement for care incidents unless expressly stated. Huddle's total liability is limited as set out in the Terms of Service.",
      ],
    },
    {
      title: "14. Force majeure",
      body: [
        "Neither Huddle nor the provider is liable for failure or delay in performance caused by events beyond their reasonable control, including natural disasters, extreme weather, public health emergencies, or government actions. Where such events affect a booking, Huddle may cancel it and issue refunds in accordance with platform policy.",
      ],
    },
  ],
};

export const NATIVE_LEGAL_PAGES: Record<string, NativeLegalPageContent> = {
  "/privacy": privacy,
  "/terms": terms,
  "/privacy-choices": nativePrivacyChoices,
  "/cookies": cookies,
  "/community-guidelines": communityGuidelines,
  "/service-provider-agreement": serviceProviderAgreement,
  "/booking-terms": bookingTerms,
};

export const getNativeLegalPage = (path: string) => NATIVE_LEGAL_PAGES[path] || null;
