// pages/api/workspaces/[workspace]/results.js

import { downloadFile } from '../../../../lib/azureBlob'
console.log('------RUNNING: results.js')
export default async function handler(req, res) {
  const {
    query: { workspace },
    method,
  } = req

  if (method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end(`Method ${method} Not Allowed`)
  }

  try {
    const resultsContent = await downloadFile(workspace, 'results', 'results.json', false)
    const results = JSON.parse(resultsContent)
    res.status(200).json({ results })
  } catch (error) {
    if (error.code === 'BlobNotFound' || error.statusCode === 404) {
      return res.status(404).json({ message: 'No results found for this workspace.' })
    }
    console.error('Error reading results.json:')
    res.status(500).json({ message: 'Error reading results.' })
  }
}
