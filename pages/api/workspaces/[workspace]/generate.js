// pages/api/workspaces/[workspace]/generate.js

const fs = require('fs');
const path = require('path');
const { HNSWLib } = require('@langchain/community/vectorstores/hnswlib');
const { AzureOpenAIEmbeddings, AzureChatOpenAI } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { PromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { createStuffDocumentsChain } = require('langchain/chains/combine_documents');
const { createRetrievalChain } = require('langchain/chains/retrieval');
import prompts from '@/lib/prompts';
console.log('Loaded prompts:', prompts);

// Define directories
const VECTOR_STORE_DIR = path.resolve(process.cwd(), 'vector_stores');
const RESULTS_DIR = path.resolve(process.cwd(), 'results');

async function handler(req, res) {
  const {
    query: { workspace },
    method,
  } = req;

  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }

  const vectorStorePath = path.join(VECTOR_STORE_DIR, workspace);
  const resultsPath = path.join(RESULTS_DIR, workspace);

  if (!fs.existsSync(vectorStorePath)) {
    return res.status(400).json({ message: 'Workspace does not exist.' });
  }

  // Ensure results directory exists
  if (!fs.existsSync(resultsPath)) {
    fs.mkdirSync(resultsPath, { recursive: true });
    console.log(`Created results directory: ${resultsPath}`);
  }

  try {
    // Initialize Embeddings
    const embeddings = new AzureOpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
      azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
    });

    // Load Vector Store
    let vectorStore;
    const vectorStoreIndexPath = path.join(vectorStorePath, 'hnswlib.index');
    if (fs.existsSync(vectorStoreIndexPath)) {
      console.log(`Loading existing vector store for workspace: ${workspace}`);
      vectorStore = await HNSWLib.load(vectorStorePath, embeddings);
    } else {
      return res.status(500).json({ message: 'Vector store not initialized.' });
    }

    // Initialize LLM
    const llm = new AzureChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0,
      maxTokens: undefined,
      maxRetries: 2,
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
    });

    // Create Retriever
    const retriever = vectorStore.asRetriever();

    // Define Custom Prompt Template
    const customTemplate = `Your task is to answer the following QUESTION using provided CONTEXT and RULES.  

QUESTION: {input}
RULES: 
Only use information from the context. 
If you are missing information or are unsure, insert a placeholder to [clarify with client]
Use EXAMPLES to determine the structure and to guide the length of the response. If no examples are provided then answer in 3 sentences or less.
{extra_rules}

CONTEXT: {context}

EXAMPLES
{examples}
`;

    // Create Combine Documents Chain
    const combineDocsChain = await createStuffDocumentsChain({
      llm: llm,
      prompt: PromptTemplate.fromTemplate(customTemplate),
      outputParser: new StringOutputParser(),
    });

    // Create Retrieval Chain
    const chain = await createRetrievalChain({
      retriever: retriever,
      combineDocsChain: combineDocsChain,
      maxDocuments: 5, // Adjust based on your needs
    });

    // Function to run RAG Chain
    const runRagChain = async (chain, question, extra_rules, examples) => {
      const response = await chain.invoke({
        input: question,
        extra_rules: extra_rules,
        examples: examples,
      });
      return response.text || response.answer || 'No answer provided.';
    };

    // Load existing results
    const existingResultsPath = path.join(resultsPath, 'results.json');
    let existingResults = [];
    if (fs.existsSync(existingResultsPath)) {
      const rawData = fs.readFileSync(existingResultsPath, 'utf-8');
      existingResults = JSON.parse(rawData);
      console.log(`Loaded existing results for workspace ${workspace}.`);
    } else {
      console.log("No existing results found. Starting fresh.");
    }

    // Process Prompts
    const newResults = [];
    for (const prompt of prompts) {
      const { section, question, extra_rules, examples } = prompt;
      const iteration_number = existingResults.filter(r => r.section === section).length + 1;
      try {
        const answer = await runRagChain(chain, question, extra_rules, examples);
        newResults.push({
          section,
          iteration_number,
          question,
          answer
        });
        console.log(`Processed section: ${section}`);
      } catch (error) {
        console.error(`Error processing section ${section}:`, error);
        newResults.push({
          section,
          iteration_number,
          question,
          answer: `Error: ${error.message}`
        });
      }
    }

    // Save Results
    const allResults = [...existingResults, ...newResults];
    fs.writeFileSync(existingResultsPath, JSON.stringify(allResults, null, 2));
    console.log(`Saved results to ${existingResultsPath}`);

    res.status(200).json({ results: newResults });
  } catch (error) {
    console.error('Error generating responses:', error);
    res.status(500).json({ message: 'Error generating responses.' });
  }
}

export default handler; // Ensures the handler is exported as default
