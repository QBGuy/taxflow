// pages/api/workspaces/index.js
import fs from 'fs';
import path from 'path';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// Define directories
const VECTOR_STORE_DIR = path.resolve(process.cwd(), 'vector_stores');
const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads');
const RESULTS_DIR = path.resolve(process.cwd(), 'results');

// Ensure the vector_stores, uploads, and results directories exist
if (!fs.existsSync(VECTOR_STORE_DIR)) {
  fs.mkdirSync(VECTOR_STORE_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // List existing workspaces
    fs.readdir(VECTOR_STORE_DIR, (err, files) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error reading vector stores.' });
      }
      // Assuming each workspace has its own directory
      const workspaces = files.filter(file => {
        return fs.lstatSync(path.join(VECTOR_STORE_DIR, file)).isDirectory();
      });
      res.status(200).json({ workspaces });
    });
  } else if (req.method === 'POST') {
    // Create a new workspace
    const { workspace } = req.body;

    if (!workspace || workspace.trim() === '') {
      return res.status(400).json({ message: 'Workspace name is required.' });
    }

    const workspacePath = path.join(VECTOR_STORE_DIR, workspace);
    const workspaceUploadPath = path.join(UPLOAD_DIR, workspace);
    const workspaceResultsPath = path.join(RESULTS_DIR, workspace);

    if (fs.existsSync(workspacePath)) {
      return res.status(400).json({ message: 'Workspace already exists.' });
    }

    try {
      // Create the workspace directory
      fs.mkdirSync(workspacePath, { recursive: true });
      console.log(`Workspace created: ${workspacePath}`);

      // Create the upload directory for the workspace
      fs.mkdirSync(workspaceUploadPath, { recursive: true });
      console.log(`Upload directory created: ${workspaceUploadPath}`);

      // Create the results directory for the workspace
      fs.mkdirSync(workspaceResultsPath, { recursive: true });
      console.log(`Results directory created: ${workspaceResultsPath}`);

      // Initialize the vector store with initial text (workspace name)
      const initialDocs = [{
        pageContent: workspace,
        metadata: {},
      }];
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const embeddings = new AzureOpenAIEmbeddings({
        azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
        azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
        azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME,
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
      });
      const splitDocs = await textSplitter.splitDocuments(initialDocs);
      const vectorStore = await HNSWLib.fromDocuments(splitDocs, embeddings);

      // Save the vector store directly in the workspace directory
      await vectorStore.save(workspacePath);
      console.log(`Vector store initialized for workspace: ${workspace}`);

      res.status(201).json({ message: 'Workspace created successfully.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error creating workspace and initializing vector store.' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
// pages/api/workspaces/index.js
