// Parser and Import Wizard module for CSV, PDF, and Image OCR

// Dynamic loader helper for external library CDNs
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Loads PDF.js and Tesseract.js CDNs.
 */
export async function initializeParsers() {
  const pdfJsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const tesseractUrl = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  
  await Promise.all([
    loadScript(pdfJsUrl).then(() => {
      // Set worker source for PDF.js
      window['pdfjs-dist/build/pdf'].GlobalWorkerOptions.workerSrc = 
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }),
    loadScript(tesseractUrl)
  ]);
}

/**
 * Parses CSV file content into rows.
 * @param {string} text CSV raw text
 * @returns {Array<Array<string>>} List of rows, where each row is an array of strings
 */
export function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  lines.forEach(line => {
    if (!line.trim()) return;
    
    // Standard CSV line split handling simple commas and quotes
    const row = [];
    let insideQuote = false;
    let entry = "";
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(entry.trim());
        entry = "";
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    result.push(row);
  });
  return result;
}

/**
 * Extracts raw text from a PDF file.
 * @param {File} file The uploaded PDF file
 * @param {Function} onProgress Progress callback
 * @returns {Promise<string>} Extracted raw text
 */
export async function extractTextFromPDF(file, onProgress) {
  if (!window['pdfjs-dist/build/pdf']) {
    throw new Error("PDF.js library is not loaded.");
  }
  
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  
  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) {
      onProgress(i / pdf.numPages, `Extracting PDF page ${i} of ${pdf.numPages}...`);
    }
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }
  
  return fullText;
}

/**
 * Performs OCR on an image file.
 * @param {File} file The uploaded image file
 * @param {Function} onProgress Progress callback
 * @returns {Promise<string>} Extracted raw text
 */
export async function extractTextFromImage(file, onProgress) {
  if (!window.Tesseract) {
    throw new Error("Tesseract.js library is not loaded.");
  }
  
  const result = await window.Tesseract.recognize(
    file,
    'eng',
    {
      logger: m => {
        if (onProgress && m.status === 'recognizing') {
          onProgress(m.progress, `OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    }
  );
  
  return result.data.text;
}

/**
 * Analyzes raw text using heuristics to find timetable entries.
 * @param {string} text Raw text extracted from PDF or OCR
 * @param {Object} db Database instance to match existing items
 * @returns {Array<Object>} List of candidate timetable sessions
 */
export function heuristicParseText(text, db) {
  const days = db.timeSettings.days;
  const teachers = db.getAll("teachers");
  const courses = db.getAll("courses");
  const sections = db.getAll("sections");
  const rooms = db.getAll("rooms");
  
  const sessions = [];
  const lines = text.split(/\r?\n/);
  
  // Regex patterns
  const timeRegex = /\b(\d{1,2})[:.](\d{2})\s*(?:AM|PM)?\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*(?:AM|PM)?/gi;
  const courseCodeRegex = /\b([A-Z]{2,5})[- ]?(\d{3,4})[A-Z]?\b/i;

  lines.forEach(line => {
    if (!line.trim()) return;
    
    // 1. Detect Day
    let detectedDayIndex = -1;
    for (let d = 0; d < days.length; d++) {
      const dayRegex = new RegExp(`\\b${days[d]}\\b|\\b${days[d].substring(0, 3)}\\b`, "i");
      if (dayRegex.test(line)) {
        detectedDayIndex = d;
        break;
      }
    }
    
    // 2. Detect Timeslot (Heuristic matching against timeSettings slotTimes or slot index)
    let detectedSlotIndex = -1;
    const timeMatch = timeRegex.exec(line);
    if (timeMatch) {
      // Clean timeMatch to find corresponding slot
      const timeStr = timeMatch[0];
      // Try to find matching slot in timeSettings
      for (let s = 0; s < db.timeSettings.slotTimes.length; s++) {
        // Simple overlap check or index match
        const configTime = db.timeSettings.slotTimes[s];
        if (configTime.toLowerCase().includes(timeStr.toLowerCase()) || timeStr.toLowerCase().includes(configTime.toLowerCase())) {
          detectedSlotIndex = s;
          break;
        }
      }
    }
    // Fallback: search for slot numbers (e.g. "Slot 1", "Period 3")
    if (detectedSlotIndex === -1) {
      const slotNumMatch = /slot\s*(\d{1,2})|period\s*(\d{1,2})/i.exec(line);
      if (slotNumMatch) {
        const idx = parseInt(slotNumMatch[1] || slotNumMatch[2]) - 1;
        if (idx >= 0 && idx < db.timeSettings.slotsPerDay) {
          detectedSlotIndex = idx;
        }
      }
    }

    // 3. Detect Course
    let detectedCourseId = "";
    let detectedCourseCode = "";
    const courseMatch = courseCodeRegex.exec(line);
    if (courseMatch) {
      detectedCourseCode = courseMatch[0].toUpperCase();
      // Look up in database
      const foundCourse = courses.find(c => c.code.replace(/[- ]/g, "").toUpperCase() === detectedCourseCode.replace(/[- ]/g, "").toUpperCase());
      if (foundCourse) {
        detectedCourseId = foundCourse.id;
      }
    }

    // 4. Detect Teacher
    let detectedTeacherId = "";
    teachers.forEach(t => {
      // Match by last name or full name
      const nameParts = t.name.split(" ");
      nameParts.forEach(part => {
        if (part.length > 3 && new RegExp(`\\b${part}\\b`, "i").test(line)) {
          detectedTeacherId = t.id;
        }
      });
    });

    // 5. Detect Room
    let detectedRoomId = "";
    rooms.forEach(r => {
      const roomRegex = new RegExp(`\\b${r.name}\\b`, "i");
      if (roomRegex.test(line)) {
        detectedRoomId = r.id;
      }
    });

    // 6. Detect Section
    let detectedSectionIds = [];
    sections.forEach(s => {
      const sectionRegex = new RegExp(`\\b${s.name.replace("-", "[- ]?")}\\b`, "i");
      if (sectionRegex.test(line)) {
        detectedSectionIds.push(s.id);
      }
    });

    // If we have at least a Course + Section/Teacher/Day, we treat it as a candidate timetable entry
    if (detectedCourseCode || detectedCourseId) {
      sessions.push({
        id: "parsed_" + Math.random().toString(36).substr(2, 9),
        rawText: line.substring(0, 100),
        courseId: detectedCourseId,
        courseCode: detectedCourseCode || (detectedCourseId ? db.getById("courses", detectedCourseId).code : ""),
        teacherId: detectedTeacherId,
        roomId: detectedRoomId,
        sectionIds: detectedSectionIds,
        day: detectedDayIndex !== -1 ? detectedDayIndex : 0,
        slot: detectedSlotIndex !== -1 ? detectedSlotIndex : 0
      });
    }
  });

  return sessions;
}
