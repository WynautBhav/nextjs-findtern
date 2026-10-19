/**
 * FAQ - real CMS content.
 *
 * Pulled from GET https://findtern.in/api/website/faq on 2026-10-02:
 * 89 rows, split Intern 49 / Employer 40.
 *
 * Two data problems handled here rather than by editing the CMS:
 *
 *  1. The employer rows are stored with the category string "Employer " -
 *     a trailing space. Left alone it becomes a second chip that looks
 *     identical to the first. The legacy Faq.tsx also derived its chips from
 *     these raw values, so the live site currently shows three chips where
 *     there should be two. `category` is trimmed on read.
 *
 *  2. Every row shares `sortOrder: 0`, so a stable secondary sort by
 *     insertion order is applied instead of letting an unstable comparator
 *     shuffle the list between requests.
 */
import type { CmsFaqItem } from "./types";

export const FAQ_INTERN: CmsFaqItem[] = [
  {
    "id": "0f8fae53-9864-4689-8f21-9cc3020c672d",
    "category": "Intern",
    "question": "How will I know if a company is interested in me?",
    "answer": "When an employer views your profile or shortlists you based on your Findtern Score and AI interview, you’ll receive a notification on your dashboard and via email. \nIf the company chooses to share feedback, it will appear under the “My Feedback” section of your dashboard. This helps you track company interest in real time. The more optimized your profile and the higher your Findtern Score, the better your chances of getting noticed.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "d06fb59b-93fb-49d2-8883-63ac4cba45f8",
    "category": "Intern",
    "question": "My AI interview isn’t loading-how can I fix it?",
    "answer": "If your AI interview on Findtern isn’t loading, check your internet connection, browser settings, and device compatibility. We recommend using the latest version of Chrome or Edge with a working webcam and microphone. Clear cache/cookies and try again. If the issue persists, contact Findtern support via the Help section (https://findtern.in/contact.) or email.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "60d53375-b7f4-4d15-818d-60af3fb14aaf",
    "category": "Intern",
    "question": "Is Findtern free for the interns?",
    "answer": "Creating a profile on Findtern is free. However, to make your profile live and visible to companies, you must take the AI interview, which comes with a one-time fee of ₹2,499.\nThe AI interview generates your Findtern Score, showcasing your technical and soft skills and helping companies easily notice and shortlist your profile.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "61cc9f46-9fc8-49c8-a546-62e6c826f505",
    "category": "Intern",
    "question": "Can I change my email or phone number on my profile?",
    "answer": "Yes, you can update your email ID or phone number, but these changes can only be made after raising a request with Findtern Support. This ensures the authenticity of your profile and prevents misuse. For other details like skills, education, or profile summary, you can freely edit them anytime from your dashboard under Edit Profile. \n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "eca48cd1-2eb6-4323-8832-0e7953be3d66",
    "category": "Intern",
    "question": "I have forgotten my password. How do I reset it?",
    "answer": "If you forget your password, click on the “Forgot Password” option on the Findtern login page. You will receive an email on your registered email address, and all further instructions to reset your password will be provided in that email.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "94140c2c-4f9b-4e37-aa5a-d561f7e115bb",
    "category": "Intern",
    "question": "Can I improve my Findtern Score? If yes, how?",
    "answer": "Yes, you can improve your Findtern Score.\n Once your score is generated after the AI interview, it becomes your official rating. If you wish to improve it, you can retake the AI interview, but please note that the AI interview fee must be paid again for each retake.\nTo schedule a new attempt, you can contact the Findtern team. Preparing well-by practicing interview questions, strengthening your technical knowledge, and improving your communication skills-will help you perform better in the next round and achieve a higher score.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "62bb4f40-b68f-4f72-b29d-dc5b845bae2d",
    "category": "Intern",
    "question": " Does Findtern guarantee internship placement?",
    "answer": "Yes, Findtern provides an internship guarantee.\nIf you do not secure an internship through the Findtern platform within the guarantee window set out in the intern terms, you will receive a full refund of your registration and AI interview fee.\n\nFindtern offers a verified and transparent platform where students connect with genuine companies. Your internship opportunities depend on your Findtern Score, skills, and company requirements. Candidates with a profile score above 6 are eligible for paid internship opportunities.\n\nThink of Findtern as your career launchpad-we actively bridge the gap between students and employers, and we stand by our commitment with a 100% refund guarantee if you don’t get placed within the guarantee window.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "dae66303-29d6-44b8-b56c-f0198337a67a",
    "category": "Intern",
    "question": "Can I talk to someone from Findtern if I face issues during the AI interview?",
    "answer": "Yes, you can reach our support team via email at [communicate@findtern.in] or submit your query directly at https://findtern.in/contact. We understand that technical glitches can happen, and our team is always ready to assist you so you can complete your AI interview without any stress.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "a3cfd14b-0ff4-4170-84f1-d38f6786062e",
    "category": "Intern",
    "question": "What should I do if my payment fails during registration?",
    "answer": "If your payment fails, first check your bank statement. If money is deducted but not updated on Findtern, it usually gets refunded by your bank within 5–7 working days. If not, contact Findtern support with transaction details for resolution.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "02fff963-6383-4428-a564-df455fbdbe99",
    "category": "Intern",
    "question": "Is the ₹2,499 AI interview fee refundable if I don’t get internships?",
    "answer": "The AI interview fee is refundable. If you do not secure an internship within the guarantee window set out in the intern terms, you will receive a full refund.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "d84e0a25-449f-462f-8217-dc794a4588ff",
    "category": "Intern",
    "question": "What if I don’t have a resume - does Findtern help me create one? Or Do I need to upload my resume to apply for internships on Findtern?",
    "answer": "You don’t need to worry if you don’t already have a resume. Findtern automatically creates a professional resume for you based on the details you provide in your profile. Once your profile is complete, you can download your ready-to-use resume anytime from your dashboard. This saves you the effort of formatting and ensures your resume highlights your skills and achievements effectively.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "4108794d-b52b-49e6-9b70-a708c5e588d8",
    "category": "Intern",
    "question": "Does Findtern help me get a full-time job after internships?",
    "answer": "Yes. Many companies on Findtern offer Pre-Placement Offers (PPOs) to interns who perform well. Your Findtern profile also becomes stronger over time, giving you visibility for entry-level full-time jobs.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "9191de3b-40f7-44f4-83d6-5a67c169ed77",
    "category": "Intern",
    "question": "Is English compulsory for the AI interview?",
    "answer": "Yes, English is compulsory for the Findtern AI interview since most companies use English as the primary language of communication. The platform is designed to evaluate your communication, clarity, and confidence in English, as these are crucial skills for internships and future career opportunities. ",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "cf142c2d-dc01-4292-b8da-39caf0f7187b",
    "category": "Intern",
    "question": "How do I know if a company on Findtern is verified and genuine?",
    "answer": "Every company listed on Findtern goes through a verification process. We check company details, official websites, and job postings to ensure they are authentic. Only genuine, trustworthy employers can post internships on Findtern.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "838fd69e-5567-4326-96bb-37dc274f77e5",
    "category": "Intern",
    "question": "Can I showcase my Findtern Score on LinkedIn or my resume?",
    "answer": "Yes! Your Findtern Score is a credible measure of your skills and employability. You can display it on LinkedIn, resumes, or job applications to stand out. Recruiters value it as an authentic benchmark since it comes from an AI-driven interview.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "cdbec31f-a5ac-4fb9-b9f3-99e4873270cb",
    "category": "Intern",
    "question": "Is Findtern safe and secure to share my personal details?",
    "answer": "Absolutely. Findtern follows strict data privacy and security measures. Your personal details are encrypted and only shared with verified companies when you apply. We never sell or misuse student data.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "e38de8be-aa78-4cbc-b401-4885360313ae",
    "category": "Intern",
    "question": "What happens if my internet disconnects during the AI interview?",
    "answer": "If your internet drops, don’t worry. You can contact Findtern support to reschedule your attempt. We recommend using a stable Wi-Fi or mobile data connection for the best experience.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "7b1cd1a8-dbd5-4205-9c73-bfb7980d250b",
    "category": "Intern",
    "question": "How is Findtern different from other internship platforms?",
    "answer": "Unlike generic internship portals, Findtern uses AI-powered interviews and the unique Findtern Score to evaluate students. Instead of relying only on resumes, companies see a data-backed score that reflects your skills, confidence, and communication abilities. This ensures internships are offered on merit, not just networking or luck. For students, it means faster, transparent, and fairer opportunities compared to traditional platforms.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "23942c9c-6e3a-4b69-8324-2e088fa6b351",
    "category": "Intern",
    "question": "Do I need prior experience to apply for internships through Findtern?",
    "answer": "Not at all. Findtern is built for freshers and students without prior work experience. The AI interview helps highlight your skills, personality, and potential-not just your past experience.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "3cb18920-63dd-438f-b7d8-ecc6d6348bc7",
    "category": "Intern",
    "question": "is there an age limit to use Findtern?",
    "answer": "Applicants must be 18 years or older. Findtern is designed for students, recent graduates, and early-career professionals actively seeking internships. Whether you’re an undergraduate, postgraduate, or a career-shifter aged 18 or above, you can use Findtern to explore and apply for opportunities.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "ecc74f8e-9415-4ac4-9058-e263ffee759f",
    "category": "Intern",
    "question": "What payment methods are available for the AI interview fee?",
    "answer": "Findtern offers flexible and secure payment options to make the AI interview registration process hassle-free. You can pay the AI interview fee through:\nUPI apps (Google Pay, PhonePe, Paytm, BHIM, etc.)\n\n\nDebit and Credit Cards (Visa, MasterCard, RuPay, etc.)\n\n\nNet Banking (all major Indian banks supported)\n\n\nWallets (Paytm Wallet, Amazon Pay, etc.)\n\n\nAll transactions are powered by our trusted payment gateway partner, ensuring 100% security and data protection. Choose the method that suits you best and complete your registration instantly.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "b8dbd66f-f6ae-4cf6-903b-423d4cfc2ce5",
    "category": "Intern",
    "question": "Is there a practice test before the real AI interview?",
    "answer": "Currently, Findtern does not offer a separate practice test before the AI interview. However, our AI interview platform is designed to be student-friendly and intuitive, so you don’t need prior training to navigate it. You’ll receive clear on-screen instructions before starting, and the system will guide you step by step. \nSince your Findtern Score is based on your actual AI interview performance, preparing yourself by practicing general interview questions and improving your communication skills beforehand will help you perform better.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "7f27dae9-7277-40df-910c-fa97c3b13dac",
    "category": "Intern",
    "question": "Do I need a laptop to take AI interviews?",
    "answer": "Yes, having a laptop is mandatory to take your Findtern AI interview. The platform is designed to assess communication, technical, and problem-solving skills in a structured way that requires a laptop setup. Mobile phones or tablets are not supported, as they may affect the quality of your responses and the overall evaluation process. To ensure you perform your best and receive an accurate Findtern Score, make sure you have access to a laptop with a working camera, microphone, and stable internet connection.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "a3558a69-7d26-4d57-8935-2d672541ae5f",
    "category": "Intern",
    "question": "I have completed my internship but have not received the stipend and certificate. ",
    "answer": "If you haven’t received your stipend or internship certificate after completing your internship with Findtern, don’t worry. Sometimes there may be a delay in processing. In such cases, you need to raise a request directly with Findtern support through your dashboard or by contacting our help team. Once your request is verified, our team will release your stipend and certificate. Remember, both are issued only by Findtern - not the company - so always follow up with us if there’s a delay.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "9b7e086a-9d61-4d9c-bec6-aa11fc8b8911",
    "category": "Intern",
    "question": "What does the “Profile Viewed” mean?",
    "answer": "“Profile Viewed” means that a company has looked at your Findtern profile. This is a positive sign that you’re on their radar, and it could lead to shortlisting or further communication.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "8dcc3002-3e45-446e-8fb4-7a4fa76c0499",
    "category": "Intern",
    "question": "Why am I not receiving notifications on Findtern?",
    "answer": "If you are not receiving notifications, check these steps:\nCheck your spam/junk folder in email.\n\n\nVerify that your registered phone number and email are correct in the Edit Profile section.\n If the problem persists, contact Findtern support for assistance.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "53b1bbdc-270f-41b9-9e56-7a50064609be",
    "category": "Intern",
    "question": "How soon after the employer interview will I receive feedback?",
    "answer": "Feedback is not guaranteed for every interview, as it depends on the employer. However, if a company chooses to share feedback, you can expect it within 15 days of the interview. Once the 15-day window closes, the option for the employer to provide feedback will expire. If feedback is shared, you’ll find it under the “My Feedback” section of your Findtern dashboard.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "44a42cfc-462a-41d0-9baa-8fbd7f546053",
    "category": "Intern",
    "question": "Is the feedback I receive from an employer confidential, or will other companies be able to see it?",
    "answer": "Your feedback is confidential. Only you and the company that provided the feedback can view it. Other companies will not have access to it. This ensures privacy while still giving you valuable insights for improvement.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "bd38644d-2566-49a0-a471-c1133f5d1eea",
    "category": "Intern",
    "question": "What factors affect my Findtern Score?",
    "answer": "Several factors influence your Findtern Score:\n\nTechnical knowledge in your chosen field\n\n\nSoft skills like confidence, clarity, and communication\n\n\nProblem-solving ability\n\n\nConsistency with your self-rated skills\n\n\nOverall presentation and body language\n\n\nCompanies prefer candidates with a well-rounded score, so excelling in both technical and interpersonal skills is equally important.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "2a92528e-5f6c-494f-9692-ff91244088d6",
    "category": "Intern",
    "question": "How is my Findtern Score calculated?",
    "answer": "Your Findtern Score is calculated through AI analysis of your interview responses. The system evaluates your technical knowledge, soft skills, clarity of communication, and confidence. It also considers how well you performed compared to your self-rated skills. This makes the score an authentic representation of your abilities, helping companies identify the right fit.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "f42e1fed-46e0-4e0e-83b9-cadf77e757b9",
    "category": "Intern",
    "question": "What is the Findtern Score?",
    "answer": "The Findtern Score is your performance rating based on the AI interview. It reflects your technical skills, communication skills, problem-solving ability, and overall readiness for internships. Companies use this score to quickly evaluate candidates, which means a higher Findtern Score increases your chances of being shortlisted for internships.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "dc519ea8-7aff-4eae-b788-3e69a2fbcefa",
    "category": "Intern",
    "question": "Who do I contact if I face a technical issue?",
    "answer": "If you face any technical issues like AI interview not loading, profile glitches, or notification delays, you can reach out to Findtern Support through the “Help & Support” section in your dashboard or email us at communicate@findtern.in. Our team will assist you quickly.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "5656f008-d3f4-4922-9325-0b53c4b4bcd2",
    "category": "Intern",
    "question": "What kind of questions will the AI interview ask?",
    "answer": "The AI interview on Findtern is designed to give companies a complete view of your skills and personality. It includes:\n- General interview questions to evaluate your communication skills, confidence, body language, and ability to structure answers.\n- Skill-based questions, customized according to the skills you mention in your profile. The difficulty level adjusts to your self-rated skill level.\n- Technical or coding tasks (if applicable). For example, if you enter Java as a skill, you may face coding problems or technical problem-solving questions related to Java.\n\nThis structured approach ensures your Findtern Score reflects both your soft skills and technical strengths, giving companies a clear and fair picture of your potential.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "149efd34-516c-42cc-89e6-e0319589cb41",
    "category": "Intern",
    "question": "How long does the AI interview take?",
    "answer": "The AI interview on Findtern usually takes 30–60 minutes, depending on your chosen skills and responses. Since the interview adapts to your self-rated skill level, the number and difficulty of questions may vary. Make sure you have a stable internet connection and enough time before starting, as it’s best to complete it in one sitting.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "ebddc008-bc1d-4958-90e1-36425ef9d63c",
    "category": "Intern",
    "question": "Can I retake the AI interview if I make a mistake?",
    "answer": "In most cases, you cannot retake the AI interview immediately. However, if there was a genuine technical issue, you can contact Findtern support to request another attempt.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "ca1e0b46-3cd4-4d36-84b3-7430d6c0b035",
    "category": "Intern",
    "question": "Will the AI interview assess technical skills, soft skills, or both?",
    "answer": "The Findtern AI interview evaluates both technical and soft skills. Technical skills are assessed through domain-specific questions based on the skills you select, while soft skills such as communication, problem-solving, and adaptability are measured through situational and behavioral questions. This balanced approach ensures your Findtern Score reflects your overall employability, not just academic knowledge.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "b508ca5e-0afb-4d75-80e7-c69e9e23b57e",
    "category": "Intern",
    "question": "What kind of questions will the AI interview ask?",
    "answer": "The AI interview on Findtern is designed to give companies a complete view of your skills and personality. It includes:\nGeneral interview questions to evaluate your communication skills, confidence, body language, and ability to structure answers.\n\n\nSkill-based questions, customized according to the skills you mention in your profile. The difficulty level adjusts to your self-rated skill level.\n\n\nTechnical or coding tasks (if applicable). For example, if you enter Java as a skill, you may face coding problems or technical problem-solving questions related to Java.\n\n\nThis structured approach ensures your Findtern Score reflects both your soft skills and technical strengths, giving companies a clear and fair picture of your potential.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "a5590a41-4b59-4549-9f81-af9dfd5222fc",
    "category": "Intern",
    "question": "Can I pause the AI interview and continue later?",
    "answer": "No, once started, the AI interview must be completed in one sitting to ensure fairness. Make sure you have a stable internet connection, quiet environment, and charged laptop before beginning.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "76098615-4829-4063-8551-44dc3de5c1e9",
    "category": "Intern",
    "question": "How is the AI interview evaluated?",
    "answer": "The AI interview on Findtern is evaluated using advanced algorithms that measure your communication skills, confidence, problem-solving ability, technical knowledge, and overall personality traits. The self-evaluated skill ratings you provide while creating your profile directly influence the difficulty level of your AI interview, ensuring it matches your abilities. Your performance is then converted into a Findtern Score, which highlights your strengths and helps employers easily compare and shortlist candidates.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "e9811300-06cd-467f-8e38-8bab1afa4332",
    "category": "Intern",
    "question": "What is an AI interview and how is it different from a regular interview?",
    "answer": "An AI interview for internships is a virtual, automated interview where artificial intelligence evaluates your responses. Unlike a traditional interview, it evaluates you on multiple factors like communication, clarity, and confidence, making the process unbiased and faster. It’s faster, fairer, and available anytime.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "cfa89ac2-1217-492d-9417-1a148508ca7b",
    "category": "Intern",
    "question": "How do I take the AI interview?",
    "answer": "First, you’ll complete a self-assessment of your skills, which sets the difficulty level of your AI interview. After making the payment, Findtern will send your AI interview link within 24–48 business hours. The interview is online, so you’ll need a laptop or device with a camera, mic, and stable internet.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "7ecfc886-211d-43b2-8306-da8f8ad11b90",
    "category": "Intern",
    "question": "How do companies view my profile?",
    "answer": "Companies see a curated, pre-screened version of your profile, along with your Findtern Score and AI interview performance. This helps them evaluate your technical expertise, communication skills, and overall fit for the role before contacting you.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "ba144e8a-25d3-42d1-a0ab-474f8a29d514",
    "category": "Intern",
    "question": "Can I contact companies directly through Findtern?",
    "answer": "No, Findtern doesn’t allow direct messaging between students and companies. Instead, employers view your AI interview results, Findtern Score, and profile details before reaching out. This ensures a fair and unbiased selection process. All updates about company interest or feedback are delivered to you through notifications on the platform.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "20b85a33-d4f7-4cbf-a2fe-7f52c9ce3eed",
    "category": "Intern",
    "question": "Can I contact companies directly through Findtern?",
    "answer": "No, Findtern doesn’t allow direct messaging between students and companies. Instead, employers view your AI interview results, Findtern Score, and profile details before reaching out. This ensures a fair and unbiased selection process. All updates about company interest or feedback are delivered to you through notifications on the platform.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "b9d07483-58ad-48ba-9984-eecc4850f596",
    "category": "Intern",
    "question": "How can I improve my chances of being noticed by companies?",
    "answer": "To increase visibility, keep your Findtern profile updated, take the AI interview, and focus on achieving a higher Findtern Score. Companies rely on the score and feedback to shortlist candidates. Adding relevant skills will also boost your profile ranking.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "ed74b0f2-46ae-457e-9e6b-f1d23e6e1e2e",
    "category": "Intern",
    "question": "Are there part-time and full-time internship options?",
    "answer": "Findtern internships are full-time: 8 hours a day, 5 or 6 days a week. Many companies offer remote or hybrid work, which makes it easier to fit the internship around your studies.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "c413713a-3e9b-4986-aac9-f41c519b2748",
    "category": "Intern",
    "question": "How do I create a profile?",
    "answer": "Creating a profile on Findtern is simple. Sign up with your email, fill in your personal details, educational details, skills, location preferences and co-curricular activities (if any), and upload any relevant documents. The more complete your profile, the higher your chances of being shortlisted. Think of your Findtern profile as your digital resume for internships.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "7c0ace9a-4456-4ca6-b851-a7ed23dab352",
    "category": "Intern",
    "question": "Can I apply directly to internships on Findtern?",
    "answer": "No, interns cannot apply directly. Instead, companies discover you through your profile and Findtern Score. When a company finds your profile relevant, you will receive a notification. This system saves students from endless applications and ensures that opportunities are curated and meaningful.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "d5d72a92-563f-4c3c-aa06-c068848b5772",
    "category": "Intern",
    "question": "What types of internships are listed on Findtern?",
    "answer": "Findtern lists verified internships across multiple domains such as marketing, finance, human resources (HR), IT, data analysis, design, and more. Both online internships and on-site internships are available, depending on the company’s requirements. Every internship is paid and full-time, giving you real industry exposure. Every opportunity is screened to ensure that students get access to genuine and relevant internships.\n",
    "sortOrder": 0,
    "isActive": true
  }
];

