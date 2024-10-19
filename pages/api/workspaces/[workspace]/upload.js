// pages/api/workspaces/[workspace]/upload.js
import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// Disable Next.js default body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

// Define directories
const VECTOR_STORE_DIR = path.resolve(process.cwd(), 'vector_stores');
const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads');

export default async function handler(req, res) {
  const {
    query: { workspace },
    method,
  } = req;

  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }

  const workspacePath = path.join(VECTOR_STORE_DIR, workspace);
  if (!fs.existsSync(workspacePath)) {
    return res.status(400).json({ message: 'Workspace does not exist.' });
  }

  // Ensure upload directory exists
  const workspaceUploadDir = path.join(UPLOAD_DIR, workspace);
  if (!fs.existsSync(workspaceUploadDir)) {
    fs.mkdirSync(workspaceUploadDir, { recursive: true });
    console.log(`Created upload directory: ${workspaceUploadDir}`);
  }

  // Parse the incoming form with formidable
  const form = new IncomingForm({
    uploadDir: workspaceUploadDir,
    keepExtensions: true,
    multiples: true,
    filename: (name, ext, part) => {
      return part.originalFilename;
    },
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parsing error:', err);
      return res.status(500).json({ message: 'Error parsing the files.' });
    }

    const uploadedFiles = Array.isArray(files.file) ? files.file : [files.file];

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ message: 'No files uploaded.' });
    }

    try {
      let vectorStore;
      const vectorStorePath = workspacePath;

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
      }

      const docstorePath = path.join(vectorStorePath, 'docstore.json');
      let processedFilesSet = new Set();

      if (fs.existsSync(docstorePath)) {
        const raw = fs.readFileSync(docstorePath, 'utf-8');
        try {
          const docstore = JSON.parse(raw);
          console.log(`Loaded docstore for workspace ${workspace}:`, Object.keys(docstore));

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

      const skippedFiles = [];
      const processedFiles = [];

      for (const file of uploadedFiles) {
        const originalName = file.originalFilename;
        const filePath = path.join(workspaceUploadDir, originalName);
        const ext = path.extname(originalName).toLowerCase();

        console.log(`Processing file: ${originalName}`);

        if (processedFilesSet.has(originalName)) {
          console.log(`File already processed: ${originalName}`);
          skippedFiles.push(originalName);
          continue;
        }

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
          return res.status(500).json({ message: 'Error saving vector store.' });
        }
      }

      res.status(200).json({ 
        files: uploadedFiles.map(f => f.originalFilename), 
        processedFiles, 
        skippedFiles 
      });
    } catch (error) {
      console.error(`Error processing files:`, error);
      return res.status(500).json({ message: 'Error processing files.' });
    }
  });
}
