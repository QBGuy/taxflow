// pages/index.js

import { useState, useEffect } from 'react'
import { ToastContainer, toast } from 'react-toastify'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { FileIcon, FolderIcon, PlusIcon, UploadIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import 'react-toastify/dist/ReactToastify.css'
import { cn } from '@/lib/utils'

export default function Home() {
  const [workspaces, setWorkspaces] = useState([])
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [allResults, setAllResults] = useState({})
  const [currentIterations, setCurrentIterations] = useState({})
  const [selectedSections, setSelectedSections] = useState([])
  const [extraInstructions, setExtraInstructions] = useState('')
  const [isModifyPopoverOpen, setIsModifyPopoverOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [highlightedSections, setHighlightedSections] = useState([])

  useEffect(() => {
    const fetchWorkspaces = async () => {
      setIsLoadingWorkspaces(true)
      try {
        const response = await axios.get('/api/workspaces')
        setWorkspaces(response.data.workspaces)
      } catch (error) {
        console.error('Error fetching workspaces:', error)
        toast.error('Failed to load workspaces.')
      } finally {
        setIsLoadingWorkspaces(false)
      }
    }

    fetchWorkspaces()
  }, [])

  useEffect(() => {
    const fetchWorkspaceData = async () => {
      if (!selectedWorkspace) {
        setUploadedFiles([])
        setAllResults({})
        setCurrentIterations({})
        return
      }

      setIsLoadingFiles(true)
      setIsProcessing(false)
      try {
        const filesResponse = await axios.get(`/api/workspaces/${encodeURIComponent(selectedWorkspace)}/files`)
        setUploadedFiles(filesResponse.data.files)

        try {
          const resultsResponse = await axios.get(`/api/workspaces/${encodeURIComponent(selectedWorkspace)}/results`)
          const results = resultsResponse.data.results

          const resultsBySection = results.reduce((acc, result) => {
            if (!acc[result.section]) {
              acc[result.section] = []
            }
            acc[result.section].push(result)
            return acc
          }, {})

          setAllResults(resultsBySection)

          const latestIterations = {}
          Object.keys(resultsBySection).forEach(section => {
            const sorted = resultsBySection[section].sort((a, b) => b.iteration_number - a.iteration_number)
            latestIterations[section] = sorted[0].iteration_number
          })
          setCurrentIterations(latestIterations)
        } catch (error) {
          console.log('No existing results found for this workspace.')
          setAllResults({})
          setCurrentIterations({})
        }

        if (filesResponse.data.processedFiles.length > 0 || filesResponse.data.skippedFiles.length > 0) {
          setIsProcessing(true)
          if (filesResponse.data.processedFiles.length > 0) {
            toast.success(`Processed files: ${filesResponse.data.processedFiles.join(', ')}`)
          }
          if (filesResponse.data.skippedFiles.length > 0) {
            toast.info(`Skipped files: ${filesResponse.data.skippedFiles.join(', ')}`)
          }
        } else {
          setIsProcessing(false)
        }
      } catch (error) {
        console.error('Error fetching workspace data:', error)
        toast.error('Failed to load workspace data.')
      } finally {
        setIsLoadingFiles(false)
        setIsProcessing(false)
      }
    }

    fetchWorkspaceData()
  }, [selectedWorkspace])

  const handleWorkspaceSelect = async (workspace) => {
    setSelectedWorkspace(workspace)
    toast.success(`Workspace "${workspace}" selected.`)
  }

  const handleCreateWorkspace = async () => {
    if (newWorkspaceName.trim() === '') {
      toast.error('Workspace name cannot be empty.')
      return
    }

    try {
      const response = await axios.post('/api/workspaces', {
        workspace: newWorkspaceName,
      })
      setWorkspaces((prev) => [...prev, newWorkspaceName])
      setSelectedWorkspace(newWorkspaceName)
      setNewWorkspaceName('')
      setIsDialogOpen(false)
      toast.success(`Workspace "${newWorkspaceName}" created.`)
    } catch (error) {
      console.error('Error creating workspace:', error)
      toast.error(
        error.response?.data?.message || 'Failed to create workspace.'
      )
    }
  }

  const onDrop = async (acceptedFiles) => {
    if (!selectedWorkspace) {
      toast.error('Please select or create a workspace first.')
      return
    }

    setIsUploading(true)
    toast.info('Uploading files...')

    const formData = new FormData()
    acceptedFiles.forEach((file) => {
      formData.append('file', file)
    })

    try {
      const response = await axios.post(
        `/api/workspaces/${encodeURIComponent(selectedWorkspace)}/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )

      toast.success('Files uploaded successfully.')
      toast.info('Indexing files...')

      const filesResponse = await axios.get(`/api/workspaces/${encodeURIComponent(selectedWorkspace)}/files`)
      setUploadedFiles(filesResponse.data.files)

      try {
        const resultsResponse = await axios.get(`/api/workspaces/${encodeURIComponent(selectedWorkspace)}/results`)
        const results = resultsResponse.data.results

        const resultsBySection = results.reduce((acc, result) => {
          if (!acc[result.section]) {
            acc[result.section] = []
          }
          acc[result.section].push(result)
          return acc
        }, {})

        setAllResults(resultsBySection)

        const latestIterations = {}
        Object.keys(resultsBySection).forEach(section => {
          const sorted = resultsBySection[section].sort((a, b) => b.iteration_number - a.iteration_number)
          latestIterations[section] = sorted[0].iteration_number
        })
        setCurrentIterations(latestIterations)
      } catch (error) {
        console.log('No existing results found after upload.')
        setAllResults({})
        setCurrentIterations({})
      }

      if (filesResponse.data.processedFiles.length > 0 || filesResponse.data.skippedFiles.length > 0) {
        setIsProcessing(true)
        if (filesResponse.data.processedFiles.length > 0) {
          toast.success(`Processed files: ${filesResponse.data.processedFiles.join(', ')}`)
        }
        if (filesResponse.data.skippedFiles.length > 0) {
          toast.info(`Skipped files: ${filesResponse.data.skippedFiles.join(', ')}`)
        }
      } else {
        setIsProcessing(false)
      }
    } catch (error) {
      console.error('Error uploading files:', error)
      toast.error(
        error.response?.data?.message || 'Failed to upload files.'
      )
    } finally {
      setIsUploading(false)
      setIsProcessing(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
  })

  const handleGenerate = async () => {
    if (!selectedWorkspace) {
      toast.error('Please select a workspace first.')
      return
    }

    setIsGenerating(true)
    toast.info('Generating responses...')
    try {
      const response = await axios.post(`/api/workspaces/${encodeURIComponent(selectedWorkspace)}/generate`)
      const newResults = response.data.results

      const newResultsBySection = newResults.reduce((acc, result) => {
        if (!acc[result.section]) {
          acc[result.section] = []
        }
        acc[result.section].push(result)
        return acc
      }, {})

      const updatedAllResults = { ...allResults }
      const sectionsToHighlight = []

      Object.keys(newResultsBySection).forEach(section => {
        if (!updatedAllResults[section]) {
          updatedAllResults[section] = []
        }
        updatedAllResults[section] = [...updatedAllResults[section], ...newResultsBySection[section]]
        sectionsToHighlight.push(section)
      })
      setAllResults(updatedAllResults)

      const updatedIterations = { ...currentIterations }
      Object.keys(newResultsBySection).forEach(section => {
        const latestIteration = Math.max(...newResultsBySection[section].map(r => r.iteration_number))
        updatedIterations[section] = latestIteration
      })
      setCurrentIterations(updatedIterations)

      // Highlight updated sections
      setHighlightedSections(sectionsToHighlight)
      setTimeout(() => {
        setHighlightedSections([])
      }, 1000) // Highlight duration: 1 second

      toast.success('Responses generated successfully.')
    } catch (error) {
      console.error('Error generating responses:', error)
      toast.error('Failed to generate responses.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleIterationChange = (section, direction) => {
    setCurrentIterations(prev => {
      const current = prev[section] || 1
      const max = allResults[section]?.length || 1
      let newIteration = current + direction
      if (newIteration < 1) newIteration = 1
      if (newIteration > max) newIteration = max
      return {
        ...prev,
        [section]: newIteration,
      }
    })
  }

  const toggleSection = (section) => {
    setSelectedSections((prev) => {
      if (prev.includes(section)) {
        return prev.filter((s) => s !== section)
      } else {
        return [...prev, section]
      }
    })
  }

  const handleGenerateModifications = async () => {
    if (!extraInstructions.trim()) {
      toast.error('Please enter extra instructions.')
      return
    }

    setIsGenerating(true)
    try {
      const response = await axios.post(`/api/workspaces/${encodeURIComponent(selectedWorkspace)}/modify`, {
        sections: selectedSections,
        extraInstructions,
      })

      const modifiedResults = response.data.modifiedResults

      const modifiedResultsBySection = modifiedResults.reduce((acc, result) => {
        if (!acc[result.section]) {
          acc[result.section] = []
        }
        acc[result.section].push(result)
        return acc
      }, {})

      const updatedAllResults = { ...allResults }
      const sectionsToHighlight = []

      Object.keys(modifiedResultsBySection).forEach(section => {
        if (!updatedAllResults[section]) {
          updatedAllResults[section] = []
        }
        updatedAllResults[section] = [...updatedAllResults[section], ...modifiedResultsBySection[section]]
        sectionsToHighlight.push(section)
      })
      setAllResults(updatedAllResults)

      const updatedIterations = { ...currentIterations }
      Object.keys(modifiedResultsBySection).forEach(section => {
        const latestIteration = Math.max(...modifiedResultsBySection[section].map(r => r.iteration_number))
        updatedIterations[section] = latestIteration
      })
      setCurrentIterations(updatedIterations)

      // Highlight updated sections
      setHighlightedSections(sectionsToHighlight)
      setTimeout(() => {
        setHighlightedSections([])
      }, 1000) // Highlight duration: 1 second

      toast.success('Modifications generated successfully.')
      setIsModifyPopoverOpen(false)
      setExtraInstructions('')
    } catch (error) {
      console.error('Error generating modifications:', error)
      toast.error('Failed to generate modifications.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast.success('Copied to clipboard!')
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err)
        toast.error('Failed to copy.')
      })
  }

  const getFileTypeIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase()
    switch (extension) {
      case 'pdf':
        return <FileIcon className="h-5 w-5 text-red-500" />
      case 'doc':
      case 'docx':
        return <FileIcon className="h-5 w-5 text-blue-500" />
      case 'jpg':
      case 'png':
        return <FileIcon className="h-5 w-5 text-yellow-500" />
      case 'xlsx':
      case 'csv':
        return <FileIcon className="h-5 w-5 text-green-500" />
      default:
        return <FileIcon className="h-5 w-5 text-gray-500" />
    }
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Side Pane */}
      <div className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-4 border-b">
          <img src="/logo.svg" alt="Logo" className="h-8 w-auto" />
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <Select onValueChange={handleWorkspaceSelect} disabled={isGenerating}>
            <SelectTrigger className="w-full mb-4">
              {selectedWorkspace ? (
                <span>{selectedWorkspace}</span>
              ) : (
                <span>Select a Workspace</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {isLoadingWorkspaces ? (
                <SelectItem disabled>Loading...</SelectItem>
              ) : workspaces.length === 0 ? (
                <SelectItem disabled>No workspaces found</SelectItem>
              ) : (
                workspaces.map((workspace, index) => (
                  <SelectItem key={index} value={workspace}>
                    {workspace}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="w-full mb-4" 
            onClick={() => setIsDialogOpen(true)}
            disabled={isGenerating}
          >
            <PlusIcon className="mr-2 h-4 w-4" /> New Workspace
          </Button>
          <div className="mb-4">
            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 transition-colors ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <input {...getInputProps()} />
              <UploadIcon className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Drag & drop files here, or click to select files</p>
            </div>
            {isUploading && <Progress className="mt-4" />}
            {uploadedFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center text-sm text-gray-600">
                    {getFileTypeIcon(file)}
                    <span className="ml-2">{file}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button 
            onClick={handleGenerate} 
            className="w-full mb-2" 
            disabled={isGenerating || uploadedFiles.length === 0}
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </Button>
          <Popover open={isModifyPopoverOpen} onOpenChange={setIsModifyPopoverOpen}>
            <PopoverTrigger asChild>
              <Button 
                className="w-full" 
                disabled={isGenerating || selectedSections.length === 0}
              >
                Modify
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 max-w-xs">
              <div className="space-y-4">
                <h4 className="font-medium">Modify Selected Sections</h4>
                <Input
                  as="textarea"
                  rows={4}
                  placeholder="Enter additional instructions..."
                  value={extraInstructions}
                  onChange={(e) => setExtraInstructions(e.target.value)}
                  className="w-full"
                />
                <Button 
                  onClick={handleGenerateModifications} 
                  className="w-full" 
                  disabled={isGenerating}
                >
                  {isGenerating ? 'Generating...' : 'Generate Modifications'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <header className="bg-white shadow-sm p-4">
          <h1 className="text-2xl font-semibold text-gray-800">Responses</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {/* Generated Results */}
          <section>
            {/* <h2 className="text-xl font-semibold mb-4 text-gray-700">Generated Responses</h2> */}
            {Object.keys(allResults).length === 0 ? (
              <p className="text-gray-500">No responses generated yet.</p>
            ) : (
              <div className="space-y-4">
                {Object.keys(allResults).map((section) => {
                  const iterations = allResults[section]
                  const currentIteration = currentIterations[section] || 1
                  const currentResult = iterations.find(r => r.iteration_number === currentIteration)
                  const isSelected = selectedSections.includes(section)
                  const isHighlighted = highlightedSections.includes(section)

                  return (
                    <Card 
                      key={section} 
                      className={`p-4 hover:shadow-md transition-shadow cursor-pointer ${
                        isSelected ? 'bg-gray-200 border-gray-300' : ''
                      } ${isHighlighted ? 'animate-pulse bg-green-50 border-green-200' : ''}`}
                      onClick={() => toggleSection(section)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-gray-800">{currentResult.question}</h3>
                        <div className="flex items-center space-x-2">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleIterationChange(section, -1)
                            }}
                            disabled={currentIteration === 1}
                            size="sm"
                            variant="ghost"
                          >
                            <ChevronLeftIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleIterationChange(section, 1)
                            }}
                            disabled={currentIteration === iterations.length}
                            size="sm"
                            variant="ghost"
                          >
                            <ChevronRightIcon className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCopy(currentResult.answer)
                            }}
                          >
                            <CopyIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-md border mt-2">
                        <p className="text-gray-700">{currentResult.answer}</p>
                      </div>
                      <p className="text-sm text-gray-500 mt-2">Iteration: {currentIteration}</p>
                    </Card>


                  )
                })}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Dialogs */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
            <DialogDescription>
              Enter a name for the new workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Input
              placeholder="Workspace Name"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="mt-6 flex justify-end space-x-4">
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateWorkspace} disabled={isGenerating}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ToastContainer />
    </div>
  )
}
