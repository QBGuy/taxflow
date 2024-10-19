// pages/api/workspaces/[workspace]/modify.js

const fs = require('fs');
const path = require('path');
const { HNSWLib } = require('@langchain/community/vectorstores/hnswlib');
const { AzureOpenAIEmbeddings, AzureChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { createStuffDocumentsChain } = require('langchain/chains/combine_documents');
const { createRetrievalChain } = require('langchain/chains/retrieval');
import prompts from '@/lib/prompts';
console.log('Loaded prompts:', prompts);

// Define directories
const VECTOR_STORE_DIR = path.resolve(process.cwd(), 'vector_stores')
const RESULTS_DIR = path.resolve(process.cwd(), 'results')

export default async function handler(req, res) {
  const {
    query: { workspace },
    method,
  } = req

  if (method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${method} Not Allowed`)
  }

  const { sections, extraInstructions } = req.body

  if (!sections || !Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ message: 'No sections provided for modification.' })
  }

  if (!extraInstructions || typeof extraInstructions !== 'string') {
    return res.status(400).json({ message: 'Extra instructions are required.' })
  }

  const vectorStorePath = path.join(VECTOR_STORE_DIR, workspace)
  const resultsPath = path.join(RESULTS_DIR, workspace)
  const resultsFilePath = path.join(resultsPath, 'results.json')

  if (!fs.existsSync(vectorStorePath)) {
    return res.status(400).json({ message: 'Workspace does not exist.' })
  }

  if (!fs.existsSync(resultsFilePath)) {
    return res.status(400).json({ message: 'No results found to modify.' })
  }

  try {
    // Initialize Embeddings
    const embeddings = new AzureOpenAIEmbeddings({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
      azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
    })

    // Load Vector Store
    let vectorStore
    const vectorStoreIndexPath = path.join(vectorStorePath, 'hnswlib.index')
    if (fs.existsSync(vectorStoreIndexPath)) {
      console.log(`Loading existing vector store for workspace: ${workspace}`)
      vectorStore = await HNSWLib.load(vectorStorePath, embeddings)
    } else {
      return res.status(500).json({ message: 'Vector store not initialized.' })
    }

    // Initialize LLM
    const llm = new AzureChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0,
      maxTokens: undefined,
      maxRetries: 2,
      azureOpenAIApiKey: process.env.AZURE_OPENAI_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_VERSION || "2024-05-01-preview",
    })

    // Create Retriever
    const retriever = vectorStore.asRetriever()

    // Define Custom Prompt Template with appended extra instructions
    const customTemplate = `Your task is to answer the following QUESTION using provided CONTEXT and RULES.  
        
QUESTION: {input}
RULES: 
Only use information from the context. 
If you are missing information or are unsure, insert a placeholder to [clarify with client]
Use EXAMPLES to determine the structure and to guide the length of the response. If no examples are provided then answer in 3 sentences or less.
{extra_rules}

CONTEXT: {context}

EXAMPLES
{examples}

Modify BASE_RESPONSE with the following additional INSTRUCTIONS 
INSTRUCTIONS: {extra_instructions}
BASE_RESPONSE: {base_response}
`

    // Create Combine Documents Chain
    const combineDocsChain = await createStuffDocumentsChain({
      llm: llm,
      prompt: PromptTemplate.fromTemplate(customTemplate),
      outputParser: new StringOutputParser(),
    })

    // Create Retrieval Chain
    const chain = await createRetrievalChain({
      retriever: retriever,
      combineDocsChain: combineDocsChain,
      maxDocuments: 5, // Adjust based on your needs
    })

    // Function to run RAG Chain
    const runRagChain = async (chain, question, extra_rules, extra_instructions) => {
      const response = await chain.invoke({
        input: question,
        extra_rules: extra_rules,
        examples: prompts.examples || '', // Assuming examples are loaded from prompts.js
        extra_instructions: extra_instructions,
        base_response: '', // Will be filled below
      })

      return response.text || response.answer || 'No answer provided.'
    }

    // Load existing results
    const rawData = fs.readFileSync(resultsFilePath, 'utf-8')
    const existingResults = JSON.parse(rawData)

    // Process Modifications
    const modifiedResults = []

    for (const section of sections) {
      // Find the latest result for the section
      const sectionResults = existingResults.filter(r => r.section === section)
      if (sectionResults.length === 0) {
        console.log(`No existing results found for section: ${section}`)
        continue
      }
      const latestResult = sectionResults.reduce((prev, current) => {
        return (prev.iteration_number > current.iteration_number) ? prev : current
      })

      const modifiedExtraRules = `${latestResult.extra_rules || ''}\nModify BASE_RESPONSE with the following additional INSTRUCTIONS 
INSTRUCTIONS: ${extraInstructions}
BASE_RESPONSE: ${latestResult.answer}`

      // Run RAG Chain with modified extra_rules
      const answer = await runRagChain(chain, latestResult.question, modifiedExtraRules, extraInstructions)

      // Create new result
      const newResult = {
        section,
        iteration_number: latestResult.iteration_number + 1,
        question: latestResult.question,
        answer,
      }

      modifiedResults.push(newResult)
    }

    // Save modified results
    const allResults = [...existingResults, ...modifiedResults]
    fs.writeFileSync(resultsFilePath, JSON.stringify(allResults, null, 2))
    console.log(`Saved modified results to ${resultsFilePath}`)

    res.status(200).json({ modifiedResults })
  } catch (error) {
    console.error('Error generating modifications:', error)
    res.status(500).json({ message: 'Error generating modifications.' })
  }
}
