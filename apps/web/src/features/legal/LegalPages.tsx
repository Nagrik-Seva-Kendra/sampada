import type { ReactNode } from "react";

/**
 * Public, no-login legal pages linked from the Meta WhatsApp app listing:
 * /privacy and /data-deletion. Always bilingual (English + Hindi together,
 * independent of the language toggle) so both reviewers and customers can read
 * them. Keep every statement true to what the WhatsApp intake code actually
 * does -- no claims the system doesn't back up.
 */

const CONTACT_EMAIL = "anujshrm325@gmail.com";
const LAST_UPDATED_EN = "28 September 2026";
const LAST_UPDATED_HI = "28 सितंबर 2026";

function Section({ en, hi, children }: { en: string; hi: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700 }}>
        {en} / {hi}
      </h3>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, lineHeight: 1.6 }}>{children}</div>
    </section>
  );
}

function LegalShell({ kicker, titleEn, titleHi, children }: { kicker: string; titleEn: string; titleHi: string; children: ReactNode }) {
  return (
    <section className="page">
      <div className="wrap" style={{ maxWidth: 760 }}>
        <div className="kicker">
          <span className="rule" />
          {kicker}
        </div>
        <h2 className="page-title">{titleEn}</h2>
        <h2 className="page-title" style={{ fontSize: 22 }}>
          {titleHi}
        </h2>
        <p className="doc-sub" style={{ marginTop: 8 }}>
          Last updated: {LAST_UPDATED_EN} · अंतिम अपडेट: {LAST_UPDATED_HI}
        </p>
        {children}
        <p className="doc-sub" style={{ marginTop: 32 }}>
          <a href="/privacy">Privacy Policy / गोपनीयता नीति</a> · <a href="/data-deletion">Data Deletion / डेटा हटाना</a>
        </p>
      </div>
    </section>
  );
}

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export function PrivacyPolicyPage() {
  return (
    <LegalShell kicker="Nagrik Seva Kendra (NSK)" titleEn="Privacy Policy" titleHi="गोपनीयता नीति">
      <Section en="Who we are" hi="हम कौन हैं">
        <p>
          This service is operated by Nagrik Seva Kendra (NSK), Gwalior, Madhya Pradesh, which provides licensed
          document writer (dastavez lekhak) services.
        </p>
        <p>
          यह सेवा नागरिक सेवा केंद्र (NSK), ग्वालियर, मध्य प्रदेश द्वारा संचालित है, जो लाइसेंस प्राप्त दस्तावेज़ लेखक
          सेवाएँ प्रदान करता है।
        </p>
      </Section>

      <Section en="Information we collect" hi="हम कौन-सी जानकारी लेते हैं">
        <p>When you contact us on WhatsApp, we receive and store:</p>
        <ul style={{ paddingLeft: 20, listStyle: "disc" }}>
          <li>your WhatsApp number and WhatsApp profile name;</li>
          <li>the messages you send us;</li>
          <li>documents you send, such as a photo or PDF of your old property registry;</li>
          <li>
            details you give for the deed: name, father's/husband's name, mother's name, Aadhaar number, PAN, mobile
            number, email, address and the transaction amount.
          </li>
        </ul>
        <p>जब आप WhatsApp पर हमसे संपर्क करते हैं, तो हम ये जानकारी प्राप्त और संग्रहीत करते हैं:</p>
        <ul style={{ paddingLeft: 20, listStyle: "disc" }}>
          <li>आपका WhatsApp नंबर और WhatsApp प्रोफ़ाइल नाम;</li>
          <li>आपके द्वारा भेजे गए संदेश;</li>
          <li>आपके द्वारा भेजे गए दस्तावेज़, जैसे पुरानी रजिस्ट्री की फ़ोटो या PDF;</li>
          <li>
            डीड के लिए दी गई जानकारी: नाम, पिता/पति का नाम, माता का नाम, आधार नंबर, PAN, मोबाइल नंबर, ईमेल, पता और
            सौदे की राशि।
          </li>
        </ul>
      </Section>

      <Section en="Why we use it" hi="हम इसका उपयोग क्यों करते हैं">
        <p>
          We use this information only to prepare your property deed / registry draft and to reply to you.
        </p>
        <p>हम इस जानकारी का उपयोग केवल आपका संपत्ति डीड / रजिस्ट्री ड्राफ्ट बनाने और आपको जवाब देने के लिए करते हैं।</p>
      </Section>

      <Section en="Use of AI" hi="AI का उपयोग">
        <p>
          To read the documents you send (for example, your old registry), the document is sent to the Anthropic
          (Claude) API, which reads the property and party details from it.
        </p>
        <p>
          आपके द्वारा भेजे गए दस्तावेज़ (जैसे पुरानी रजिस्ट्री) पढ़ने के लिए, वह दस्तावेज़ Anthropic (Claude) API को
          भेजा जाता है, जो उसमें से संपत्ति और पक्षकारों का विवरण पढ़ता है।
        </p>
      </Section>

      <Section en="Security and sharing" hi="सुरक्षा और साझा करना">
        <ul style={{ paddingLeft: 20, listStyle: "disc" }}>
          <li>Aadhaar and PAN numbers you type in the chat are stored in encrypted form.</li>
          <li>We do not sell your data.</li>
          <li>WhatsApp messages reach us through Meta's WhatsApp platform.</li>
        </ul>
        <ul style={{ paddingLeft: 20, listStyle: "disc" }}>
          <li>चैट में आपके द्वारा लिखे गए आधार और PAN नंबर एन्क्रिप्टेड रूप में संग्रहीत किए जाते हैं।</li>
          <li>हम आपका डेटा बेचते नहीं हैं।</li>
          <li>WhatsApp संदेश Meta के WhatsApp प्लेटफ़ॉर्म के माध्यम से हम तक पहुँचते हैं।</li>
        </ul>
      </Section>

      <Section en="How long we keep it" hi="हम इसे कितने समय तक रखते हैं">
        <p>We keep your information only for as long as it is needed for your work.</p>
        <p>हम आपकी जानकारी केवल तब तक रखते हैं जब तक वह आपके काम के लिए ज़रूरी हो।</p>
      </Section>

      <Section en="Deleting your data" hi="अपना डेटा हटवाना">
        <p>
          To have your data deleted, email <Mail /> or visit our office. It will be deleted within 30 days. See the{" "}
          <a href="/data-deletion">Data Deletion</a> page for details.
        </p>
        <p>
          अपना डेटा हटवाने के लिए <Mail /> पर ईमेल करें या हमारे कार्यालय आएँ। इसे 30 दिनों के भीतर हटा दिया जाएगा।
          विवरण के लिए <a href="/data-deletion">डेटा हटाना</a> पेज देखें।
        </p>
      </Section>

      <Section en="Contact" hi="संपर्क">
        <p>
          Nagrik Seva Kendra (NSK), Gwalior, Madhya Pradesh — <Mail />
        </p>
        <p>
          नागरिक सेवा केंद्र (NSK), ग्वालियर, मध्य प्रदेश — <Mail />
        </p>
      </Section>
    </LegalShell>
  );
}

