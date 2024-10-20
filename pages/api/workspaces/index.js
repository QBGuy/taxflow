// pages/api/workspaces/index.js
import { listWorkspaces, checkBlobExists, uploadFile } from '../../../lib/azureBlob';
import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import path from 'path';
import fs from 'fs';
import os from 'os';

console.log('------RUNNING: index.js.js')

// No need to disable bodyParser since we're handling JSON

export default async function handler(req, res) {
  const { method } = req;

  if (method === 'GET') {
    try {
      // List all workspaces using the new listWorkspaces function
      const workspaces = await listWorkspaces();
      res.status(200).json({ workspaces });
    } catch (error) {
      console.error('Error listing workspaces:', error);
      res.status(500).json({ message: 'Error listing workspaces.' });
    }
  } else if (method === 'POST') {
    try {
      const { workspace } = req.body;

      if (!workspace || workspace.trim() === '') {
        return res.status(400).json({ message: 'Workspace name is required.' });
      }

      // Check if workspace already exists by checking if 'docstore.json' exists
      const docstorePath = 'docstore.json'; // Within {workspace}/
      const docstoreExists = await checkBlobExists(workspace, 'vector_store', docstorePath);

      if (docstoreExists) {
        return res.status(400).json({ message: 'Workspace already exists.' });
      }

      // Initialize the vector store with initial text (workspace name)
      const initialDocs = [{
        pageContent: workspace,
        metadata: {},
      }];

      // Define a text splitter
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      // Initialize embeddings with corrected environment variable names
      const embeddings = new AzureOpenAIEmbeddings({
        azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
        azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
        azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME, // Corrected
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview", // Corrected
      });

      // Split documents
      const splitDocs = await textSplitter.splitDocuments(initialDocs);

      // Initialize vector store
      const vectorStore = await HNSWLib.fromDocuments(splitDocs, embeddings);

      // Save vector store locally temporarily
      const tempDir = path.join(os.tmpdir(), `vector_store_${workspace}`);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      await vectorStore.save(tempDir);

      // Upload 'hnswlib.index', 'docstore.json', and 'args.json' to Azure Blob Storage under '{workspace}/'
      const hnswlibIndexPath = path.join(tempDir, 'hnswlib.index');
      const docstorePathLocal = path.join(tempDir, 'docstore.json');
      const argsPathLocal = path.join(tempDir, 'args.json'); // New

      const hnswlibBuffer = fs.readFileSync(hnswlibIndexPath);
      const docstoreBuffer = fs.readFileSync(docstorePathLocal);
      const argsBuffer = fs.readFileSync(argsPathLocal);

      await uploadFile(workspace, 'vector_store', 'hnswlib.index', hnswlibBuffer);
      await uploadFile(workspace, 'vector_store', 'docstore.json', docstoreBuffer);
      await uploadFile(workspace, 'vector_store', 'args.json', argsBuffer); // New

      // Clean up temporary directory
      fs.rmSync(tempDir, { recursive: true, force: true });

      console.log(`Workspace "${workspace}" created successfully.`);
      res.status(201).json({ message: 'Workspace created successfully.' });
    } catch (error) {
      console.error('Error creating workspace:', error);
      res.status(500).json({ message: 'Error creating workspace and initializing vector store.' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
}
