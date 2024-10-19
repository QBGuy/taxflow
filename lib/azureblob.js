// lib/azureBlob.js

import { BlobServiceClient } from '@azure/storage-blob'

// Initialize BlobServiceClient
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING

if (!AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('Azure Storage Connection string is not defined in environment variables.')
}

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)

/**
 * Get a Container Client. Creates the container if it does not exist.
 * @param {string} containerName - The name of the container.
 * @returns {ContainerClient} - The container client.
 */
const getContainerClient = async (containerName) => {
  const containerClient = blobServiceClient.getContainerClient(containerName)
  await containerClient.createIfNotExists({ access: 'private' })
  return containerClient
}

/**
 * Upload a file to Azure Blob Storage under a specific user's client directory.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} clientId - The unique identifier for the client.
 * @param {File|Buffer} file - The file object to upload.
 * @param {string} fileType - Type of file ('uploads', 'results', 'vector_store').
 * @returns {string} - The URL of the uploaded blob.
 */
export const uploadFile = async (userId, clientId, file, fileType) => {
  try {
    const containerName = userId // Each user has their own container
    const containerClient = await getContainerClient(containerName)

    // Define the path based on file type
    const blobPath = `${clientId}/${fileType}/${file.name}`
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath)

    // Upload the file
    const uploadBlobResponse = await blockBlobClient.uploadData(file)
    console.log(`File "${blobPath}" uploaded successfully. Request ID: ${uploadBlobResponse.requestId}`)
    return blockBlobClient.url
  } catch (error) {
    console.error('Error uploading file:', error)
    throw error
  }
}

/**
 * List all files under a specific user's client directory in a given file type.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} clientId - The unique identifier for the client.
 * @param {string} fileType - Type of file ('uploads', 'results', 'vector_store').
 * @returns {Array} - An array of blob names.
 */
export const listFiles = async (userId, clientId, fileType) => {
  try {
    const containerName = userId
    const containerClient = await getContainerClient(containerName)
    const prefix = `${clientId}/${fileType}/`
    const blobs = containerClient.listBlobsFlat({ prefix })
    const files = []

    for await (const blob of blobs) {
      // Extract file name by removing the prefix
      const fileName = blob.name.substring(prefix.length)
      files.push(fileName)
    }

    return files
  } catch (error) {
    console.error('Error listing files:', error)
    throw error
  }
}

/**
 * Download a specific file from Azure Blob Storage.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} clientId - The unique identifier for the client.
 * @param {string} fileType - Type of file ('uploads', 'results', 'vector_store').
 * @param {string} fileName - The name of the file to download.
 * @param {boolean} asBuffer - Whether to return the content as a Buffer. Defaults to false (string).
 * @returns {Buffer|string} - The content of the file.
 */
export const downloadFile = async (userId, clientId, fileType, fileName, asBuffer = false) => {
  try {
    const containerName = userId
    const containerClient = await getContainerClient(containerName)
    const blobPath = `${clientId}/${fileType}/${fileName}`
    const blobClient = containerClient.getBlobClient(blobPath)

    const downloadResponse = await blobClient.download()
    const content = await streamToString(downloadResponse.readableStreamBody)

    return asBuffer ? Buffer.from(content) : content
  } catch (error) {
    console.error('Error downloading file:', error)
    throw error
  }
}

/**
 * Append a new result to results.json for a specific user and client.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} clientId - The unique identifier for the client.
 * @param {Object} newResult - The new result object to append.
 * @returns {Array} - The updated results array.
 */
export const appendToResults = async (userId, clientId, newResult) => {
  const fileType = 'results'
  const fileName = 'results.json'

  try {
    // Download existing results.json
    let existingResults = []
    try {
      const content = await downloadFile(userId, clientId, fileType, fileName, false)
      existingResults = JSON.parse(content)
    } catch (err) {
      if (err.statusCode === 404) {
        // File does not exist; initialize an empty array
        existingResults = []
      } else {
        throw err
      }
    }

    // Append the new result
    existingResults.push(newResult)

    // Upload the updated results.json
    const updatedContent = JSON.stringify(existingResults, null, 2)
    await uploadFile(userId, clientId, Buffer.from(updatedContent), fileType) // Overwrite existing file

    console.log(`results.json for user "${userId}", client "${clientId}" updated.`)
    return existingResults
  } catch (error) {
    console.error('Error appending to results.json:', error)
    throw error
  }
}

/**
 * Append new documents to docstore.json for a specific user and client.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} clientId - The unique identifier for the client.
 * @param {Array} newDocuments - An array of new document objects to append.
 * @returns {Array} - The updated docstore array.
 */
export const appendToDocstore = async (userId, clientId, newDocuments) => {
  const fileType = 'vector_store'
  const fileName = 'docstore.json'

  try {
    // Download existing docstore.json
    let existingDocstore = []
    try {
      const content = await downloadFile(userId, clientId, fileType, fileName, false)
      existingDocstore = JSON.parse(content)
    } catch (err) {
      if (err.statusCode === 404) {
        // File does not exist; initialize an empty array
        existingDocstore = []
      } else {
        throw err
      }
    }

    // Append new documents
    existingDocstore.push(...newDocuments)

    // Upload the updated docstore.json
    const updatedContent = JSON.stringify(existingDocstore, null, 2)
    await uploadFile(userId, clientId, Buffer.from(updatedContent), fileType) // Overwrite existing file

    console.log(`docstore.json for user "${userId}", client "${clientId}" updated.`)
    return existingDocstore
  } catch (error) {
    console.error('Error appending to docstore.json:', error)
    throw error
  }
}

/**
 * Overwrite the hnswlib.index file for a specific user and client.
 * @param {string} userId - The unique identifier for the user.
 * @param {string} clientId - The unique identifier for the client.
 * @param {Buffer} newIndexBuffer - The new buffer data for hnswlib.index.
 * @returns {string} - The URL of the overwritten hnswlib.index blob.
 */
export const overwriteHnswlibIndex = async (userId, clientId, newIndexBuffer) => {
  const fileType = 'vector_store'
  const fileName = 'hnswlib.index'

  try {
    // Upload (overwrite) the hnswlib.index file
    const indexUrl = await uploadFile(userId, clientId, newIndexBuffer, fileType)
    console.log(`hnswlib.index for user "${userId}", client "${clientId}" overwritten.`)
    return indexUrl
  } catch (error) {
    console.error('Error overwriting hnswlib.index:', error)
    throw error
  }
}

/**
 * Helper function to convert a readable stream to a string.
 * @param {ReadableStream} readableStream - The readable stream to convert.
 * @returns {Promise<string>} - The resulting string.
 */
const streamToString = (readableStream) =>
  new Promise((resolve, reject) => {
    if (!readableStream) {
      resolve('')
    }
    const chunks = []
    readableStream.on('data', (data) => {
      chunks.push(data.toString())
    })
    readableStream.on('end', () => {
      resolve(chunks.join(''))
    })
    readableStream.on('error', reject)
  })
