// lib/vectorStoreUtils.js

import fs from 'fs';
import path from 'path';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const VECTOR_STORE_DIR = path.resolve(process.cwd(), 'vector_stores');

export async function initializeVectorStore(workspace) {
  const workspacePath = path.join(VECTOR_STORE_DIR, workspace);
  const vectorStorePath = workspacePath;

  let vectorStore;
  if (fs.existsSync(path.join(vectorStorePath, 'hnswlib.index'))) {
    console.log(`Loading existing vector store for workspace: ${workspace}`);
    vectorStore = await HNSWLib.load(vectorStorePath, new AzureOpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
      azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
    }));
  } else {
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
    vectorStore = await HNSWLib.fromDocuments(splitDocs, new AzureOpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
      azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
    }));
    await vectorStore.save(vectorStorePath);
    console.log(`Vector store initialized for workspace: ${workspace}`);
  }

  return vectorStore;
}

export async function processFiles(workspace, filesToProcess) {
  const workspacePath = path.join(VECTOR_STORE_DIR, workspace);
  const vectorStorePath = workspacePath;
  const vectorStore = await initializeVectorStore(workspace);

  const docstorePath = path.join(vectorStorePath, 'docstore.json');
  let processedFilesSet = new Set();

  if (fs.existsSync(docstorePath)) {
    const raw = fs.readFileSync(docstorePath, 'utf-8');
    try {
      const docstore = JSON.parse(raw);
      console.log(`Loaded docstore for workspace ${workspace}:`, Object.keys(docstore));
      // Extract unique file names from metadata.source
      docstore.forEach((doc, docNumber) => {
        if (doc.metadata && doc.metadata.source) {
          const sourcePath = doc.metadata.source;
          const fileName = path.basename(sourcePath);
          processedFilesSet.add(fileName);
        }
      });
    } catch (error) {
      console.error(`Error parsing docstore.json for workspace ${workspace}:`, error);
      throw new Error('Error parsing docstore.');
    }
  } else {
    console.log(`No docstore found for workspace ${workspace}.`);
  }

  const skippedFiles = [];
  const processedFiles = [];

  for (const file of filesToProcess) {
    const originalName = file;
    const filePath = path.join(process.cwd(), 'public', 'uploads', workspace, originalName);
    const ext = path.extname(originalName).toLowerCase();

    console.log(`Processing file: ${originalName}`);

    // Check if the file has already been processed
    if (processedFilesSet.has(originalName)) {
      console.log(`File already processed: ${originalName}`);
      skippedFiles.push(originalName);
      continue;
    }

    // Only process supported file types
    if (!['.pdf', '.doc', '.docx'].includes(ext)) {
      console.log(`Unsupported file type: ${originalName}`);
      skippedFiles.push(originalName);
      continue;
    }

    let loader;
    if (ext === '.pdf') {
      loader = new PDFLoader(filePath);
    } else {
      console.log(`Unsupported file type for processing: ${originalName}`);
      skippedFiles.push(originalName);
      continue;
    }

    try {
      console.log(`Loading document: ${originalName}`);
      const documents = await loader.load();

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await textSplitter.splitDocuments(documents);

      console.log(`Adding documents from: ${originalName}`);
      await vectorStore.addDocuments(splitDocs);

      processedFiles.push(originalName);
      console.log(`Processed file: ${originalName}`);
    } catch (error) {
      console.error(`Error processing file ${originalName}:`, error);
      skippedFiles.push(originalName);
    }
  }

  if (processedFiles.length > 0) {
    try {
      await vectorStore.save(vectorStorePath);
      console.log(`Vector store updated for workspace: ${workspace}`);
    } catch (error) {
      console.error(`Error saving vector store for workspace ${workspace}:`, error);
      throw new Error('Error saving vector store.');
    }
  }

  return { processedFiles, skippedFiles };
}
