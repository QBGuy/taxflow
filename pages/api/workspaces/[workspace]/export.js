import { downloadFile } from '../../../../lib/azureBlob';
import { marked } from 'marked';

export default async function handler(req, res) {
  const {
    query: { workspace: selectedWorkspace },
    method,
  } = req;

  if (method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }

  try {
    console.log(`Attempting to download results.json for workspace "${selectedWorkspace}"`);

    const resultsContent = await downloadFile(selectedWorkspace, 'results', 'results.json', false);

    if (!resultsContent) {
      throw new Error('results.json is empty or could not be retrieved.');
    }

    let results;
    try {
      results = JSON.parse(resultsContent);
      console.log(`Successfully parsed results.json for workspace "${selectedWorkspace}"`);
    } catch (parseError) {
      throw new Error('Failed to parse results.json. Ensure it is valid JSON.');
    }

    if (!Array.isArray(results)) {
      throw new Error('results.json does not contain a valid array.');
    }

    if (results.length === 0) {
      throw new Error('results.json is empty. No results available to export.');
    }

    const latestResultsMap = {};

    results.forEach(result => {
      const { section, iteration_number } = result;
      if (
        !latestResultsMap[section] ||
        iteration_number > latestResultsMap[section].iteration_number
      ) {
        latestResultsMap[section] = result;
      }
    });

    let markdownContent = '';
    Object.values(latestResultsMap).forEach(result => {
      markdownContent += `${result.answer}\n\n`;
    });

    if (!markdownContent.trim()) {
      throw new Error('No results available to export.');
    }

    let htmlContent = marked(markdownContent);

    const { toc, processedHtml } = generateTOC(htmlContent);

    const formattedTitle = toProperCase(selectedWorkspace.replace(/-/g, ' '));

    const styles = `
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          margin: 0; 
          padding: 0;
          color: #333;
          display: flex;
          min-height: 100vh;
        }
        .toc {
          position: fixed;
          top: 0;
          left: 0;
          width: 250px;
          background-color: #f9f9f9;
          padding: 40px 15px 15px 15px; /* Added top padding to match content */
          height: 100vh;
          border-right: 1px solid #ddd;
          overflow-y: auto;
        }
        .toc h2 {
          font-size: 1.25rem;
          margin: 0 0 15px 0;
        }
        .toc a {
          text-decoration: none;
          color: #2E74B5;
          display: block;
          padding: 4px 0;
          line-height: 1.2;
        }
        .toc a:hover {
          text-decoration: underline;
        }
        .main-container {
          flex: 1;
          margin-left: 250px;
          display: flex;
          justify-content: center;
          padding: 40px;
        }
        .content {
          width: 100%;
          max-width: 1100px; 
        }
        .title { 
          color: #2E74B5; 
          font-size: 1.75rem;
          margin: 0 0 30px 0;
          font-weight: bold;
        }
        h1, h2, h3 { 
          color: #2E74B5; 
          margin-top: 20px; 
          margin-bottom: 10px; 
        }
        h1 {
          font-size: 1.5rem;
        }
        h2 {
          font-size: 1.25rem;
        }
        h3 {
          font-size: 1.1rem;
        }
        p, ul, li { 
          margin-bottom: 15px; 
        }
        strong { 
          font-weight: bold; 
        }
      </style>
    `;

    const completeHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Product Description - ${formattedTitle}</title>
          ${styles}
        </head>
        <body>
          <div class="toc">
            <h2>Table of Contents</h2>
            ${toc}
          </div>
          <div class="main-container">
            <div class="content">
              <div class="title">Product Description - ${formattedTitle}</div>
              ${processedHtml}
            </div>
          </div>
        </body>
      </html>
    `;  

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="results_${selectedWorkspace}.html"`);

    res.status(200).send(completeHtml);
  } catch (error) {
    console.error(`Error exporting results for workspace "${selectedWorkspace}":`, error.message);
    res.status(500).json({ message: 'Error exporting results.', error: error.message });
  }
}

function generateTOC(htmlContent) {
    const tocItems = [];
    const headerRegex = /<h1>(.*?)<\/h1>/g; // Only match h1 headers
    let match;
    let index = 0;
    let processedHtml = htmlContent;
  
    while ((match = headerRegex.exec(htmlContent)) !== null) {
      const [fullMatch, headerText] = match;
      const id = `section-${index++}`;
      tocItems.push(`<a href="#${id}">${headerText}</a>`);
      processedHtml = processedHtml.replace(fullMatch, `<h1 id="${id}">${headerText}</h1>`);
    }
  
    return {
      toc: tocItems.join(''),
      processedHtml
    };
  }
  
  function toProperCase(str) {
    return str.replace(/\b\w+/g, function(word) {
      // If word is all uppercase, assume it's an acronym and keep it as is
      if (word === word.toUpperCase() && word.length > 1) {
        return word;
      }
      // Otherwise, capitalize first letter and lowercase the rest
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    });
  }