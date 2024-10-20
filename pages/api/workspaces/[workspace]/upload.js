// pages/api/workspaces/[workspace]/upload.js
  
import { IncomingForm } from 'formidable'
import formidable from 'formidable';
import { promises as fsPromises } from 'fs';
import { processNewFiles } from '@lib/vectorStoreUtils';
import { uploadFile, downloadFile, appendToDocstore } from '@lib/azureBlob';
import path from 'path'
console.log('------RUNNING: upload.js')

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

  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }

  const form = new IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing the files:', err);
      return res.status(500).json({ message: 'Error parsing the files.' });
    }

    const uploadedFiles = [];

    // Handle single or multiple file uploads
    if (Array.isArray(files.file)) {
      for (const file of files.file) {
        uploadedFiles.push({
          fileName: file.originalFilename,
          filePath: file.filepath,
        });
      }
    } else if (files.file) {
      uploadedFiles.push({
        fileName: files.file.originalFilename,
        filePath: files.file.filepath,
      });
    }

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ message: 'No files provided for upload.' });
    }

    try {
      // Upload each file to Azure Blob Storage under 'uploads' directory
      for (const file of uploadedFiles) {
        const fileBuffer = await fsPromises.readFile(file.filePath);
        await uploadFile(workspace, 'uploads', file.fileName, fileBuffer);
        console.log(`File "${file.fileName}" uploaded successfully.`);
      }

      // // Prepare newDocuments for docstore.json
      // const docstoreDocuments = [];
      // const processDocuments = [];

      // for (const file of uploadedFiles) {
      //   const ext = path.extname(file.fileName).toLowerCase();

      //   // Only process supported file types for docstore
      //   if (!['.pdf', '.docx', '.doc', '.txt'].includes(ext)) {
      //     console.log(`Unsupported file type for docstore: ${file.fileName}`);
      //     continue;
      //   }

      //   // Read the uploaded file content
      //   const fileContent = await fsPromises.readFile(file.filePath);

      //   // Add to docstoreDocuments for docstore.json
      //   docstoreDocuments.push({
      //     pageContent: file.fileName, // Using fileName as unique identifier
      //     metadata: {
      //       source: `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${process.env.AZURE_STORAGE_CONTAINER_NAME}/${workspace}/uploads/${file.fileName}`,
      //     },
      //   });

      //   // Add to processDocuments for vector store processing
      //   processDocuments.push({
      //     fileName: file.fileName,
      //     fileContent: fileContent,
      //   });
      // }

      // // Append to docstore.json
      // if (docstoreDocuments.length > 0) {
      //   await appendToDocstore(workspace, docstoreDocuments);
      // }

      // // Process and add new files to the vector store
      // if (processDocuments.length > 0) {
      //   await processNewFiles(workspace, processDocuments);
      // }

      // // Initialize results.json if it doesn't exist
      // const resultsFile = 'results.json';
      // try {
      //   await downloadFile(workspace, 'results', resultsFile, false);
      //   console.log(`"results.json" already exists for workspace "${workspace}".`);
      // } catch (error) {
      //   if (error.code === 'BlobNotFound' || error.statusCode === 404) {
      //     const initialResults = JSON.stringify([], null, 2);
      //     await uploadFile(workspace, 'results', resultsFile, Buffer.from(initialResults));
      //     console.log(`Initialized "results.json" for workspace "${workspace}".`);
      //   } else {
      //     throw error;
      //   }
      // }

      res.status(200).json({ message: 'Files uploaded and processed successfully.' });
    } catch (error) {
      console.error('Error processing upload:', error);
      res.status(500).json({ message: 'Error processing upload.' });
    }
  });
}
