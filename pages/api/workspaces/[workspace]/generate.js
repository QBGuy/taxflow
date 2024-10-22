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

export const maxDuration = 60; // This function can run for a maximum of 60 seconds

// Disable body parsing for streaming
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const {
    query: { workspace },
    method,
  } = req;

  if (method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Flush the headers to establish SSE with client

  // Helper function to send SSE
  const sendSSE = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    // Attempt to flush the data
    if (res.flush) {
      res.flush();
    } else if (res.socket && res.socket.write) {
      res.socket.write('');
    }
  };

  try {
    // Initialize Embeddings
    const embeddings = new AzureOpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
      azureOpenAIApiEmbeddingsDeploymentName:
        process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME,
      azureOpenAIApiVersion:
        process.env.AZURE_OPENAI_VERSION || '2024-05-01-preview',
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
          const fileContent = await downloadFile(
            workspace,
            'vector_store',
            file,
            true
          ); // asBuffer=true
          const tempFilePath = path.join(tempDir, file);
          fs.writeFileSync(tempFilePath, fileContent);
          console.log(`File "${file}" downloaded to "${tempFilePath}".`);
        } else {
          const fileContent = await downloadFile(
            workspace,
            'vector_store',
            file,
            false
          ); // asBuffer=false
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
      const resultsContent = await downloadFile(
        workspace,
        'results',
        resultsFile,
        false
      );
      existingResults = JSON.parse(resultsContent);
      console.log(`Loaded existing results for workspace ${workspace}.`);
    } catch (error) {
      if (error.code === 'BlobNotFound' || error.statusCode === 404) {
        console.log('No existing results found. Starting fresh.');
      } else {
        console.error(`Error downloading or parsing "${resultsFile}":`, error);
        throw error;
      }
    }

    // Initialize Section-wise Counters
    const sectionCounters = prompts.reduce((acc, prompt) => {
      acc[prompt.section] = existingResults.filter(r => r.section === prompt.section).length;
      return acc;
    }, {});

    // Load Vector Store
    let vectorStore;
    const vectorStoreIndexPath = path.join(tempDir, 'hnswlib.index');
    if (fs.existsSync(vectorStoreIndexPath)) {
      console.log(`Loading existing vector store for workspace: ${workspace}`);
      vectorStore = await HNSWLib.load(tempDir, embeddings);
    } else {
      // Initialize new vector store if not exists
      console.log(`Initializing new vector store for workspace: ${workspace}`);
      const initialDocs = [
        {
          pageContent: workspace,
          metadata: {},
        },
      ];
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const splitDocs = await textSplitter.splitDocuments(initialDocs);
      vectorStore = await HNSWLib.fromDocuments(splitDocs, embeddings);
    }

    // Initialize LLM
    const llm = new AzureChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 5000,
      maxRetries: 2,
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
      azureOpenAIApiDeploymentName:
        process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_NAME,
      azureOpenAIApiVersion:
        process.env.AZURE_OPENAI_VERSION || '2024-05-01-preview',
    });

    // Create Retriever
    const retriever = vectorStore.asRetriever();

    // Define Custom Prompt Template
    const customTemplate = `Your task is to answer the following QUESTION using provided CONTEXT and RULES.  
    
      QUESTION: {input}
      RULES: 
      Return your response in nicely formatted Markdown, using headers, spacing and dot points when sensible. 
      Always use - for dot points and not other characters like •, numbers (1 2 3) or letters (a b c) unless I ask so .
      
      Primarily use information from the CONTEXT, but feel free to extend beyond the information explicitly stated if you think there is a high likelihood of it being correct (e.g. if they describe a common procedure then you can elaborate based on your own knowledge). For each instance of extension write **[check with client]**
      If you feel like you're missing important information then add a placeholder to **[ask client for XXX]** in bold.
      Use EXAMPLES to determine the structure and to guide the length of the response. However, feel free to elaborate more also. Longer is better.
      However, do NOT use any of the content from EXAMPLE_OUTPUT_1 or EXAMPLE_OUTPUT_2.
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
      maxDocuments: 5,
    });

    // Function to run RAG Chain
    const runRagChain = async (chain, question, extra_rules, examples) => {
      const response = await chain.invoke({
        input: question,
        extra_rules: extra_rules,
        examples: examples,
      });
      console.log(response.answer);
      return response.text || response.answer || 'No answer provided.';
    };

    // Process Prompts with SSE
    const newResults = [];
    for (const prompt of prompts) {
      const { section, question, extra_rules, examples } = prompt;
      sectionCounters[section] += 1;
      const iteration_number = sectionCounters[section];

      try {
        const answer = await runRagChain(chain, question, extra_rules, examples);
        const result = {
          section,
          iteration_number,
          question,
          answer,
        };
        newResults.push(result);

        // Send the result to the client via SSE
        sendSSE(result);
        console.log(`SSE sent for section: ${section}`);

        console.log(`Processed section: ${section}`);
      } catch (error) {
        console.error(`Error processing section ${section}:`, error);
        const errorResult = {
          section,
          iteration_number,
          question,
          answer: `Error: ${error.message}`,
        };
        newResults.push(errorResult);

        // Send the error to the client via SSE
        sendSSE(errorResult);
      }
    }

    // Save Results
    const allResults = [...existingResults, ...newResults];
    fs.writeFileSync(
      path.join(tempDir, 'results.json'),
      JSON.stringify(allResults, null, 2)
    );
    console.log(`Saved results to ${path.join(tempDir, 'results.json')}`);

    // Upload results.json to 'results' directory
    const resultsPath = path.join(tempDir, 'results.json');
    if (fs.existsSync(resultsPath)) {
      const resultsBuffer = fs.readFileSync(resultsPath);
      await uploadFile(workspace, 'results', 'results.json', resultsBuffer);
      console.log(`File "results.json" uploaded successfully.`);
    }

    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Indicate completion to the client
    sendSSE({ done: true });
    console.log('SSE sent: done');

    // Close the SSE connection
    res.end();
  } catch (error) {
    console.error('Error generating responses:', error);
    sendSSE({ error: 'Error generating responses.' });
    res.end();
  }
}
