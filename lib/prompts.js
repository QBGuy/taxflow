// lib/prompts.js
const prompts = [
    {
      section: 'surcharge_tiers',
      question: "What are the Medicare Levy Surcharge tiers and thresholds?",
      extra_rules: "Return your answer in bullet points",
      examples: ""
    },
    {
      section: 'eligibility_criteria',
      question: "Explain the eligibility criteria for the government rebate.",
      extra_rules: "",
      examples: ""
    },
    {
      section: 'application_steps',
      question: "List the steps to apply for the rebate.",
      extra_rules: "Return your answer in a numbered list",
      examples: ""
    },
    {
      section: 'application_deadline',
      question: "What is the deadline for rebate applications?",
      extra_rules: "",
      examples: ""
    },
    {
      section: 'penalties_late_applications',
      question: "Are there any penalties for late rebate applications?",
      extra_rules: "",
      examples: ""
    }
  ];
  
  export default prompts;
  // lib/prompts.js
  