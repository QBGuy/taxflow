// pages/api/workspaces/[workspace]/modify.js

import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { AzureOpenAIEmbeddings, AzureChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import prompts from '@/lib/prompts';
import { downloadFile, uploadFile } from '@lib/azureBlob';
import fs from 'fs';
import path from 'path';
import os from 'os';
console.log('Loaded prompts:', prompts);
console.log('------RUNNING: modify.js')
export default async function handler(req, res) {
  const {
    query: { workspace },
    method,
  } = req;

  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }

  const { sections, extraInstructions } = req.body;

  if (!sections || !Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ message: 'No sections provided for modification.' });
  }

  if (!extraInstructions || typeof extraInstructions !== 'string') {
    return res.status(400).json({ message: 'Extra instructions are required.' });
  }

  try {
    // Initialize Embeddings
    const embeddings = new AzureOpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
      azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
    });

    // Create temporary directory
    const tempDir = path.join(os.tmpdir(), `modify_${workspace}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Download vector store files
    const vectorStoreFiles = ['hnswlib.index', 'docstore.json', 'args.json'];
    for (const file of vectorStoreFiles) {
      try {
        if (file === 'hnswlib.index') {
          const fileBuffer = await downloadFile(workspace, 'vector_store', file, true);
          fs.writeFileSync(path.join(tempDir, file), fileBuffer);
          console.log(`File "${file}" downloaded to "${path.join(tempDir, file)}".`);
        } else {
          const fileContent = await downloadFile(workspace, 'vector_store', file, false);
          fs.writeFileSync(path.join(tempDir, file), fileContent);
          console.log(`File "${file}" downloaded to "${path.join(tempDir, file)}".`);
        }
      } catch (error) {
        if (error.code === 'BlobNotFound' || error.statusCode === 404) {
          console.log(`File "${file}" does not exist. It will be created.`);
        } else {
          throw error;
        }
      }
    }

    // Download results.json from 'results' directory
    let existingResults = [];
    const resultsFile = 'results.json';
    try {
      const resultsContent = await downloadFile(workspace, 'results', resultsFile, false);
      existingResults = JSON.parse(resultsContent);
      console.log(`Loaded existing results for workspace ${workspace}.`);
    } catch (error) {
      if (error.code === 'BlobNotFound' || error.statusCode === 404) {
        console.log("No existing results found. Starting fresh.");
      } else {
        console.error(`Error downloading or parsing "${resultsFile}":`, error);
        throw error;
      }
    }

    // Load Vector Store
    let vectorStore;
    const vectorStoreIndexPath = path.join(tempDir, 'hnswlib.index');
    if (fs.existsSync(vectorStoreIndexPath)) {
      console.log(`Loading existing vector store for workspace: ${workspace}`);
      vectorStore = await HNSWLib.load(tempDir, embeddings);
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

    // Define Custom Prompt Template with appended extra instructions
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

Modify BASE_RESPONSE with the following additional INSTRUCTIONS 
INSTRUCTIONS: {extra_instructions}
BASE_RESPONSE: {base_response}
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
    const runRagChain = async (chain, question, extra_rules, extra_instructions, base_response) => {
      const response = await chain.invoke({
        input: question,
        extra_rules: extra_rules,
        examples: prompts.examples || '', // Assuming examples are loaded from prompts.js
        extra_instructions: extra_instructions,
        base_response: base_response || '',
      });

      return response.text || response.answer || 'No answer provided.';
    };

    // Process Modifications
    const modifiedResults = [];

    for (const section of sections) {
      // Find the latest result for the section
      const sectionResults = existingResults.filter(r => r.section === section);
      if (sectionResults.length === 0) {
        console.log(`No existing results found for section: ${section}`);
        continue;
      }
      const latestResult = sectionResults.reduce((prev, current) => {
        return (prev.iteration_number > current.iteration_number) ? prev : current;
      });

      const modifiedExtraRules = `${latestResult.extra_rules || ''}\nModify BASE_RESPONSE with the following additional INSTRUCTIONS 
INSTRUCTIONS: ${extraInstructions}
BASE_RESPONSE: ${latestResult.answer}`;

      // Run RAG Chain with modified extra_rules
      let base_response = latestResult.answer;
      const answer = await runRagChain(chain, latestResult.question, modifiedExtraRules, extraInstructions, base_response);

      // Create new result
      const newResult = {
        section,
        iteration_number: latestResult.iteration_number + 1,
        question: latestResult.question,
        answer,
      };

      modifiedResults.push(newResult);
      console.log(`Processed section: ${section}`);
    }

    // Save modified results
    const allResults = [...existingResults, ...modifiedResults];
    const resultsContent = JSON.stringify(allResults, null, 2);
    try {
      await uploadFile(workspace, 'results', 'results.json', Buffer.from(resultsContent));
      console.log(`Uploaded modified results to "results.json" in 'results' directory.`);
    } catch (error) {
      console.error(`Error uploading modified results.json:`, error);
      throw error;
    }

    res.status(200).json({ modifiedResults });
  } catch (error) {
    console.error('Error generating modifications:', error);
    res.status(500).json({ message: 'Error generating modifications.' });
  }
}
