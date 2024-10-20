// lib/azureBlob.js

import { BlobServiceClient } from '@azure/storage-blob';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Initialize BlobServiceClient
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('Azure Storage Connection string is not defined in environment variables.');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);

// Fixed USER_ID as the container name
const USER_ID = 'user1';

/**
 * Get a Container Client. Creates the container if it does not exist.
 * @returns {ContainerClient} - The container client.
 */
const getContainerClient = async () => {
  const containerClient = blobServiceClient.getContainerClient(USER_ID);
  await containerClient.createIfNotExists(); // Private access by default
  return containerClient;
};

/**
 * List all workspaces (unique first-level directories).
 * @returns {Array} - An array of workspace names.
 */
export const listWorkspaces = async () => {
  try {
    const containerClient = await getContainerClient();
    const delimiter = '/';
    const workspaces = new Set();

    // Use listBlobsByHierarchy to get directories at the root level
    for await (const response of containerClient.listBlobsByHierarchy(delimiter, { prefix: '' })) {
      if (response.kind === 'prefix') {
        const workspace = response.name.replace('/', '');
        if (workspace) {
          workspaces.add(workspace);
        }
      }
    }

    return Array.from(workspaces);
  } catch (error) {
    console.error('Error listing workspaces:', error);
    throw error;
  }
};

/**
 * List all files under a specific workspace and file type.
 * @param {string} workspace - The workspace/client identifier.
 * @param {string} [fileType] - Type of file ('uploads', 'results', 'vector_store'). Optional.
 * @returns {Array} - An array of blob names.
 */
export const listFiles = async (workspace, fileType) => {
  try {
    const containerClient = await getContainerClient();
    const prefix = fileType ? `${workspace}/${fileType}/` : `${workspace}/vector_store/`;
    const blobs = containerClient.listBlobsFlat({ prefix });
    const files = [];

    for await (const blob of blobs) {
      // Extract file name by removing the prefix
      const fileName = blob.name.substring(prefix.length);
      files.push(fileName);
    }

    return files;
  } catch (error) {
    console.error(`Error listing files for workspace "${workspace}" and file type "${fileType}":`, error);
    throw error;
  }
};

/**
 * Check if a specific blob exists in Azure Blob Storage.
 * @param {string} workspace - The workspace/client identifier.
 * @param {string} fileType - Type of file ('uploads', 'results', 'vector_store').
 * @param {string} fileName - The name of the file to check.
 * @returns {boolean} - True if the blob exists, false otherwise.
 */
export const checkBlobExists = async (workspace, fileType, fileName) => {
  try {
    await downloadFile(workspace, fileType, fileName, false);
    return true;
  } catch (error) {
    if (error.code === 'BlobNotFound' || error.statusCode === 404) {
      return false;
    }
    throw error;
  }
};

/**
 * Upload a file to Azure Blob Storage under a specific workspace and file type.
 * @param {string} workspace - The workspace/client identifier.
 * @param {string} fileType - Type of file ('uploads', 'results', 'vector_store').
 * @param {string} fileName - The name of the file to upload.
 * @param {Buffer} fileData - The buffer data of the file to upload.
 * @returns {string} - The URL of the uploaded blob.
 */
