/**
 * PDF Accumulator Module - Manages per-page PDF capture and combined document assembly
 *
 * Runs in the main process. Called via IPC from renderer after each "Add Current Page"
 * action (incAmt=0). Individual pages are saved as separate files AND appended to a
 * combined PDF that grows with each page. The combined PDF is returned as a download
 * when the API requests DL=true, then deleted after confirmation.
 *
 * When a new search starts (lro param received), any existing accumulated PDF is
 * discarded without downloading.
 *
 * File paths:
 *   Individual pages: shared/pdf/<DocumentName>_page<N>.pdf
 *   Combined PDF:     shared/pdf/<DocumentName>.pdf
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Save directory — relative to project root
const PDF_DIR = path.join(__dirname, '..', 'shared', 'pdf');

// Accumulator state
let combinedPdf = null;       // pdf-lib PDFDocument (in-memory, appended to each addPage)
let combinedPdfPath = null;   // Full path to the combined .pdf file on disk
let pageCount = 0;            // Number of pages added so far

/**
 * Ensure the PDF output directory exists
 * @returns {string} Absolute path to the PDF directory
 */
function getPdfDir() {
    if (!fs.existsSync(PDF_DIR)) {
        fs.mkdirSync(PDF_DIR, { recursive: true });
    }
    return PDF_DIR;
}

/**
 * Build a human-readable filename from the current state
 * e.g. "LRO55-Plan 606" or "Onland_Document" as fallback
 * @param {Object} state - Global state object (lro, descType, descNumber)
 * @returns {string} The document name (no extension)
 */
function buildFilename(state) {
    let name = '';
    if (state.lro) name += 'LRO' + state.lro;
    if (state.descType) name += (name ? '-' : '') + state.descType;
    if (state.descNumber) name += ' ' + state.descNumber;
    return name || 'Onland_Document';
}

/**
 * Sanitize a string for use in filenames (remove problematic characters)
 * @param {string} str - Raw filename string
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(str) {
    // Replace characters that are illegal or problematic in filenames
    return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

/**
 * Add a page to the PDF accumulator
 * Saves an individual PDF file and appends the page to the combined document.
 * @param {string} base64Data - Base64-encoded PDF content for this page
 * @param {Object} state - Current state (lro, descType, descNumber, currentPage)
 * @returns {Object} { individualPath, combinedPath, pageCount, filename }
 */
async function addPage(base64Data, state) {
    const pdfDir = getPdfDir();
    const rawName = buildFilename(state);
    const docName = sanitizeFilename(rawName);
    const currentPage = state.currentPage || (pageCount + 1);

    // Save individual page PDF
    const individualPath = path.join(pdfDir, `${docName}_page${currentPage}.pdf`);
    fs.writeFileSync(individualPath, Buffer.from(base64Data, 'base64'));

    // Create or append to the combined PDF
    if (!combinedPdf) {
        combinedPdf = await PDFDocument.create();
        combinedPdfPath = path.join(pdfDir, `${docName}.pdf`);
        pageCount = 0;
    }

    // Load the individual page PDF and copy its pages into the combined document
    const pagePdf = await PDFDocument.load(Buffer.from(base64Data, 'base64'));
    const copiedPages = await combinedPdf.copyPages(pagePdf, pagePdf.getPageIndices());
    copiedPages.forEach(page => combinedPdf.addPage(page));
    pageCount++;

    // Save the updated combined PDF to disk
    const pdfBytes = await combinedPdf.save();
    fs.writeFileSync(combinedPdfPath, pdfBytes);

    return {
        individualPath: path.relative(path.join(__dirname, '..'), individualPath),
        combinedPath: path.relative(path.join(__dirname, '..'), combinedPdfPath),
        pageCount,
        filename: `${docName}.pdf`
    };
}

/**
 * Get the combined PDF file info (if it exists)
 * @returns {Object|null} { path, relativePath, filename, pageCount } or null if no PDF
 */
function getCombinedPdf() {
    if (!combinedPdfPath || !fs.existsSync(combinedPdfPath)) {
        return null;
    }
    return {
        path: combinedPdfPath,
        relativePath: path.relative(path.join(__dirname, '..'), combinedPdfPath),
        filename: path.basename(combinedPdfPath),
        pageCount
    };
}

/**
 * Read the combined PDF file and return its base64 content
 * Used by the server to send the PDF to the API caller
 * @returns {Object|null} { base64Data, filename, pageCount } or null if no PDF
 */
function getCombinedPdfBase64() {
    if (!combinedPdfPath || !fs.existsSync(combinedPdfPath)) {
        return null;
    }
    const fileBuffer = fs.readFileSync(combinedPdfPath);
    return {
        base64Data: fileBuffer.toString('base64'),
        filename: path.basename(combinedPdfPath),
        pageCount,
        size: fileBuffer.length
    };
}

/**
 * Delete the accumulated PDF and all associated individual page PDFs
 * Called when a new search starts (discarding old accumulation) or after
 * a confirmed download (cleanup).
 */
function deleteCombined() {
    const pdfDir = getPdfDir();

    // If there's a combined PDF, delete it and its associated individual pages
    if (combinedPdfPath && fs.existsSync(combinedPdfPath)) {
        const docName = path.basename(combinedPdfPath, '.pdf');

        // Delete the combined PDF
        try {
            fs.unlinkSync(combinedPdfPath);
        } catch (e) {
            // Ignore delete errors
        }

        // Delete individual page PDFs for this document
        try {
            const files = fs.readdirSync(pdfDir);
            files.forEach(f => {
                if (f.startsWith(docName + '_page') && f.endsWith('.pdf')) {
                    try {
                        fs.unlinkSync(path.join(pdfDir, f));
                    } catch (e) {
                        // Ignore individual file delete errors
                    }
                }
            });
        } catch (e) {
            // Ignore readdir errors
        }
    }

    reset();
}

/**
 * Reset in-memory accumulator state without touching files
 */
function reset() {
    combinedPdf = null;
    combinedPdfPath = null;
    pageCount = 0;
}

module.exports = {
    addPage,
    getCombinedPdf,
    getCombinedPdfBase64,
    deleteCombined,
    reset
};
