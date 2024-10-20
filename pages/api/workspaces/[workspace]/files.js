// pages/api/workspaces/[workspace]/files.js

import { listFiles, downloadFileToTemp, uploadFile, appendToDocstore, downloadFile } from '../../../../lib/azureBlob';
import { processNewFiles } from '../../../../lib/vectorStoreUtils';
import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

console.log('------RUNNING: files.js')

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

  try {
    const uploadedFiles = await listFiles(workspace, 'uploads');
    console.log(`Uploaded files for workspace "${workspace}":`, uploadedFiles);

    let docstore = [];
    try {
      const docstoreContent = await downloadFile(workspace, 'vector_store', 'docstore.json', false);
      docstore = JSON.parse(docstoreContent);
      // console.log(`Loaded docstore for workspace "${workspace}":`, docstore);
    } catch (error) {
      if (error.code === 'BlobNotFound' || error.statusCode === 404) {
        console.log(`No docstore.json found for workspace "${workspace}". Initializing a new one.`);
        docstore = [];
      } else {
        throw error;
      }
    }
    
    const processedFilesSet = new Set();
    console.log("Checking processed files")
    docstore.forEach((docEntry) => {
      
      if (docEntry[1] && docEntry[1].metadata && docEntry[1].metadata.originalFileName) {
        // console.log(`Source for document ${docEntry[0]}:`, docEntry[1].metadata.originalFileName);
        const fileName = docEntry[1].metadata.originalFileName;
        processedFilesSet.add(fileName);
      }
    })
    
    ;

    console.log(`Processed files set for workspace "${workspace}":`, Array.from(processedFilesSet));
    const filesToProcess = uploadedFiles.filter(file => !processedFilesSet.has(file));
    console.log(`Files to process for workspace "${workspace}":`, filesToProcess);

    const skippedFiles = [];
    const processedFiles = [];
    const processDocuments = [];

    for (const file of filesToProcess) {
      const ext = path.extname(file).toLowerCase();
      console.log(`Processing file: ${file}`);

      if (!['.pdf', '.docx', '.doc', '.txt'].includes(ext)) {
        console.log(`Unsupported file type: ${file}`);
        skippedFiles.push(file);
        continue;
      }

      try {
        const tempFilePath = await downloadFileToTemp(workspace, 'uploads', file);
        let loader;
        if (ext === '.pdf') {
          loader = new PDFLoader(tempFilePath);
        } else {
          console.log(`Unsupported file type for processing: ${file}`);
          skippedFiles.push(file);
          fs.unlinkSync(tempFilePath);
          continue;
        }

        console.log(`Loading document: ${file}`);
        const documents = await loader.load();

        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        });

        const splitDocs = await textSplitter.splitDocuments(documents);

        const newDocuments = splitDocs.map(doc => ({
          pageContent: doc.pageContent,
          metadata: {
            source: `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${process.env.AZURE_STORAGE_CONTAINER_NAME}/${workspace}/uploads/${file}`,
          },
        }));

        await appendToDocstore(workspace, newDocuments);

        const fileContent = fs.readFileSync(tempFilePath);
        processDocuments.push({
          fileName: file,
          fileContent: fileContent,
        });

        processedFiles.push(file);
        fs.unlinkSync(tempFilePath);
      } catch (error) {
        console.error(`Error processing file "${file}":`, error);
        skippedFiles.push(file);
      }
    }

    if (processDocuments.length > 0) {
      await processNewFiles(workspace, processDocuments);
    }

    res.status(200).json({ files: uploadedFiles, processedFiles, skippedFiles });
  } catch (error) {
    console.error(`Error handling GET /api/workspaces/${workspace}/files:`, error);
    res.status(500).json({ message: 'Error retrieving workspace files.' });
  }
}
