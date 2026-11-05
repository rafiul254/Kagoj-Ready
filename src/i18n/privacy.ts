export const privacyCopy = {
  en: {
    intro:
      "Plain-language privacy and limitations. Please read before uploading personal documents.",
    sections: [
      [
        "Where images and fields go",
        "With your consent, images travel through the app server to Google’s Gemini API. The server processes them in memory and does not write uploaded images, OCR text or extracted fields to application logs, a database or disk. Google’s own processing and retention terms apply. Your hosting provider can retain request metadata.",
      ],
      [
        "What stays in this tab",
        "Your context, extracted fields, edits, confirmations and report live in this tab’s session storage. Image files stay only in browser memory during processing and are not saved in session storage. This is not encrypted storage: people with access to your browser or developer tools may read it. Avoid shared devices.",
      ],
      [
        "Delete my data",
        "The button at the end of each page clears this app’s session-storage keys, current case state and in-flight browser work. It does not erase files you downloaded or data already processed or retained by Google. Browser session restoration may restore session storage; use the delete button when finished.",
      ],
      [
        "No accounts, no identity tracking",
        "There are no accounts or analytics. Rate-limit and cost-control metadata may contain short-lived hashed IPs, opaque case/document IDs and counters, but never OCR text or document fields. Without an optional shared limit store, rate limits are per server process and reset across instances; unknown case budgets fail closed.",
      ],
      [
        "Different processing modes",
        "Personal uploads never receive fabricated sample results. They use live Gemini or a clear error. Sample mode tries Gemini, then a genuine recorded run if available, otherwise a clearly labeled synthetic fixture run. Fixture results are not AI accuracy evidence.",
      ],
      [
        "What this report cannot decide",
        "This is not an official service or legal advice. Confirmation and OCR can be wrong. Similar names do not prove identity. No approval probability, readiness score or rejection guarantee is produced. Official rules are placeholders until a human owner verifies them.",
      ],
      [
        "Deployment readiness",
        "Live provider accuracy and production security need verification with your chosen Gemini model and hosting environment. Use synthetic samples until those checks and official-rule verification are complete.",
      ],
    ],
  },
  bn: {
    intro:
      "গোপনীয়তা ও সীমাবদ্ধতা, সহজ ভাষায়। ব্যক্তিগত কাগজ দেওয়ার আগে পড়ুন।",
    sections: [
      [
        "ছবি ও তথ্য কোথায় যায়",
        "আপনার সম্মতিতে ছবি অ্যাপ সার্ভার হয়ে Google-এর Gemini API-তে যায়। সার্ভার মেমরিতে কাজ করে; আপলোডের ছবি, OCR লেখা বা পড়া তথ্য অ্যাপের লগ, ডেটাবেস বা ডিস্কে লেখে না। Google-এর নিজস্ব প্রক্রিয়াকরণ ও সংরক্ষণের শর্ত প্রযোজ্য। হোস্টিং সেবায় অনুরোধের মেটাডেটা থাকতে পারে।",
      ],
      [
        "এই ট্যাবে কী থাকে",
        "আপনার প্রসঙ্গ, পড়া তথ্য, সম্পাদনা, নিশ্চিতকরণ ও রিপোর্ট এই ট্যাবের সেশন স্টোরেজে থাকে। ছবি শুধু প্রক্রিয়াকরণের সময় ব্রাউজার মেমরিতে থাকে; সেশন স্টোরেজে রাখা হয় না। এটি এনক্রিপ্ট করা স্টোরেজ নয়। ব্রাউজার বা ডেভেলপার টুলসের প্রবেশাধিকার থাকলে অন্য কেউ পড়তে পারে। শেয়ার করা ডিভাইস এড়িয়ে চলুন।",
      ],
      [
        "আমার তথ্য মুছুন",
        "প্রতি পাতার শেষে বোতামটি অ্যাপের সেশন স্টোরেজ, বর্তমান কেস ও চলমান ব্রাউজারের কাজ মুছে বা বাতিল করে। নামানো ফাইল বা Google ইতিমধ্যে সংরক্ষণ করা তথ্য এতে মোছে না। ব্রাউজার সেশন ফিরিয়ে আনলে স্টোরেজও ফিরতে পারে; কাজ শেষে মুছে দিন।",
      ],
      [
        "অ্যাকাউন্ট বা পরিচয় ট্র্যাকিং নেই",
        "কোনো অ্যাকাউন্ট বা অ্যানালিটিক্স নেই। সীমা ও খরচ নিয়ন্ত্রণে স্বল্পমেয়াদি হ্যাশ করা IP, অর্থহীন কেস/কাগজ আইডি ও কাউন্টার থাকতে পারে; OCR লেখা বা কাগজের তথ্য থাকে না। শেয়ার করা স্টোর না দিলে সার্ভারভেদে সীমা আলাদা ও রিসেট হতে পারে। অজানা কেস বাজেট গ্রহণ করা হয় না।",
      ],
      [
        "প্রক্রিয়ার ধরন আলাদা",
        "ব্যক্তিগত আপলোডে বানানো নমুনার ফল দেওয়া হয় না। লাইভ Gemini বা স্পষ্ট ত্রুটি দেখায়। নমুনায় আগে Gemini, তারপর প্রকৃত রেকর্ড থাকলে তা, নইলে স্পষ্ট লেবেলসহ কাল্পনিক পরীক্ষার তথ্য দেখায়। পরীক্ষার তথ্য AI নির্ভুলতার প্রমাণ নয়।",
      ],
      [
        "রিপোর্ট যা বলতে পারে না",
        "এটি সরকারি সেবা বা আইনি পরামর্শ নয়। OCR ও নিশ্চিতকরণে ভুল হতে পারে। নামের মিল পরিচয়ের প্রমাণ নয়। অনুমোদনের সম্ভাবনা, প্রস্তুতির স্কোর বা প্রত্যাখ্যানের নিশ্চয়তা দেওয়া হয় না। মালিক যাচাই না করা পর্যন্ত সরকারি নিয়ম শুধু স্থানধারক।",
      ],
      [
        "প্রকাশের প্রস্তুতি",
        "পছন্দের Gemini মডেল ও হোস্টিংয়ে লাইভ নির্ভুলতা ও নিরাপত্তা যাচাই দরকার। এগুলো ও সরকারি নিয়ম যাচাই শেষ না হওয়া পর্যন্ত কাল্পনিক নমুনা ব্যবহার করুন।",
      ],
    ],
  },
};