export const FAQ_EMPLOYER: CmsFaqItem[] = [
  {
    "id": "5392bf83-aed4-405b-b92c-351a784335e6",
    "category": "Employer",
    "question": "What are projects?",
    "answer": "Projects are created by employers when they want to hire interns based on specific project requirements. On the Findtern employer page, employers define the project by adding the project name, scope of work, location, and the skills required for the intern who will work on that project.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "d02fb8e3-f94d-4617-9f57-7fd2cb3a047b",
    "category": "Employer",
    "question": "How can an employer use the Skill Filter Toggler?",
    "answer": "The Skill Filter Toggler lets employers control how candidates are ranked. When the toggler is ON, candidates are prioritized based on skill match, so profiles with higher matching skills appear at the top. When the toggler is OFF, the ranking is dominated by the Findtern Score, and candidates are listed from highest to lowest score, regardless of skill match priority. This allows employers to switch easily between skill-focused and score-focused shortlisting.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "d759fc9b-0078-4d4e-becb-c3eb371ccf0d",
    "category": "Employer",
    "question": "How does Findtern align intern skills with projects?",
    "answer": "Using AI-driven candidate matching, Findtern suggests interns whose skills fit employer project requirements, reducing mismatches and improving productivity.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "f09a05d7-5c1c-478d-8ade-7612bcb85a47",
    "category": "Employer",
    "question": "Can I ensure diverse and inclusive hiring?",
    "answer": "Yes. Employers may specify diversity and inclusion goals, and Findtern’s wide intern pool supports building inclusive teams.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "f5114e1d-bab8-4447-ad84-53ef1821e186",
    "category": "Employer",
    "question": " Does Findtern guarantee intern commitment?",
    "answer": "While attendance guarantees are difficult, Findtern ensures motivated, reliable interns through behavioral and skill screening.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "0ebdae99-ba8d-4e39-b484-c461f2eac1f4",
    "category": "Employer",
    "question": " How user-friendly is the platform?",
    "answer": "Findtern offers an easy-to-use interface where employers can post roles, manage applicants, and hire efficiently-all within a few clicks.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "af66a2fd-553f-4766-a679-68d2e2c42e10",
    "category": "Employer",
    "question": " What makes Findtern cost-effective?",
    "answer": "By automating sourcing, screening, and shortlisting, Findtern reduces recruitment costs while providing qualified interns faster.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "5f83811b-397d-4245-a245-1a206fc25bb3",
    "category": "Employer",
    "question": "How does Findtern ensure compliance with internship laws?",
    "answer": "Findtern stays updated with national and regional labor laws, giving guidance to employers for legal and ethical hiring.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "2a9681d7-ca9f-4cce-8316-a07952251bc2",
    "category": "Employer",
    "question": "Can I preview candidate profiles before hiring?",
    "answer": "Yes. Employers see detailed intern profiles, skill ratings, and assessments before making a decision.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "119d8388-fece-4143-8c87-8386b37de567",
    "category": "Employer",
    "question": "Are there any hidden fees or long-term commitments?",
    "answer": "No. Findtern offers transparent pricing-no hidden costs, commissions, or forced contracts.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "2b2c5e9e-f273-450e-8b20-41f5f7dcb98a",
    "category": "Employer",
    "question": "What if my company has unique requirements?",
    "answer": "Employers can set specific role criteria (skills, background, project needs). The Findtern algorithm matches the most relevant candidates.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "59cea5ea-d08c-496e-88fa-a8016dd9fff6",
    "category": "Employer",
    "question": "Does Findtern support urgent hiring?",
    "answer": "Yes. Employers can source interns within hours, making Findtern ideal for last-minute hiring needs.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "9fee3499-a418-4a55-9366-78a4d89be068",
    "category": "Employer",
    "question": " Can I convert interns into full-time employees?",
    "answer": "Yes. Employers may convert successful interns. Findtern charges 8.33% of annual CTC for structured conversion.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "b53e04fe-6844-4d41-b92b-e2be768ba1b3",
    "category": "Employer",
    "question": " What are Findtern’s employer pricing plans?",
    "answer": "Espresso (Free): For budget-friendly, short-term interns.\n\n\nCappuccino: For medium-skilled interns, longer durations.\n\n\nLatte: For high-skill and strategic long-term interns.\n\n\nEach plan suits different business needs.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "da17001d-f39f-448d-949d-a7ab39e0ff03",
    "category": "Employer",
    "question": " What is Findtern.in and how does it help?",
    "answer": "Findtern.in is a smart intern hiring platform that helps employers recruit pre-vetted, skill-ready interns through automated matchmaking and assessments, enabling fast, cost-effective hiring.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "d1703697-f964-4117-909a-16c70a352e95",
    "category": "Employer",
    "question": "How are interns pre-vetted?",
    "answer": "Interns undergo AI-driven aptitude tests, profile verification, interviews, and coding tests (if applicable) before being listed.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "19cea6c2-e686-48f8-9c89-a80796604cb6",
    "category": "Employer",
    "question": "What kind of companies use Findtern?",
    "answer": "Trusted by:\nStartups for flexible interns\n\n\nSMEs for project-based tasks\n\n\nCorporates for building talent pipelines\n\n\nNGOs/Non-profits for socially-driven projects\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "13be94ff-5cb4-490b-a45f-c1031ba7b368",
    "category": "Employer",
    "question": "Can I collaborate for campus hiring drives?",
    "answer": "Yes. Findtern partners with colleges and universities to help run campus hiring campaigns for employers.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "ef43867e-81f4-4d3f-adab-bd674c657f55",
    "category": "Employer",
    "question": "How is Findtern different from Internshala or LinkedIn?",
    "answer": "Unlike generic platforms:\nFindtern offers pre-screened candidates.\n\n\nEmployers avoid spam and irrelevant applications.\n\n\nAI-driven matching delivers the right candidates instantly.\n\n\nActive support team assists both candidates & employers.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "78123bae-fcde-4006-9774-1e755998777a",
    "category": "Employer",
    "question": "Is there a minimum or maximum internship duration?",
    "answer": "Yes. Internship durations on Findtern are fixed and can be 1, 2, 3, or 6 months, depending on the employer’s selection.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "38de9d19-7a7f-4778-b364-459b9b0af87a",
    "category": "Employer",
    "question": "Can startups and small businesses use Findtern?",
    "answer": "Absolutely. Many startups and SMEs hire via Findtern as they get cost-effective, pre-screened interns suited for project-based hiring.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "86a00cf4-4928-463a-9ddf-b1e784e4bf4d",
    "category": "Employer",
    "question": "Does Findtern provide hiring support?",
    "answer": "Yes. Our team supports you at all stages-shortlisting, communication, dispute resolution, and onboarding assistance.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "f2ef24a5-bc01-4b65-9174-9f402fd676d6",
    "category": "Employer",
    "question": "How do I communicate with candidates?",
    "answer": "Employers cannot directly communicate with interns on the Findtern platform. All interactions are handled by Findtern, and personal details are never shared to ensure privacy and safety.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "5c8b9ad0-c4a3-482f-ae1b-55ec4e66a50e",
    "category": "Employer",
    "question": " Do I need to sign an agreement with Findtern?",
    "answer": "No lengthy contracts. By creating an employer account, you agree to platform Terms & Conditions, ensuring fair usage and professionalism.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "d03b8ac2-c387-4e66-add6-91fda6ee2b88",
    "category": "Employer",
    "question": "How do I manage internship applications?",
    "answer": "Employers get a dedicated dashboard to:\nView, filter, and sort applications.\n\n\nShortlist based on skills and qualifications.\n\n\nCommunicate directly with candidates.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "f4adba76-64c7-478b-a830-6f28ebb8cd66",
    "category": "Employer",
    "question": "Can I hire full-time employees through Findtern?",
    "answer": "Yes. While Findtern focuses on internships, employers can convert interns into full-time employees after successful completion.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "8af8a764-f944-4e5a-8950-d50cb8525281",
    "category": "Employer",
    "question": "What if I face issues with a candidate?",
    "answer": "Our support team resolves disputes. If misrepresentation is found, we may deactivate the candidate’s account.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "81de020e-e6f8-4f09-94e7-76b8cbd536c1",
    "category": "Employer",
    "question": "How quickly can I hire interns?",
    "answer": "With Findtern’s smart AI-matching, employers can connect with pre-vetted candidates instantly. Many companies hire within hours instead of weeks, thanks to automated shortlisting and fast applicant review.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "3ff1fcaf-a190-4289-89b1-0edf68741648",
    "category": "Employer",
    "question": "Can I hire remote interns?",
    "answer": "Yes. Findtern supports both remote internships, hybrid internships and in-office internships, depending on your business requirements.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "cb862a33-bb8f-42f0-a1b7-ca7016fbc899",
    "category": "Employer",
    "question": "What types of interns can I hire?",
    "answer": "Employers can hire students and freshers across domains:\nMarketing & Sales\n\n\nHR & Operations\n\n\nIT & Software Development\n\n\nData Science & Analytics\n\n\nFinance & Accounting\n\n\nContent Writing & Graphic Design\n\n\nYou may hire for paid or unpaid internships depending on your company policy.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "15e89001-e987-4629-8c57-737d8991cfe1",
    "category": "Employer",
    "question": "Are the interns pre-screened?",
    "answer": "Yes. Intern profiles are verified through AI-based assessments, skill checks, and background verification, ensuring only qualified candidates appear to employers.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "5a746ff6-8838-46ea-aae4-910e41914857",
    "category": "Employer",
    "question": " How does Findtern benefit employers?",
    "answer": "Findtern helps employers hire interns efficiently by:\nSaving Time: Access only pre-screened candidates.\n\n\nHiring Faster: Get interns in days instead of weeks.\n\n\nFinding the Right Fit: Hire across domains like Marketing, Sales, Operations, IT, Data Science, Finance and more.\n\n\nStaying Flexible: Post short-term, remote, seasonal, or project-based internships.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "639c7f62-6034-4f9d-a63b-d3d3e530f0e0",
    "category": "Employer",
    "question": "What if a candidate provides false information?",
    "answer": "You can report the candidate to Findtern. If verified, the intern’s account may be suspended or deactivated.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "709512b4-0923-458a-a9e5-9a0c66acd006",
    "category": "Employer",
    "question": "Can I reject candidates after shortlisting?",
    "answer": "Yes. Employers may reject interns, but we recommend giving feedback to maintain professionalism.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "761374b5-52f2-4776-8676-6fc1a2226052",
    "category": "Employer",
    "question": "How can I contact Findtern support?",
    "answer": "You can reach us at:\n 📧 Email: communicate@findtern.in\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "dbb5dc68-6d1b-4a7f-8dfa-e66694b795e5",
    "category": "Employer",
    "question": "What happens if my company account is deactivated?",
    "answer": "If false or misleading information is found, or Terms & Conditions are violated, Findtern may suspend or deactivate your employer account without prior notice.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "42c4e34e-7a16-4c63-8560-e164e9fb17cf",
    "category": "Employer",
    "question": "Does Findtern verify candidates?",
    "answer": "Yes. Findtern verifies candidates through academic verification, skill assessments, AI-driven screening, and real-world ability tests.\nThis ensures employers receive only reliable, competent, and qualified interns while reducing irrelevant applications and interview time.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "55d4cae6-3f67-4c8f-b1b2-58aa231c6513",
    "category": "Employer",
    "question": "How do I shortlist and hire candidates on Findtern?",
    "answer": "On Findtern.in, employers can shortlist and hire interns using the platform’s smart matchmaking system, which suggests pre-vetted candidates based on your required skills and criteria.\nEmployers can filter, review profiles, scores, and qualifications, then connect via built-in messaging or schedule interviews.\nThe hiring process, along with onboarding support and documentation, is finalized on the platform-ensuring a smooth intern hiring experience.\n",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "483de78a-0f86-42cf-8ca8-72836cca8476",
    "category": "Employer",
    "question": "Can I ask candidates for their personal contact details?",
    "answer": "No. Employers are not allowed to request phone numbers, emails, or personal details directly. All communication must happen securely within the Findtern platform.",
    "sortOrder": 0,
    "isActive": true
  },
  {
    "id": "23eeadaf-ad9f-4a0a-8445-2c100d0d1e30",
    "category": "Employer",
    "question": "How do I register my company on Findtern?",
    "answer": "Click on “Sign Up as Employer” and provide your company details. Once verified, you can start posting internships on Findtern.in.\n",
    "sortOrder": 0,
    "isActive": true
  }
];

export const FAQ_ITEMS: CmsFaqItem[] = [...FAQ_INTERN, ...FAQ_EMPLOYER];
