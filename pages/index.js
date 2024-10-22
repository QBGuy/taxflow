// pages/index.js

import { useState, useEffect, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { FileIcon, FolderIcon, PlusIcon, UploadIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, MenuIcon } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import 'react-toastify/dist/ReactToastify.css'
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';  // To support GitHub-Flavored Markdown like tables and strikethrough

export default function Home() {
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [allResults, setAllResults] = useState({});
  const [currentIterations, setCurrentIterations] = useState({});
  const [selectedSections, setSelectedSections] = useState([]);
  const [extraInstructions, setExtraInstructions] = useState('');
  const [isModifyPopoverOpen, setIsModifyPopoverOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [highlightedSections, setHighlightedSections] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isLeftPaneOpen, setIsLeftPaneOpen] = useState(true); // State for left pane visibility
  const eventSourceRef = useRef(null); // Ref to store EventSource instance

  useEffect(() => {
    const fetchWorkspaces = async () => {
      setIsLoadingWorkspaces(true);
      try {
        const response = await axios.get('/api/workspaces');
        setWorkspaces(response.data.workspaces);
      } catch (error) {
        console.error('Error fetching workspaces:', error);
        toast.error('Failed to load workspaces.');
      } finally {
        setIsLoadingWorkspaces(false);
      }
    };

    fetchWorkspaces();
  }, []);

  useEffect(() => {
    const fetchWorkspaceData = async () => {
      if (!selectedWorkspace) {
        setUploadedFiles([]);
        setAllResults({});
        setCurrentIterations({});
        return;
      }

      setIsLoadingFiles(true);
      setIsProcessing(false);
      try {
        const filesResponse = await axios.get(
          `/api/workspaces/${encodeURIComponent(selectedWorkspace)}/files`
        );
        setUploadedFiles(filesResponse.data.files);

        try {
          const resultsResponse = await axios.get(
            `/api/workspaces/${encodeURIComponent(selectedWorkspace)}/results`
          );
          const results = resultsResponse.data.results;

          const resultsBySection = results.reduce((acc, result) => {
            if (!acc[result.section]) {
              acc[result.section] = [];
            }
            acc[result.section].push(result);
            return acc;
          }, {});

          setAllResults(resultsBySection);

          const latestIterations = {};
          Object.keys(resultsBySection).forEach((section) => {
            const sorted = resultsBySection[section].sort(
              (a, b) => b.iteration_number - a.iteration_number
            );
            latestIterations[section] = sorted[0].iteration_number;
          });
          setCurrentIterations(latestIterations);
        } catch (error) {
          console.log('No existing results found for this workspace.');
          setAllResults({});
          setCurrentIterations({});
        }

        if (
          filesResponse.data.processedFiles.length > 0 ||
          filesResponse.data.skippedFiles.length > 0
        ) {
          setIsProcessing(true);
          if (filesResponse.data.processedFiles.length > 0) {
            toast.success(
              `Processed files: ${filesResponse.data.processedFiles.join(', ')}`
            );
          }
          if (filesResponse.data.skippedFiles.length > 0) {
            toast.info(
              `Skipped files: ${filesResponse.data.skippedFiles.join(', ')}`
            );
          }
        } else {
          setIsProcessing(false);
        }
      } catch (error) {
        console.error('Error fetching workspace data:', error);
        toast.error('Failed to load workspace data.');
      } finally {
        setIsLoadingFiles(false);
        setIsProcessing(false);
      }
    };

    fetchWorkspaceData();
  }, [selectedWorkspace]);

  const handleWorkspaceSelect = async (workspace) => {
    setSelectedWorkspace(workspace);

    // Reset relevant state variables when a new workspace is selected
    setUploadedFiles([]);
    setAllResults({});
    setCurrentIterations({});
    setExtraInstructions('');
    setSelectedSections([]);

    toast.success(`Workspace "${workspace}" selected.`);
  };

  const handleCreateWorkspace = async () => {
    if (newWorkspaceName.trim() === '') {
      toast.error('Workspace name cannot be empty.');
      return;
    }

    try {
      const response = await axios.post('/api/workspaces', {
        workspace: newWorkspaceName,
      });

      // Add the new workspace to the list
      setWorkspaces((prev) => [...prev, newWorkspaceName]);

      // Set the new workspace as the selected workspace
      setSelectedWorkspace(newWorkspaceName);

      // Clear relevant state variables
      setUploadedFiles([]);
      setAllResults({});
      setCurrentIterations({});
      setExtraInstructions('');
      setSelectedSections([]);

      // Close the dialog and reset the workspace name input
      setNewWorkspaceName('');
      setIsDialogOpen(false);

      toast.success(`Workspace "${newWorkspaceName}" created.`);
    } catch (error) {
      console.error('Error creating workspace:', error);
      toast.error(
        error.response?.data?.message || 'Failed to create workspace.'
      );
    }
  };

  const onDrop = async (acceptedFiles) => {
    if (!selectedWorkspace) {
      toast.error('Please select or create a workspace first.');
      return;
    }

    setIsUploading(true);
    toast.info('Uploading files...');

    const formData = new FormData();
    acceptedFiles.forEach((file) => {
      formData.append('file', file);
    });

    try {
      const response = await axios.post(
        `/api/workspaces/${encodeURIComponent(selectedWorkspace)}/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      toast.success('Files uploaded successfully.');
      toast.info('Indexing files...');

      const filesResponse = await axios.get(
        `/api/workspaces/${encodeURIComponent(selectedWorkspace)}/files`
      );
      setUploadedFiles(filesResponse.data.files);

      try {
        const resultsResponse = await axios.get(
          `/api/workspaces/${encodeURIComponent(selectedWorkspace)}/results`
        );
        const results = resultsResponse.data.results;

        const resultsBySection = results.reduce((acc, result) => {
          if (!acc[result.section]) {
            acc[result.section] = [];
          }
          acc[result.section].push(result);
          return acc;
        }, {});

        setAllResults(resultsBySection);

        const latestIterations = {};
        Object.keys(resultsBySection).forEach((section) => {
          const sorted = resultsBySection[section].sort(
            (a, b) => b.iteration_number - a.iteration_number
          );
          latestIterations[section] = sorted[0].iteration_number;
        });
        setCurrentIterations(latestIterations);
      } catch (error) {
        console.log('No existing results found after upload.');
        setAllResults({});
        setCurrentIterations({});
      }

      if (
        filesResponse.data.processedFiles.length > 0 ||
        filesResponse.data.skippedFiles.length > 0
      ) {
        setIsProcessing(true);
        if (filesResponse.data.processedFiles.length > 0) {
          toast.success(
            `Processed files: ${filesResponse.data.processedFiles.join(', ')}`
          );
        }
        if (filesResponse.data.skippedFiles.length > 0) {
          toast.info(
            `Skipped files: ${filesResponse.data.skippedFiles.join(', ')}`
          );
        }
      } else {
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error(error.response?.data?.message || 'Failed to upload files.');
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
  });

  const handleGenerate = async () => {
    if (!selectedWorkspace) {
      toast.error('Please select a workspace first.');
      return;
    }

    setIsGenerating(true);
    setAllResults({}); // Clear previous results
    setCurrentIterations({});
    setHighlightedSections([]);
    toast.info('Generating responses...');

    // Initialize EventSource for SSE
    const eventSource = new EventSource(
      `/api/workspaces/${encodeURIComponent(selectedWorkspace)}/generate`
    );

    // Handle incoming messages
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Received SSE data:', data); // Debugging

      if (data.done) {
        toast.success('All responses generated successfully.');
        eventSource.close();
        setIsGenerating(false);
        return;
      }

      if (data.error) {
        toast.error(data.error);
        eventSource.close();
        setIsGenerating(false);
        return;
      }

      // Update state with the new result
      setAllResults((prev) => {
        const updated = { ...prev };
        const { section, iteration_number, question, answer } = data;

        if (!updated[section]) {
          updated[section] = [];
        }
        updated[section].push({ section, iteration_number, question, answer });

        return updated;
      });

      // Update current iterations to the latest iteration_number
      setCurrentIterations((prev) => {
        const updated = { ...prev };
        const { section, iteration_number } = data;

        // If the new iteration_number is greater than the current, update it
        if (!prev[section] || iteration_number > prev[section]) {
          updated[section] = iteration_number;
        }

        return updated;
      });

      // Highlight the updated section
      setHighlightedSections((prev) => [...prev, data.section]);
      setTimeout(() => {
        setHighlightedSections((prev) =>
          prev.filter((sec) => sec !== data.section)
        );
      }, 1000); // Highlight duration: 1 second
    };

    // Handle errors
    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
      toast.error('An error occurred while generating responses.');
      eventSource.close();
      setIsGenerating(false);
    };

    // Store the EventSource instance to close it later if needed
    eventSourceRef.current = eventSource;
  };

  // Clean up EventSource on component unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleIterationChange = (section, direction) => {
    setCurrentIterations((prev) => {
      const current = prev[section] || 1;
      const iterations = allResults[section] || [];
      const iterationNumbers = iterations.map((r) => r.iteration_number);
      const max = Math.max(...iterationNumbers, 1); // Ensure at least 1

      let newIteration = current + direction;
      if (newIteration < 1) newIteration = 1;
      if (newIteration > max) newIteration = max;
      return {
        ...prev,
        [section]: newIteration,
      };
    });
  };

  const toggleSection = (section) => {
    setSelectedSections((prev) => {
      if (prev.includes(section)) {
        return prev.filter((s) => s !== section);
      } else {
        return [...prev, section];
      }
    });
  };

  const handleGenerateModifications = async () => {
    if (!extraInstructions.trim()) {
      toast.error('Please enter extra instructions.');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await axios.post(
        `/api/workspaces/${encodeURIComponent(selectedWorkspace)}/modify`,
        {
          sections: selectedSections,
          extraInstructions,
        }
      );

      const modifiedResults = response.data.modifiedResults;

      const modifiedResultsBySection = modifiedResults.reduce((acc, result) => {
        if (!acc[result.section]) {
          acc[result.section] = [];
        }
        acc[result.section].push(result);
        return acc;
      }, {});

      setAllResults((prev) => {
        const updated = { ...prev };
        Object.keys(modifiedResultsBySection).forEach((section) => {
          if (!updated[section]) {
            updated[section] = [];
          }
          updated[section] = [
            ...updated[section],
            ...modifiedResultsBySection[section],
          ];
        });
        return updated;
      });

      const updatedIterations = { ...currentIterations };
      Object.keys(modifiedResultsBySection).forEach((section) => {
        const iterationNumbers = modifiedResultsBySection[section].map(
          (r) => r.iteration_number
        );
        const latestIteration = Math.max(...iterationNumbers, 1);
        updatedIterations[section] = latestIteration;
      });
      setCurrentIterations(updatedIterations);

      // Highlight updated sections
      setHighlightedSections(Object.keys(modifiedResultsBySection));
      setTimeout(() => {
        setHighlightedSections([]);
      }, 1000); // Highlight duration: 1 second

      // Clear selected sections after modifications are generated
      setSelectedSections([]);

      toast.success('Modifications generated successfully.');
      setIsModifyPopoverOpen(false);
      setExtraInstructions('');
    } catch (error) {
      console.error('Error generating modifications:', error);
      toast.error('Failed to generate modifications.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/workspaces/${selectedWorkspace}/export`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to export results.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(
        new Blob([blob], { type: 'text/html' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pd-${selectedWorkspace}.html`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success('Copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
        toast.error('Failed to copy.');
      });
  };

  const getFileTypeIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    switch (extension) {
      case 'pdf':
        return <FileIcon className="h-5 w-5 text-red-500" />;
      case 'doc':
      case 'docx':
        return <FileIcon className="h-5 w-5 text-blue-500" />;
      case 'jpg':
      case 'png':
        return <FileIcon className="h-5 w-5 text-yellow-500" />;
      case 'xlsx':
      case 'csv':
        return <FileIcon className="h-5 w-5 text-green-500" />;
      default:
        return <FileIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  // Toggle Left Pane Function
  const toggleLeftPane = () => {
    setIsLeftPaneOpen(!isLeftPaneOpen);
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Left Pane */}
      <div
        className={`bg-white shadow-md flex flex-col transition-all duration-300 ${
          isLeftPaneOpen ? 'w-64' : 'w-16'
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between h-16">
          {isLeftPaneOpen && (
            <div className="flex items-center">
              <img src="/easypd-logo.svg" alt="Logo" className="h-8" />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLeftPane}
            className="focus:outline-none"
          >
            <MenuIcon className="h-6 w-6" />
          </Button>
        </div>
        {isLeftPaneOpen && (
          <div className="p-4 flex-1 overflow-y-auto">
            <Select
              onValueChange={handleWorkspaceSelect}
              disabled={isGenerating || isUploading || isProcessing}
            >
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
              disabled={isGenerating || isUploading || isProcessing}
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
                <p className="text-sm text-gray-600">
                  Drag & drop files here, or click to select files
                </p>
              </div>
              {isUploading && <Progress className="mt-4" />}
              {uploadedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center text-sm text-gray-600"
                    >
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
              disabled={
                isGenerating ||
                isUploading ||
                isProcessing ||
                uploadedFiles.length === 0 ||
                isExporting
              }
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </Button>

            <Popover
              open={isModifyPopoverOpen}
              onOpenChange={setIsModifyPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  className="w-full mb-2"
                  disabled={
                    isGenerating ||
                    isUploading ||
                    isProcessing ||
                    selectedSections.length === 0 ||
                    isExporting
                  }
                >
                  Modify
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 max-w-xs p-4">
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
                    disabled={
                      isGenerating || isUploading || isProcessing || isExporting
                    }
                  >
                    {isGenerating ? 'Generating...' : 'Generate Modifications'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              onClick={handleExport}
              className="w-full mb-2"
              disabled={
                isExporting ||
                isGenerating ||
                isUploading ||
                isProcessing ||
                Object.keys(allResults).length === 0
              }
              variant="default"
              style={{
                opacity:
                  isExporting ||
                  isGenerating ||
                  isUploading ||
                  isProcessing ||
                  Object.keys(allResults).length === 0
                    ? 0.5
                    : 1,
                pointerEvents:
                  isExporting ||
                  isGenerating ||
                  isUploading ||
                  isProcessing ||
                  Object.keys(allResults).length === 0
                    ? 'none'
                    : 'auto',
              }}
            >
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <header className="bg-white shadow-sm p-4 flex items-center h-16">
          <h1 className="text-2xl font-semibold text-gray-800">
            Easy PD
          </h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <section>
            {Object.keys(allResults).length === 0 ? (
              <p className="text-gray-500"></p>
            ) : (
              <div className="space-y-4">
                {Object.keys(allResults).map((section) => {
                  const iterations = allResults[section];
                  const currentIteration = currentIterations[section] || 1;
                  const currentResult = iterations.find(
                    (r) => r.iteration_number === currentIteration
                  );
                  const isSelected = selectedSections.includes(section);
                  const isHighlighted = highlightedSections.includes(section);

                  return (
                    <Card
                      key={section}
                      className={`p-4 hover:shadow-md transition-shadow cursor-pointer ${
                        isSelected ? 'bg-gray-200 border-gray-300' : ''
                      } ${
                        isHighlighted
                          ? 'animate-pulse bg-green-50 border-green-200'
                          : ''
                      }`}
                      onClick={() => toggleSection(section)}
                    >
                      <div className="bg-white p-3 rounded-md border">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {currentResult?.answer || 'No answer provided.'}
                        </ReactMarkdown>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <p className="text-sm text-gray-500">
                          Iteration: {currentIteration}
                        </p>
                        <div className="flex items-center space-x-2">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleIterationChange(section, -1);
                            }}
                            disabled={
                              currentIteration === 1 ||
                              isGenerating ||
                              isUploading ||
                              isProcessing
                            }
                            size="sm"
                            variant="ghost"
                          >
                            <ChevronLeftIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleIterationChange(section, 1);
                            }}
                            disabled={
                              currentIteration === iterations.length ||
                              isGenerating ||
                              isUploading ||
                              isProcessing
                            }
                            size="sm"
                            variant="ghost"
                          >
                            <ChevronRightIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(currentResult?.answer || '');
                            }}
                            disabled={
                              isGenerating || isUploading || isProcessing
                            }
                          >
                            <CopyIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
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
            <Button
              variant="ghost"
              onClick={() => setIsDialogOpen(false)}
              disabled={isGenerating || isUploading || isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkspace}
              disabled={isGenerating || isUploading || isProcessing}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ToastContainer />
    </div>
  );
}
