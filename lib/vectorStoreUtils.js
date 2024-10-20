// lib/vectorStoreUtils.js

import { uploadFile, downloadFile } from '@lib/azureBlob';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { AzureOpenAIEmbeddings } from '@langchain/openai'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { TextLoader } from "langchain/document_loaders/fs/text";

/**
 * Initialize or load an existing vector store for a given workspace.
 * @param {string} workspace - The workspace/client identifier.
 * @returns {Object} - Contains the initialized vectorStore and the temporary directory path.
 */
export async function initializeVectorStore(workspace) {
  const tempDir = path.join(os.tmpdir(), `vector_store_${workspace}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const hnswlibIndexPath = path.join(tempDir, 'hnswlib.index');
  const docstorePath = path.join(tempDir, 'docstore.json');
  const argsPath = path.join(tempDir, 'args.json');

  // Download existing hnswlib.index if it exists
  try {
    const fileContent = await downloadFile(workspace, 'vector_store', 'hnswlib.index', true); // asBuffer=true
    fs.writeFileSync(hnswlibIndexPath, fileContent);
    console.log(`File "hnswlib.index" downloaded to "${hnswlibIndexPath}".`);
  } catch (error) {
    if (error.code !== 'BlobNotFound' && error.statusCode !== 404) { // Ignore if file doesn't exist
      throw error;
    }
  }

  // Download existing docstore.json if it exists
  try {
    const fileContent = await downloadFile(workspace, 'vector_store', 'docstore.json', false); // asBuffer=false
    fs.writeFileSync(docstorePath, fileContent);
    console.log(`File "docstore.json" downloaded to "${docstorePath}".`);
  } catch (error) {
    if (error.code !== 'BlobNotFound' && error.statusCode !== 404) { // Ignore if file doesn't exist
      throw error;
    }
  }

  // Download existing args.json if it exists
  try {
    const fileContent = await downloadFile(workspace, 'vector_store', 'args.json', false); // asBuffer=false
    fs.writeFileSync(argsPath, fileContent);
    console.log(`File "args.json" downloaded to "${argsPath}".`);
  } catch (error) {
    if (error.code !== 'BlobNotFound' && error.statusCode !== 404) { // Ignore if file doesn't exist
      throw error;
    }
  }

  let vectorStore;

  if (fs.existsSync(hnswlibIndexPath)) {
    console.log(`Loading existing vector store for workspace: ${workspace}`);
    vectorStore = await HNSWLib.load(tempDir, new AzureOpenAIEmbeddings({
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
  }

  return { vectorStore, vectorStoreTempDir: tempDir };
}

/**
 * Process and add new documents to the vector store.
 * @param {string} workspace - The workspace/client identifier.
 * @param {Array} newDocuments - Array of new document objects with fileName and fileContent.
 * @returns {Object} - Processed and skipped files information.
 */
export async function processNewFiles(workspace, newDocuments) {
  try {
    const { vectorStore, vectorStoreTempDir } = await initializeVectorStore(workspace);

    for (const doc of newDocuments) {
      const fileName = doc.fileName;
      const fileContent = doc.fileContent;
      const ext = path.extname(fileName).toLowerCase();

      console.log(`Processing document from file: ${fileName}`);

      if (!['.pdf', '.docx', '.doc', '.txt'].includes(ext)) {
        console.log(`Unsupported file type for processing: ${fileName}`);
        continue;
      }

      try {
        // Write file content to a temporary file
        const tempFilePath = path.join(vectorStoreTempDir, fileName);
        fs.writeFileSync(tempFilePath, fileContent);
        console.log(`File "${fileName}" written to "${tempFilePath}".`);

        let loader;
        if (ext === '.pdf') {
          loader = new PDFLoader(tempFilePath);
        } else if (ext === '.docx' || ext === '.doc') {
          loader = new DocxLoader(tempFilePath);
        } else if (ext === '.txt') {
          loader = new TextLoader(tempFilePath);
        } else {
          console.log(`Unsupported file type for loader: ${fileName}`);
          fs.unlinkSync(tempFilePath);
          continue;
        }

        console.log(`Loading document: ${fileName}`);
        const documents = await loader.load();

        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        });

        const splitDocs = await textSplitter.splitDocuments(documents);

        // Prepare new document metadata with source file name
        const preparedDocs = splitDocs.map(doc => ({
          pageContent: doc.pageContent,
          metadata: {
            source: `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${process.env.AZURE_STORAGE_CONTAINER_NAME}/${workspace}/uploads/${fileName}`,
            originalFileName: fileName, // Add original file name to metadata
          },
        }));

        console.log(`Adding documents from: ${fileName}`);
        await vectorStore.addDocuments(preparedDocs);

        console.log(`Processed file: ${fileName}`);

        // Clean up the temporary file
        fs.unlinkSync(tempFilePath);
      } catch (error) {
        console.error(`Error processing file "${fileName}":`, error);
      }
    }

    // Save the updated vector store to temporary directory
    await vectorStore.save(vectorStoreTempDir);
    console.log(`Vector store updated for workspace: ${workspace}`);

    // Upload updated vector store files back to Blob Storage
    const filesToUpload = ['hnswlib.index', 'docstore.json', 'args.json'];
    for (const file of filesToUpload) {
      const filePath = path.join(vectorStoreTempDir, file);
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        await uploadFile(workspace, 'vector_store', file, fileBuffer);
        console.log(`File "${file}" uploaded successfully.`);
      }
    }

    // Upload results.json to 'results' directory
    const resultsPath = path.join(vectorStoreTempDir, 'results.json');
    if (fs.existsSync(resultsPath)) {
      const resultsBuffer = fs.readFileSync(resultsPath);
      await uploadFile(workspace, 'results', 'results.json', resultsBuffer);
      console.log(`File "results.json" uploaded successfully.`);
    }

    // Clean up temporary directory
    fs.rmSync(vectorStoreTempDir, { recursive: true, force: true });

    return { success: true };
  } catch (error) {
    console.error('Error processing new files:', error);
    throw error;
  }
}
