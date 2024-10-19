// pages/api/workspaces/[workspace]/files.js

import fs from 'fs';
import path from 'path';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

const VECTOR_STORE_DIR = path.resolve(process.cwd(), 'vector_stores');
const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads');

export default async function handler(req, res) {
  const {
    query: { workspace },
    method,
  } = req;

  if (method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }

  const workspaceUploadDir = path.join(UPLOAD_DIR, workspace);

  if (!fs.existsSync(workspaceUploadDir)) {
    return res.status(400).json({ message: 'Workspace does not exist or no files uploaded.' });
  }

  const workspacePath = path.join(VECTOR_STORE_DIR, workspace);
  const vectorStorePath = workspacePath;

  let vectorStore;
  if (fs.existsSync(path.join(vectorStorePath, 'hnswlib.index'))) {
    console.log(`Loading existing vector store for workspace: ${workspace}`);
    try {
      vectorStore = await HNSWLib.load(vectorStorePath, new AzureOpenAIEmbeddings({
        azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
        azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
        azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME,
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
      }));
    } catch (error) {
      console.error(`Error loading vector store for workspace ${workspace}:`, error);
      return res.status(500).json({ message: 'Error loading vector store.' });
    }
  } else {
    console.log(`Initializing new vector store for workspace: ${workspace}`);
    try {
      const initialDocs = [{
        pageContent: workspace,
        metadata: {},
      }];
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const splitDocs = await textSplitter.splitDocuments(initialDocs);
      vectorStore = await HNSWLib.fromDocuments(splitDocs, new AzureOpenAIEmbeddings({
        azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
        azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
        azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME,
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
      }));
      await vectorStore.save(vectorStorePath);
      console.log(`Vector store initialized for workspace: ${workspace}`);
    } catch (error) {
      console.error(`Error initializing vector store for workspace ${workspace}:`, error);
      return res.status(500).json({ message: 'Error initializing vector store.' });
    }
  }

  // Read docstore.json to check loaded files
  const docstorePath = path.join(vectorStorePath, 'docstore.json');
  let processedFilesSet = new Set();

  if (fs.existsSync(docstorePath)) {
    const raw = fs.readFileSync(docstorePath, 'utf-8');
    try {
      const docstore = JSON.parse(raw);
      console.log(`Loaded docstore for workspace ${workspace}:`, Object.keys(docstore));

      // Extract unique file names from metadata.source
      docstore.forEach((docEntry) => {
        const [docNumber, doc] = docEntry;
        if (doc.metadata && doc.metadata.source) {
          const sourcePath = doc.metadata.source;
          const fileName = path.basename(sourcePath);
          processedFilesSet.add(fileName);
        }
      });
      console.log(`Processed files set for workspace ${workspace}:`, Array.from(processedFilesSet));
    } catch (error) {
      console.error(`Error parsing docstore.json for workspace ${workspace}:`, error);
      return res.status(500).json({ message: 'Error parsing docstore.' });
    }
  } else {
    console.log(`No docstore found for workspace ${workspace}.`);
  }

  // List all uploaded files
  const uploadedFiles = fs.readdirSync(workspaceUploadDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.pdf', '.doc', '.docx'].includes(ext);
  });

  console.log(`Uploaded files for workspace ${workspace}:`, uploadedFiles);

  // Determine which files need to be processed (not in processedFilesSet)
  const filesToProcess = uploadedFiles.filter(file => !processedFilesSet.has(file));

  console.log(`Files to process for workspace ${workspace}:`, filesToProcess);

  const skippedFiles = [];
  const processedFiles = [];

  for (const file of filesToProcess) {
    const filePath = path.join(workspaceUploadDir, file);
    const ext = path.extname(file).toLowerCase();

    console.log(`Processing file: ${file}`);

    if (!['.pdf', '.doc', '.docx'].includes(ext)) {
      console.log(`Unsupported file type: ${file}`);
      skippedFiles.push(file);
      continue;
    }

    let loader;
    if (ext === '.pdf') {
      loader = new PDFLoader(filePath);
    } else {
      console.log(`Unsupported file type for processing: ${file}`);
      skippedFiles.push(file);
      continue;
    }

    try {
      console.log(`Loading document: ${file}`);
      const documents = await loader.load();

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await textSplitter.splitDocuments(documents);

      console.log(`Adding documents from: ${file}`);
      await vectorStore.addDocuments(splitDocs);

      processedFiles.push(file);
      console.log(`Processed file: ${file}`);
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
      skippedFiles.push(file);
    }
  }

  if (processedFiles.length > 0) {
    try {
      await vectorStore.save(vectorStorePath);
      console.log(`Vector store updated for workspace: ${workspace}`);
    } catch (error) {
      console.error(`Error saving vector store for workspace ${workspace}:`, error);
      return res.status(500).json({ message: 'Error saving vector store.' });
    }
  }

  res.status(200).json({ files: uploadedFiles, processedFiles, skippedFiles });
}
