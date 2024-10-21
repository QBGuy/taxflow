// lib/prompts.js
const prompts = [
    {
      section: 'Project Objective',
      question: "Describe the Project Objective",
      extra_rules: "Return two paragraphs",
      examples: 
      `
      EXAMPLE_OUTPUT_1
      # Project Objective
      A cosmetics company provides a range of skin care products through combining the latest advancements in cosmetics and pharmaceuticals in the formulation of proprietary products. In this project, the company intends to develop novel formulae aimed at improving skin health and hydration.  
      Specifically, the company aims to develop 52 novel chemical formulas by experimenting with various ratios and combinations of active and excipient ingredients that are each designed to achieve their intended purpose. Technical objectives include: 
      -	Experimental combination of chemicals to achieve optimal pH, viscosity and dissolution in the creation of novel skin care products. 
      -	Experimentation with methodologies to enhance the long term stability of products, including the chemical addition of preservatives and stabilising agents, in addition to testing different packaging methodologies to achieve zero microbial growth. 

      EXAMPLE_OUTPUT_2
      # Project Objective
      A financial services company is a broker-facing firm offering loans (e.g., chattel mortgages and novated leases) to customers. These loans include an inherent risk that an applicant will not be able to repay the loan, which can result in arrears and subsequent financial losses. As such, this requires careful consideration of all variables related to these loan applications, including the type and value of collateral as well as repayment dates and amounts. However, this process is highly manual and time-consuming. 
      Through this R&D activity, the company seeks to develop a novel decisioning engine capable of systematically parsing through the data of a given loan application and classifying it into a streamlined (low risk) or a full financial analysis pathway (high risk). The intention is for this solution to reduce the time taken to assess a loan application and increase the accuracy of decisions through the removal of human error.
      `
    },
    {
      section: 'Context, Knowledge Gaps and Hypothesis',
      question: "What are the Context, Technical Knowledge Gaps and Hypothesis?",
      extra_rules: "Produce an detailed, long report using headings for each, with elaboration (and possible dot points) for each section. Use as much information as you can.",
      examples: 
      `
      EXAMPLE_OUTPUT_1
      # Context  
      A cosmetics company was founded with the aim of offering a diverse range of skin care products using various chemical formulations consisting of excipient base and active ingredients. The company sought to combine different volumes and combinations of these ingredients to develop products with specific functional properties such as tightening lax pores, improving uneven skin tones, and moisturizing the skin. However, incorrect combinations of these constituents can cause deviations from the intended pH range, solubility issues, and undesired consistency/texture. 
      
      # Technical Knowledge Gaps
      Specific technical knowledge gaps included: 
      -	Grade of hyaluronic acid (HA): The molecular weight (MW) of HA affects its behavior on the skin. Low MW HA penetrates deeper into the skin, creating a moisturizing barrier, while high MW HA stays on the skin surface. Determining the ideal combination and MW requires experimentation. 
      -	Optimal oil-soluble active selection: While the literature identifies that oil-soluble actives have calming effects on sensitive skin, it does not explore the choice between oil-soluble actives for reducing irritation and inflammation. The company notes that individual actives are supplier-tested for skin irritation; however, their effectiveness is influenced by other components in the formulation, requiring experimentation. 
      -	Product consistency: The literature identifies that water-soluble ingredients such as pyrrolidine carboxylic acids (PCA) are effective at attracting water to the skin. It does not identify which PCAs (sodium, magnesium, zinc) can be combined to achieve a stable and homogeneous texture. For example, cream hydrators require a thicker consistency, while serums require a lighter, more aqueous consistency. 
      -	Combination of alpha and beta hydroxy acids (AHA, BHA): Azelaic acid can be used to achieve an optimal pH of 4.5-5.5; however, its use is restricted in over-the-counter products in Australia. Thus, the company had to experiment with the combination of other hydroxy acids to achieve the intended pH range. 
      
      # Hypothesis
      Novel combinations and ratios of chemical ingredients will achieve predefined objectives for pH range, solubility (in water, alcohol, or oil), and consistency. Below is a sample of hypotheses tested in the 2024 financial year: 
      - Formulation with alpha hydroxy acids (AHA) and beta hydroxy acids (BHA) will achieve a pH range of 4.5-5.5 in a Multi-Active & BHA Serum.  
      - Formulation with hyaluronic acids (HA) with molecular weights (MW) between 1.8 to 2.5 (i.e., sodium hyaluronate) will provide optimal consistency in a gel cream hydrator.  
      - The combination of water (e.g., Betaine, pyrrolidine carboxylic acids (PCA)), oil (e.g., clear/bright Oleoactif, SymRelief100), and alcohol (e.g., Jojoba Ester) soluble actives will achieve a stable and homogeneous texture in a blemish control cream.  
      - Combination of Arbutin, B3, and hydrolyzed yeast extract will achieve a pH of 5 in a serum.     

      EXAMPLE_OUTPUT_2
      # Context 
      Security questionnaires (SQs) are used to determine the cybersecurity posture of prospective vendors to an organization. They pose a set of questions and capture answers in various formats (binary, multiple choice, free form) pertaining to a vendor’s cybersecurity/vulnerability protocols. Naturally, this manual process is onerous and time-consuming with workflow inefficiencies between the organization and the vendor. 
      The current system uses a text-matching mechanism that allows a vendor to automatically prefill their responses based on keywords. However, it cannot extract data from external documents or consider the semantic/contextual nuance of keywords in a specified field. In this core activity, the company intends to experimentally develop a bespoke language model engineered with novel algorithms, vectors, and prompt engineering techniques. If successful, it promises intelligent automation of the SQ process by leveraging raw question and answer (Q&A) based external documents to produce source-driven responses that are factually, contextually, and semantically relevant to a vendor use case. 
      
      # Technical Knowledge Gap 
      It is noted that nascent models of the time possessed token limitations (~4000 tokens) and plain-text output, thereby restricting their contextual window and stipulating a vector embedding approach to abstract content into a machine-readable format. This in turn has engendered knowledge gaps that could not be readily determined. 
      Firstly, it is inherently challenging to ingest long contextual sequences with a small token limit. SQs and Q&A documents are detailed/lengthy data sources that require truncated parsing, however, this disrupts contextual flow across chunks, increases the difficulty of crafting concise yet effective prompts (to elicit the desired response), and ultimately degrades output quality/coherence. 
      Language models also possess inherent stochasticity in generated output due to their probabilistic nature. As the same prompt can lead to varied outputs, a trade-off persists in the precise design variables/parameters (temperature/sampling of the model) underlying the prompting techniques – where more randomness can lead to inconsistent tone but too little can lead to generalized responses that fail to capture the underlying semantic/contextual properties of the prompt. 
      For example, multi-part questions feature a dependent string of prompts that build upon prior answers. In such instances, the model is prone to both fragmentation (leading to disjointed contextual representations of the relationships between Q&A) and stochastic drift (a subtle but gradual deviation from the original reasoning at each truncation point) resulting in a cascade of erroneous outputs. These errors propagate to the encoded vectors and induce misalignment in the embedding space – causing vectors that should be semantically/contextually aligned to instead be represented as distant (impacting the matching of paired Q&As and the accuracy of the model). As such, a systematic progression of work will be necessary to resolve these extant uncertainties. 
      
      # Hypothesis 
      The company hypothesizes that novel algorithms, vector embeddings, partitioning, and prompt engineering techniques underpinning a bespoke language model will provide automated, robust, and accurate vendor SQ responses through the following outcomes: 
      -	Custom algorithms and logic will ingest and extract raw Q&A tabular source data (XLSX, CSV) into a normalized state. 
      -	Vector embeddings will abstract SQ and source data questions as objects with encoded properties in a high-dimensional space to match paired questions based on the calculated numeric values between vectors. 
      -	Plain-text output generated from prompt-engineered queries will be parsed into tokens and vectorized for paired answer matching. Then intelligently map generated answers across the variable data fields with encoded factual, contextual, and semantic curation for each response. 

      `
    },
    {
      section: "New Knowledge Produced",
      question: "Describe what new knowledge the R&D activity intended to produce?",
      extra_rules: "Return 2-3 paragraphs",
      examples: 
      `
      EXAMPLE_OUTPUT_1 
      # New Knowledge Produced
      Existing literature lacks insights into the exact combination and ratio of base and active ingredients needed to achieve optimal pH range, solubility, and consistency across intended applications. The specific formulations necessary to attain desired characteristics remain elusive, particularly given the numerous potential combinations and proportions of ingredients that must be explored to formulate the company's intended solutions. 
      Therefore, the company sought to produce new knowledge in the form of the precise combinations and ratios of chemical ingredients to meet predefined benchmarks for product pH, solubility, and consistency. This will ultimately allow each product to have enhanced performance when targeting particular skin conditions and types. Specifically, the efficacy of active ingredient combinations (HA’s, AHA’s, BHA’s, etc.) will be experimentally determined until optimal combinations are found for stable and homogeneous products. 
      
      EXAMPLE_OUTPUT_2 
      # New Knowledge Produced
      New knowledge is sought in the form of a custom language model designed to effectively ingest variable Q&A tabulated data to provide accurate, automated, and contextually intelligent vendor responses in SQs. 
      More specifically, new technical insights will be generated relating to the precise design variables, algorithms, logic rules, vector embeddings, partitioning, and prompt engineering techniques to a) extract and encode disparate vendor-constructed questions and answers into vectored values, b) capture contextual/semantic intent whilst retaining factual accuracy, and c) seamlessly map generated responses to requisite fields with evidence of source. 
      This differs from existing SQ procedures which are largely manual (and therefore laborious, time-consuming, and prone to human error) or semi-automated with prevailing limitations (such as requiring exact text match or failing to consider the underlying nuances of a keyword in specified use cases). 

      `
    },
    {
      section: "Sources and Discoveries",
      question: "Explain what sources were investigated, what information was found, and why a competent professional could not have known or determined the outcome in advance",
      extra_rules: "Return 2-3 paragraphs",
      examples: 
      `
      EXAMPLE_OUTPUT_1 
      # Sources and Discoveries
      The company conducted an extensive review of the existing literature, such as XYZ.  
      The literature identifies that specific pH ranges, solubilities, and consistencies are necessary in reducing skin irritation and enhancing hydration. However, the literature lacks insight into the exact combination and ratio of base and active ingredients needed to achieve this, as ingredients are extremely sensitive and susceptible to chemical compound reactions resulting from reformulations. For example, while it is known that water-soluble ingredients such as pyrrolidine carboxylic acids (PCA) are effective at attracting water to the skin, the research does not identify which PCAs (sodium, magnesium, zinc) could be combined to achieve a stable and homogeneous texture. From the research, the company determined that each compound is fundamentally different at a molecular level and highly sensitive to the slightest change in formulation, and therefore the specific constituents necessary to attain desired characteristics were unknown from the outset. 
 
      EXAMPLE_OUTPUT_2 
      # Sources and Discoveries
      The company investigated extant academic literature including XYZ. Despite these searches, the company was unable to determine if the proposed solution could perfectly extract variable vendor-defined data, accurately match the embedded Q&As to the SQ in a vector space, and automatically map the responses to the target SQ fields. As longer sequences are truncated to fit within token limits, it amplifies the disruption to contextual continuity and results in fragmentation of the underlying data relationships encoded in the source data. When coupled with the intrinsic stochasticity in generated output to a prompt, it is uncertain if the embedded vectors accurately represent the factual, semantic, and contextual properties between Q&As and thus, whether the automated responses sufficiently capture vendor intent. 

      `
    },
    {
      section: "Experimental Procedure",
      question: "Describe the experimental procedure in detail",
      extra_rules: `
      Initially provide a brief overview of the experiment and how it tests the hypothesis 
      Then describe the independent and dependent variables,  
      Then detail the step-by-step experimental procedure. 
      You can use 1, 2, 3 bullets for the steps, but use dot points for the sub-points.
      `,
      examples: 
      `
      EXAMPLE_OUTPUT_1
      # Experimental Procedure
      The company intends to systematically vary the following independent variables during experimentation: 
      -	Test scenario: Refers to the underlying construction, form, and data quality of the vendor-supplied Q&A tabulated data and the associated prompt engineering techniques to decompose user and contextual intent. 
      -	Model design and architecture: Refers to the programming of the custom algorithms and logic rules to ingest, parse, and extract source data and the vector embeddings to encode/match vendor source data to generated outputs mapped across a given SQ form. 
      -	Model database: Refers to the programming of the underlying database structure, logic, and partitions such that the relevant vendor data is hierarchically stored and allocated to the correct user. 
      The existing proprietary text-matching system will be utilized as the control variable during experimentation to benchmark the performance of the hypothesized solution. 
      
      The following experimental procedure was conducted to test the hypothesis: 
      1.	Perform background research and expert consultations to determine the existing AI applications in third-party vendor risk assessment SQ completion. 
      2.	Design algorithms to ingest raw question and answer vendor data from XLSX and CSV (i.e., spreadsheet-type data formats). Further, develop the logic rules to: 
    	  - Parse and extract required metadata fields from the raw data. 
        -	Handle conflicting, duplicate, or omitted data entries. 
        -	Clean the disparate data structures/formats into a normalized state for subsequent processing. 
      3.	Develop and train the prototype language model. More specifically: 
        -	Specify a model architecture, configure the parameters, test prompts/queries, and set the model output rules to mitigate the risk of hallucinations. 
      4.	Design the underlying vector embeddings to convert SQ and vendor-provided questions into high-dimensional vectors. Ensure the factual, contextual, and semantic properties of each question are captured within the embeddings. Additionally, develop the: 
        -	Algorithms (e.g., cosine similarity) to calculate the similarity of two given vectors. 
        -	Database hierarchy and partitions to house SQ and vendor-paired data. 
        -	Parsing and tokenization criteria to process plain-text model output into vectorized responses that are aligned with vectorized SQ questions. 
      5.	Conduct model training using test vendor data. Ensure the test scenarios are diverse and varied in quantity (e.g., number of questions/answers from multiple sheets and documents), quality (e.g., presence of duplicates, omitted, or conflicting information), and construction (e.g., level of complexity and clarity from the constructed questions/answers). 
      6.	Observe, record, and evaluate results against the control variable and measured dependent metrics. Where these benchmarks are not met, conduct a root-cause, event tree, or failure analysis to identify and resolve the issues systematically. Repeat training and draw conclusions. 
      7.	Based on the above results, systematically vary the independent variables. Then, repeat Steps 1-6 until the hypothesis has been proven or disproven. 
      
      EXAMPLE_OUTPUT_2 
      # Experimental Procedure
      Testing this hypothesis involves a systematic progression of work and experimentation to be conducted across a minimum number of experiments required to establish statistically significant results. The hypothesis is tested by comparing the results in terms of chemical stability, consistency, and texture against pre-determined benchmarks to test whether the novel formulations can achieve their specific function. 
      
      Examples of Independent Variables include: 
      -	Combination/ratio and concentrations of alpha hydroxy acids (AHA) and beta hydroxy acids (BHA) 
      -	Molecular weight (MW) of hyaluronic acid (HA) used 
      -	Solubility of active ingredients used (in water, oil, and alcohol) 
      
      Dependent Variables include: 
      -	pH 
      -	Viscosity 
      -	Consistency 
      -	Dissolution of solute in solvent 
      
      Experimental Procedure: 
      1.	Define the specifically hypothesized chemical components, ratios, and concentrations of active and excipient ingredients in achieving the pH, solubility, and consistency in desired solutions, including: 
        - Bakuchiol & B3 Serum 
        -	Multi-Active & BHA Serum (including combinations of Lactic Acid, Succinic Acid, Potassium Azeloyl Diglycinate, Salicylic Acid) 
        -	Arbutin & B3 Serum 
        - Gel Cream Hydrator 
        -	Blemish Control Cream 
        -	Gentle Antioxidant Cleanser 
        -	Smart Serum 
        -	Firming Neck Serum 
        -	Age Defiance Serum 
        -	Lux Cleansing Oil 
        -	Hydration Cream Mask 
      2.	Batch testing: Conduct sample mixing by chemically mixing the above hypothesized formulas for the purposes of testing across the product range. 
      3.	Use a texture analyzer to measure the firmness and consistency of each formulation. Record the texture parameters. 
      4.	Measure the pH of each formulation using a calibrated pH meter. Record the values. 
      5.	Perform accelerated stability testing by subjecting the formulas to heat conditions in a heat oven in excess of room temperature to uncover potential instabilities in a shorter amount of time. This involves inspecting the formulation to ascertain the physical profile of the formulation (e.g., formulation separation leading to oil on top, water seeping, etc.). Testing the formulas at 40°C for one month is the equivalent of testing for a year under normal conditions. 
      6.	Where any of the above experimental steps did not result in the pre-determined benchmarks, new hypotheses are derived with a variation of ingredient quantities in the formulation until the hypothesis is proven true. 
      7.	Allergy testing, panel testing, and user feedback. 
      8.	Conduct scalability testing by trialing the production of the formulations on a larger scale, ensuring that the chemical ratios and concentrations provide the same output when mixed in large proportions. 

      `
    },
    {
      section: "Results Evaluation",
      question: "Describe how the client evaluated (or plans to evaluate) the results from the experiment.",
      extra_rules: `
      Provide an initial overview 
      Then describe how the dependent variables will be evaluated 
      Then describe a sample of key observations. 
      Return 3-4 paragraphs`,
      examples: 
      `
      EXAMPLE_OUTPUT_1 
      # Results Evaluation
      The company conducted an extensive review of the existing literature, such as XYZ.  
      The literature identifies that specific pH ranges, solubilities, and consistencies are necessary in reducing skin irritation and enhancing hydration. However, the literature lacks insight into the exact combination and ratio of base and active ingredients needed to achieve this, as ingredients are extremely sensitive and susceptible to chemical compound reactions resulting from reformulations. For example, while it is known that water-soluble ingredients such as pyrrolidine carboxylic acids (PCA) are effective at attracting water to the skin, the research does not identify which PCAs (sodium, magnesium, zinc) could be combined to achieve a stable and homogeneous texture. From the research, the company determined that each compound is fundamentally different at a molecular level and highly sensitive to the slightest change in formulation, and therefore the specific constituents necessary to attain desired characteristics were unknown from the outset. 
 
      EXAMPLE_OUTPUT_2 
      # Results Evaluation
      The company investigated extant academic literature including XYZ. Despite these searches, the company was unable to determine if the proposed solution could perfectly extract variable vendor-defined data, accurately match the embedded Q&As to the SQ in a vector space, and automatically map the responses to the target SQ fields. As longer sequences are truncated to fit within token limits, it amplifies the disruption to contextual continuity and results in fragmentation of the underlying data relationships encoded in the source data. When coupled with the intrinsic stochasticity in generated output to a prompt, it is uncertain if the embedded vectors accurately represent the factual, semantic, and contextual properties between Q&As and thus, whether the automated responses sufficiently capture vendor intent. 
      `
    }
    
  ];
  
  export default prompts;
  // lib/prompts.js
  