export const uploadFile = async (workspace, fileType, fileName, fileData) => {
  try {
    const containerClient = await getContainerClient();

    // Define the path based on file type
    const blobPath = fileType === 'results'
      ? `${workspace}/results/${fileName}` // Store results.json in 'results' directory
      : `${workspace}/${fileType}/${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    // Upload the file
    const uploadBlobResponse = await blockBlobClient.uploadData(fileData, { overwrite: true });
    console.log(`File "${blobPath}" uploaded successfully. Request ID: ${uploadBlobResponse.requestId}`);
    return blockBlobClient.url;
  } catch (error) {
    console.error(`Error uploading file "${fileName}" to workspace "${workspace}":`, error);
    throw error;
  }
};

/**
 * Download a specific file from Azure Blob Storage.
 * @param {string} workspace - The workspace/client identifier.
 * @param {string} fileType - Type of file ('uploads', 'results', 'vector_store').
 * @param {string} fileName - The name of the file to download.
 * @param {boolean} asBuffer - Whether to return the content as a Buffer. Defaults to false (string).
 * @returns {Buffer|string} - The content of the file.
 */
export const downloadFile = async (workspace, fileType, fileName, asBuffer = false) => {
  try {
    const containerClient = await getContainerClient();
    const blobPath = fileType === 'results'
      ? `${workspace}/results/${fileName}` // Download from 'results' directory
      : `${workspace}/${fileType}/${fileName}`;
    const blobClient = containerClient.getBlobClient(blobPath);

    const downloadResponse = await blobClient.download();
    if (asBuffer) {
      const chunks = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } else {
      const content = await streamToString(downloadResponse.readableStreamBody);
      return content;
    }
  } catch (error) {
    // console.error(`Error downloading file "${fileName}" from workspace "${workspace}":`, error);
    console.error(`Error downloading file "${fileName}" from workspace "${workspace}"`);
    throw error;
  }
};

/**
 * Download a specific file from Azure Blob Storage to a temporary local path.
 * @param {string} workspace - The workspace/client identifier.
 * @param {string} fileType - Type of file ('uploads', 'results', 'vector_store').
 * @param {string} fileName - The name of the file to download.
 * @returns {string} - The local path to the downloaded file.
 */
export const downloadFileToTemp = async (workspace, fileType, fileName) => {
  try {
    const containerClient = await getContainerClient();
    const blobPath = `${workspace}/${fileType}/${fileName}`;
    const blobClient = containerClient.getBlobClient(blobPath);

    const downloadResponse = await blobClient.download();
    const tempDir = os.tmpdir();
    const sanitizedFileName = fileName.replace(/[^a-z0-9.\-_]/gi, '_'); // Sanitize filename
    const tempFilePath = path.join(tempDir, `${workspace}-${fileType}-${sanitizedFileName}`);

    const writableStream = fs.createWriteStream(tempFilePath);
    await new Promise((resolve, reject) => {
      downloadResponse.readableStreamBody.pipe(writableStream);
      downloadResponse.readableStreamBody.on('end', resolve);
      downloadResponse.readableStreamBody.on('error', reject);
    });

    // console.log(`File "${blobPath}" downloaded to "${tempFilePath}".`);
    return tempFilePath;
  } catch (error) {
    console.error(`Error downloading file "${fileName}" to temp for workspace "${workspace}":`, error);
    throw error;
  }
};

/**
 * Upload a file from a local path to Azure Blob Storage.
 * @param {string} workspace - The workspace/client identifier.
 * @param {string} fileType - Type of file ('uploads', 'results', 'vector_store').
 * @param {string} localFilePath - The local path to the file to upload.
 * @param {string} fileName - The name of the file in Blob Storage.
 * @returns {string} - The URL of the uploaded blob.
 */
export const uploadFileFromLocal = async (workspace, fileType, localFilePath, fileName) => {
  try {
    const containerClient = await getContainerClient();
    const blobPath = fileType === 'results'
      ? `${workspace}/results/${fileName}` // Upload to 'results' directory
      : `${workspace}/${fileType}/${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    const fileBuffer = fs.readFileSync(localFilePath);
    const uploadBlobResponse = await blockBlobClient.uploadData(fileBuffer, { overwrite: true });
    // console.log(`File "${blobPath}" uploaded successfully from local path. Request ID: ${uploadBlobResponse.requestId}`);
    return blockBlobClient.url;
  } catch (error) {
    console.error(`Error uploading file "${fileName}" from local path to workspace "${workspace}":`, error);
    throw error;
  }
};

/**
 * Append new documents to docstore.json for a specific workspace.
 * @param {string} workspace - The workspace/client identifier.
 * @param {Array} newDocuments - An array of new document objects to append.
 * @returns {Array} - The updated docstore array.
 */
export const appendToDocstore = async (workspace, newDocuments) => {
  const fileType = 'vector_store';
  const fileName = 'docstore.json';

  try {
    // Download existing docstore.json
    let existingDocstore = [];
    try {
      const content = await downloadFile(workspace, fileType, fileName, false);
      existingDocstore = JSON.parse(content);
    } catch (err) {
      if (err.code === 'BlobNotFound' || err.statusCode === 404) {
        // File does not exist; initialize an empty array
        existingDocstore = [];
        console.log(`docstore.json does not exist for workspace "${workspace}". Initializing new docstore.`);
      } else {
        throw err;
      }
    }

    // Append new documents
    existingDocstore.push(...newDocuments);

    // Upload the updated docstore.json
    const updatedContent = JSON.stringify(existingDocstore, null, 2);
    await uploadFile(workspace, fileType, fileName, Buffer.from(updatedContent)); // Overwrite existing file

    console.log(`docstore.json for workspace "${workspace}" updated.`);
    return existingDocstore;
  } catch (error) {
    console.error(`Error appending to docstore.json for workspace "${workspace}":`, error);
    throw error;
  }
};

/**
 * Helper function to convert a readable stream to a string.
 * @param {ReadableStream} readableStream - The readable stream to convert.
 * @returns {Promise<string>} - The resulting string.
 */
const streamToString = (readableStream) =>
  new Promise((resolve, reject) => {
    if (!readableStream) {
      resolve('');
    }
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data.toString());
    });
    readableStream.on('end', () => {
      resolve(chunks.join(''));
    });
    readableStream.on('error', reject);
  });
