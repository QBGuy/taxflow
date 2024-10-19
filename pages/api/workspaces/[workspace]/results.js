// pages/api/workspaces/[workspace]/results.js

const fs = require('fs')
const path = require('path')

// Define directories
const RESULTS_DIR = path.resolve(process.cwd(), 'results')

export default async function handler(req, res) {
  const {
    query: { workspace },
    method,
  } = req

  if (method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end(`Method ${method} Not Allowed`)
  }

  const resultsPath = path.join(RESULTS_DIR, workspace, 'results.json')

  if (!fs.existsSync(resultsPath)) {
    return res.status(404).json({ message: 'No results found for this workspace.' })
  }

  try {
    const rawData = fs.readFileSync(resultsPath, 'utf-8')
    const results = JSON.parse(rawData)
    res.status(200).json({ results })
  } catch (error) {
    console.error('Error reading results.json:', error)
    res.status(500).json({ message: 'Error reading results.' })
  }
}