export function DataDeletionPage() {
  return (
    <LegalShell kicker="Nagrik Seva Kendra (NSK)" titleEn="Data Deletion" titleHi="डेटा हटाने का अनुरोध">
      <Section en="How to request deletion" hi="डेटा हटाने का अनुरोध कैसे करें">
        <p>You can ask us to delete the data you shared with us on WhatsApp in either of these ways:</p>
        <ul style={{ paddingLeft: 20, listStyle: "disc" }}>
          <li>
            Email <Mail /> from any address, mentioning the WhatsApp number you used to contact us; or
          </li>
          <li>visit the Nagrik Seva Kendra (NSK) office in Gwalior, Madhya Pradesh.</li>
        </ul>
        <p>WhatsApp पर हमें दी गई जानकारी हटवाने के लिए आप इनमें से कोई भी तरीका अपना सकते हैं:</p>
        <ul style={{ paddingLeft: 20, listStyle: "disc" }}>
          <li>
            <Mail /> पर ईमेल करें और उसमें वह WhatsApp नंबर लिखें जिससे आपने हमसे संपर्क किया था; या
          </li>
          <li>नागरिक सेवा केंद्र (NSK), ग्वालियर, मध्य प्रदेश के कार्यालय आएँ।</li>
        </ul>
      </Section>

      <Section en="What happens next" hi="इसके बाद क्या होगा">
        <p>
          Your messages, documents and the details you gave us will be deleted within 30 days of your request.
        </p>
        <p>आपके अनुरोध के 30 दिनों के भीतर आपके संदेश, दस्तावेज़ और आपके द्वारा दी गई जानकारी हटा दी जाएगी।</p>
      </Section>

      <Section en="Contact" hi="संपर्क">
        <p>
          <Mail />
        </p>
      </Section>
    </LegalShell>
  );
}
