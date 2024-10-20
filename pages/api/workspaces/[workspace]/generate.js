// pages/api/workspaces/[workspace]/generate.js
import { listFiles, downloadFileToTemp, uploadFile, appendToDocstore, downloadFile } from '@lib/azureBlob';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { AzureOpenAIEmbeddings, AzureChatOpenAI } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import prompts from '@/lib/prompts';
import path from 'path';
import fs from 'fs';
import os from 'os';

console.log('Loaded prompts:', prompts);
console.log('------RUNNING: generate.js')
export default async function handler(req, res) {
  const {
    query: { workspace },
    method,
  } = req;

  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${method} Not Allowed`);
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
    const tempDir = path.join(os.tmpdir(), `vector_store_${workspace}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Files to download
    const filesToDownload = ['hnswlib.index', 'docstore.json', 'args.json'];
    for (const file of filesToDownload) {
      try {
        if (file === 'hnswlib.index') {
          const fileContent = await downloadFile(workspace, 'vector_store', file, true); // asBuffer=true
          const tempFilePath = path.join(tempDir, file);
          fs.writeFileSync(tempFilePath, fileContent);
          console.log(`File "${file}" downloaded to "${tempFilePath}".`);
        } else {
          const fileContent = await downloadFile(workspace, 'vector_store', file, false); // asBuffer=false
          const tempFilePath = path.join(tempDir, file);
          fs.writeFileSync(tempFilePath, fileContent);
          console.log(`File "${file}" downloaded to "${tempFilePath}".`);
        }
      } catch (error) {
        if (error.code === 'BlobNotFound' || error.statusCode === 404) {
          console.log(`File "${file}" does not exist. It will be created.`);
        } else {
          throw error;
        }
      }
    }

    // Load results.json from 'results' directory
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
      // Initialize new vector store if not exists
      console.log(`Initializing new vector store for workspace: ${workspace}`);
      const initialDocs = [{
        pageContent: workspace,
        metadata: {},
      }];
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const splitDocs = await textSplitter.splitDocuments(initialDocs);
      vectorStore = await HNSWLib.fromDocuments(splitDocs, embeddings);
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
    fs.writeFileSync(path.join(tempDir, 'results.json'), JSON.stringify(allResults, null, 2));
    console.log(`Saved results to ${path.join(tempDir, 'results.json')}`);

    // Save Vector Store
    // await vectorStore.save(tempDir);
    // console.log(`Vector store saved to "${tempDir}" for workspace "${workspace}".`);

    // // Upload updated vector store files back to Blob Storage
    // const filesToUpload = ['hnswlib.index', 'docstore.json', 'args.json'];
    // for (const file of filesToUpload) {
    //   const filePath = path.join(tempDir, file);
    //   if (fs.existsSync(filePath)) {
    //     const fileBuffer = fs.readFileSync(filePath);
    //     await uploadFile(workspace, 'vector_store', file, fileBuffer);
    //     console.log(`File "${file}" uploaded successfully.`);
    //   }
    // }

    // Upload results.json to 'results' directory
    const resultsPath = path.join(tempDir, 'results.json');
    if (fs.existsSync(resultsPath)) {
      const resultsBuffer = fs.readFileSync(resultsPath);
      await uploadFile(workspace, 'results', 'results.json', resultsBuffer);
      console.log(`File "results.json" uploaded successfully.`);
    }

    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    res.status(200).json({ results: newResults });
  } catch (error) {
    console.error('Error generating responses:', error);
    res.status(500).json({ message: 'Error generating responses.' });
  }
}
