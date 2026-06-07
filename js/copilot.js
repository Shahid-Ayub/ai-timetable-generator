// SchedulerAI AI Copilot Chat & Document Processing Engine

export async function fetchEnv() {
  const env = {
    PRIMARY_GEMINI_KEY: "",
    PRIMARY_GEMINI_MODEL: "gemini-2.5-flash",
    OPENROUTER_API_KEY: ""
  };
  try {
    const response = await fetch('/.env');
    if (response.ok) {
      const text = await response.text();
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const equalsIdx = trimmed.indexOf('=');
          if (equalsIdx !== -1) {
            const key = trimmed.substring(0, equalsIdx).trim();
            const val = trimmed.substring(equalsIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (key) env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    console.warn("Failed to load .env file, using defaults:", e);
  }
  return env;
}

export class Copilot {
  constructor(db, callbacks = {}, env = {}) {
    this.db = db;
    this.onMutation = callbacks.onMutation || (() => {});
    this.onRunSolver = callbacks.onRunSolver || (() => {});
    this.onSwitchView = callbacks.onSwitchView || (() => {});
    this.env = {
      PRIMARY_GEMINI_KEY: "",
      PRIMARY_GEMINI_MODEL: "gemini-2.5-flash",
      OPENROUTER_API_KEY: "",
      ...env
    };
    
    // Auto-initialize defaults: prioritize Gemini with the primary key loaded from env
    const currentKey = localStorage.getItem("copilot_api_key");
    const primaryKey = this.env.PRIMARY_GEMINI_KEY || "";
    const primaryModel = this.env.PRIMARY_GEMINI_MODEL || "gemini-2.5-flash";

    if (!localStorage.getItem("copilot_provider") || 
        localStorage.getItem("copilot_provider") === "local" || 
        !currentKey || 
        currentKey.startsWith("AIzaSyBx") || 
        currentKey.startsWith("AIzaSyCj") || 
        currentKey.startsWith("sk-or-v1-3876da")) {
      localStorage.setItem("copilot_provider", "gemini");
      localStorage.setItem("copilot_api_key", primaryKey);
      localStorage.setItem("copilot_model", primaryModel);
    }
    
    // Migrate deprecated model
    if (localStorage.getItem("copilot_model") === "gemini-1.5-flash" || localStorage.getItem("copilot_model") === "gemini-2.0-flash") {
      localStorage.setItem("copilot_model", primaryModel);
    }

    // Load config from localStorage
    this.config = {
      provider: localStorage.getItem("copilot_provider") || "gemini",
      apiKey: localStorage.getItem("copilot_api_key") || primaryKey,
      model: localStorage.getItem("copilot_model") || primaryModel
    };
  }

  // Save Settings
  saveConfig(provider, apiKey, model) {
    this.config.provider = provider;
    this.config.apiKey = apiKey;
    this.config.model = model;
    localStorage.setItem("copilot_provider", provider);
    localStorage.setItem("copilot_api_key", apiKey);
    localStorage.setItem("copilot_model", model);
  }

  // Send Message interface — Always tries PRIMARY Gemini key first, falls back to configured provider
  async sendMessage(text) {
    if (!text || text.trim() === "") return null;
    
    // STEP 1: Always try the primary Gemini API key first
    try {
      console.log("[Copilot] Attempting primary Gemini API...");
      const geminiResult = await this._callGeminiDirect(text, this.env.PRIMARY_GEMINI_KEY, this.env.PRIMARY_GEMINI_MODEL);
      if (geminiResult && geminiResult.success !== undefined) {
        console.log("[Copilot] Primary Gemini API succeeded.");
        return geminiResult;
      }
    } catch (primaryErr) {
      console.warn("[Copilot] Primary Gemini API failed, falling back...", primaryErr.message);
    }
    
    // STEP 2: Fall back to OpenRouter as the secondary provider
    console.log("[Copilot] Falling back to OpenRouter secondary provider...");
    try {
      // Use the backup OpenRouter key with Gemini model
      const savedKey = this.config.apiKey;
      const savedModel = this.config.model;
      this.config.apiKey = this.env.OPENROUTER_API_KEY;
      this.config.model = "google/gemini-2.5-flash";
      const result = await this.processOpenRouterCommand(text);
      // Restore original config
      this.config.apiKey = savedKey;
      this.config.model = savedModel;
      if (result && result.success !== undefined) {
        console.log("[Copilot] OpenRouter fallback succeeded.");
        return result;
      }
    } catch (fallbackErr) {
      console.warn("[Copilot] OpenRouter fallback also failed:", fallbackErr.message);
    }

    // STEP 3: Last resort — try user's own configured provider if different
    if (this.config.provider === "local") {
      return this.processLocalCommand(text);
    } else if (this.config.provider === "openai" && !this.config.apiKey.startsWith("sk-or-")) {
      return this.processOpenAICommand(text);
    }
    
    return {
      success: false,
      feedback: "All AI providers are currently unavailable. The Gemini API is experiencing high demand — please try again in a moment."
    };
  }

  // --- DIRECT GEMINI CALLER (used for primary key priority) ---
  async _callGeminiDirect(text, apiKey, model) {
    const dbContext = this.getSerializedDbContext();
    const systemPrompt = this.getSystemMutationPrompt();

    const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\nDATABASE CONTEXT:\n${JSON.stringify(dbContext, null, 2)}\n\nUSER PROMPT: "${text}"`
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errObj = await response.json();
      throw new Error(errObj.error?.message || "Primary Gemini API HTTP error.");
    }

    const resJson = await response.json();
    const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) throw new Error("Empty response from primary Gemini API.");
    
    const parsedRes = JSON.parse(rawText);
    const executionResult = this.applyMutations(parsedRes.mutations);
    
    return {
      success: executionResult.success,
      action: executionResult.action || null,
      params: executionResult.params || null,
      feedback: parsedRes.feedback || executionResult.feedback
    };
  }

  // --- LOCAL COMMAND REGEX PARSER (OFFLINE MODE) ---
  processLocalCommand(text) {
    const prompt = text.trim();
    
    // Reschedule Inquiry voice/text handler
    const inquiryMatch = prompt.match(/(?:move|reschedule|shift|rearrange|re-arrange|change|transfer)\b/i);
    if (inquiryMatch && !prompt.match(/(?:to|on)\s+(monday|tuesday|wednesday|thursday|friday)/i)) {
      let courseCode = "";
      let teacherName = "";
      let dayName = "";
      let periodName = "";

      this.db.getAll("courses").forEach(c => {
        if (prompt.toLowerCase().includes(c.code.toLowerCase()) || prompt.toLowerCase().includes(c.name.toLowerCase())) {
          courseCode = c.code;
        }
      });

      this.db.getAll("teachers").forEach(t => {
        const lastName = t.name.split(" ").pop();
        if (prompt.toLowerCase().includes(t.name.toLowerCase()) || (lastName.length > 2 && prompt.toLowerCase().includes(lastName.toLowerCase()))) {
          teacherName = t.name;
        }
      });

      const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
      days.forEach(d => {
        if (prompt.toLowerCase().includes(d)) {
          dayName = d.charAt(0).toUpperCase() + d.slice(1);
        }
      });

      const pMatch = prompt.match(/(?:period|p)\s*(\d{1,2})/i);
      if (pMatch) {
        periodName = `Period ${pMatch[1]}`;
      } else if (prompt.includes("11")) {
        periodName = "Period 7";
      } else if (prompt.includes("8")) {
        periodName = "Period 1";
      } else if (prompt.includes("9")) {
        periodName = "Period 3";
      } else if (prompt.includes("10")) {
        periodName = "Period 5";
      }

      return {
        success: true,
        action: "reschedule_inquiry",
        params: { courseCode, teacherName, dayName, periodName, query: prompt },
        feedback: `Searching for reschedule options for your request...`
      };
    }

    // 1. Move Class Session
    // e.g. "move CS-101 to monday period 2" or "reschedule BSCS-101 on Friday Period 5"
    const moveMatch = prompt.match(/(?:move|reschedule|shift|put)\s+([A-Za-z0-9-]{2,10})\s+(?:to|on)\s+(monday|tuesday|wednesday|thursday|friday)(?:\s+period\s+(\d{1,2}))?/i);
    if (moveMatch) {
      const courseCode = moveMatch[1].toUpperCase();
      const dayName = moveMatch[2].toLowerCase();
      const periodNum = moveMatch[3] ? parseInt(moveMatch[3]) : null;
      
      const dayMap = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4 };
      const targetDay = dayMap[dayName];
      const targetSlot = periodNum !== null ? periodNum - 1 : 0;
      
      // Find course
      const course = this.db.getAll("courses").find(c => c.code.toUpperCase() === courseCode);
      if (!course) {
        return { success: false, feedback: `Could not find course with code "${courseCode}" in the database.` };
      }
      
      const activeSchedule = this.db.getActiveSchedule();
      if (!activeSchedule || !activeSchedule.sessions || activeSchedule.sessions.length === 0) {
        return { success: false, feedback: `No active timetable generated yet. Please click 'Run Auto Scheduler' first, then reschedule.` };
      }
      
      // Find matching session
      const sessions = activeSchedule.sessions.filter(s => s.courseId === course.id);
      if (sessions.length === 0) {
        return { success: false, feedback: `No sessions for course "${courseCode}" found in the active timetable.` };
      }
      
      // Move the first session (or loop if multiple)
      sessions[0].day = targetDay;
      sessions[0].slot = targetSlot;
      this.db.save();
      this.onMutation("moveSession");
      this.onSwitchView("schedule");
      
      return {
        success: true,
        feedback: `Rescheduled ${course.code} (${course.name}) class session to ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} Period ${targetSlot + 1}. Grid updated!`
      };
    }

    // 2. Set Teacher Availability
    // e.g. "make Dr. Alice Smith unavailable on Friday Period 5"
    const availMatch = prompt.match(/(?:make|set)\s+([A-Za-z.\s]+)\s+(unavailable|busy|available)\s+(?:on|for)\s+(monday|tuesday|wednesday|thursday|friday)(?:\s+period\s+(\d{1,2}))?/i);
    if (availMatch) {
      const teacherName = availMatch[1].trim();
      const status = availMatch[2].toLowerCase();
      const dayName = availMatch[3].toLowerCase();
      const periodNum = availMatch[4] ? parseInt(availMatch[4]) : null;
      
      const dayMap = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4 };
      const targetDay = dayMap[dayName];
      const setVal = status === "available";
      
      // Find teacher
      const teacher = this.db.getAll("teachers").find(t => t.name.toLowerCase().includes(teacherName.toLowerCase()));
      if (!teacher) {
        return { success: false, feedback: `Instructor "${teacherName}" not found.` };
      }
      
      if (periodNum !== null) {
        const slot = periodNum - 1;
        teacher.availability[targetDay][slot] = setVal;
        this.db.save();
        this.onMutation("updateAvailability");
        return { success: true, feedback: `Set ${teacher.name} to ${status} on ${dayName.toUpperCase()} Period ${periodNum}.` };
      } else {
        // Toggle entire day
        for (let s = 0; s < this.db.timeSettings.slotsPerDay; s++) {
          teacher.availability[targetDay][s] = setVal;
        }
        this.db.save();
        this.onMutation("updateAvailability");
        return { success: true, feedback: `Set ${teacher.name} to ${status} for all slots on ${dayName.toUpperCase()}.` };
      }
    }

    // 3. Add Teacher
    // e.g. "add instructor Dr. Howard Wolowitz email howard@caltech.edu"
    const addTeacherMatch = prompt.match(/(?:add|register|create|insert)\s+instructor\s+([A-Za-z.\s]+)(?:\s+email\s+([^\s]+))?/i);
    if (addTeacherMatch) {
      const name = addTeacherMatch[1].trim();
      const email = addTeacherMatch[2] ? addTeacherMatch[2].trim() : `${name.toLowerCase().replace(/\s+/g, ".")}@university.edu`;
      
      const exists = this.db.getAll("teachers").some(t => t.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        return { success: false, feedback: `Instructor "${name}" is already registered.` };
      }
      
      this.db.add("teachers", {
        name,
        email,
        maxHours: 12,
        availability: Array.from({ length: this.db.timeSettings.days.length }, () => new Array(this.db.timeSettings.slotsPerDay).fill(true))
      });
      
      this.onMutation("addTeacher");
      this.onSwitchView("teachers");
      return { success: true, feedback: `Successfully registered instructor: ${name} (${email}).` };
    }

    // 4. Add Room
    // e.g. "add room Lab D capacity 30 type lab" or "create room Lecture Hall 10"
    const addRoomMatch = prompt.match(/(?:add|register|create)\s+room\s+([A-Za-z0-9\s]+)(?:\s+capacity\s+(\d+))?(?:\s+type\s+(lecture|lab))?/i);
    if (addRoomMatch) {
      const name = addRoomMatch[1].trim();
      const capacity = addRoomMatch[2] ? parseInt(addRoomMatch[2]) : 40;
      const type = addRoomMatch[3] ? addRoomMatch[3].toLowerCase() : "lecture";
      
      const exists = this.db.getAll("rooms").some(r => r.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        return { success: false, feedback: `Room "${name}" is already registered.` };
      }
      
      this.db.add("rooms", {
        name,
        type,
        capacity,
        availability: Array.from({ length: this.db.timeSettings.days.length }, () => new Array(this.db.timeSettings.slotsPerDay).fill(true))
      });
      
      this.onMutation("addRoom");
      this.onSwitchView("rooms");
      return { success: true, feedback: `Successfully registered room: ${name} (Type: ${type}, Capacity: ${capacity}).` };
    }

    // 5. Add Course
    // e.g. "add course CS-202 Object Oriented Programming"
    const addCourseMatch = prompt.match(/(?:add|register|create)\s+course\s+([A-Za-z0-9-]{2,10})\s+([A-Za-z0-9\s]+)/i);
    if (addCourseMatch) {
      const code = addCourseMatch[1].toUpperCase();
      const name = addCourseMatch[2].trim();
      
      const exists = this.db.getAll("courses").some(c => c.code.toUpperCase() === code);
      if (exists) {
        return { success: false, feedback: `Course code "${code}" is already registered.` };
      }
      
      this.db.add("courses", {
        code,
        name,
        sessionsPerWeek: 2,
        roomType: "lecture",
        teacherId: "",
        sectionIds: []
      });
      
      this.onMutation("addCourse");
      this.onSwitchView("courses");
      return { success: true, feedback: `Successfully registered course: ${code} - ${name}. Go to Courses tab to assign instructors and batched sections.` };
    }

    // 6. Run Scheduler Solver
    if (/^(?:run|start|generate|optimize|solve|schedule)\b/i.test(prompt)) {
      this.onSwitchView("dashboard");
      setTimeout(() => this.onRunSolver(), 300);
      return { success: true, feedback: "Triggering AI scheduling solver. Re-routing to Dashboard tab..." };
    }

    // 7. Check Conflicts
    if (/(?:check|audit|show)\s+(?:conflict|clash|logs)/i.test(prompt)) {
      this.onSwitchView("logs");
      return { success: true, feedback: "Loading structural conflict audits..." };
    }

    // 8. Wipe Database
    if (/^(?:clear|wipe|reset)\s+(?:database|db|all|data)\b/i.test(prompt)) {
      this.db.resetToEmpty();
      setTimeout(() => window.location.reload(), 1000);
      return { success: true, feedback: "Database successfully cleared. Reloading application..." };
    }

    // 9. Reset to presets
    if (/^(?:restore|load|reset)\s+(?:presets|default|defaults)\b/i.test(prompt)) {
      this.db.resetToPresets();
      setTimeout(() => window.location.reload(), 1000);
      return { success: true, feedback: "Presets restored. Reloading application..." };
    }

    return {
      success: false,
      feedback: "Instruction not recognized by Local Mode. (Try: 'move CS-101 to Monday Period 2', 'make Dr. Alice busy on Friday Period 5', 'optimize', 'add instructor Dr. Bob', or switch to Gemini Mode in Copilot Settings)."
    };
  }

  // --- GEMINI API CALLER ---
  async processGeminiCommand(text) {
    if (!this.config.apiKey) {
      return { success: false, feedback: "Gemini API key is missing. Open Copilot settings to input your key." };
    }

    const dbContext = this.getSerializedDbContext();
    const systemPrompt = this.getSystemMutationPrompt();

    const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
    
    try {
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\nDATABASE CONTEXT:\n${JSON.stringify(dbContext, null, 2)}\n\nUSER PROMPT: "${text}"`
            }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "HTTP Error contacting Gemini API.");
      }

      const resJson = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) throw new Error("Empty response received from Gemini.");
      
      const parsedRes = JSON.parse(rawText);
      const executionResult = this.applyMutations(parsedRes.mutations);
      
      return {
        success: executionResult.success,
        action: executionResult.action || null,
        params: executionResult.params || null,
        feedback: parsedRes.feedback || executionResult.feedback
      };
    } catch (e) {
      console.error(e);
      return {
        success: false,
        feedback: `Gemini API Error: ${e.message}`
      };
    }
  }

  // --- OPENAI API CALLER ---
  async processOpenAICommand(text) {
    if (!this.config.apiKey) {
      return { success: false, feedback: "OpenAI API key is missing. Open Copilot settings to input your key." };
    }

    const dbContext = this.getSerializedDbContext();
    const systemPrompt = this.getSystemMutationPrompt();

    const requestUrl = `https://api.openai.com/v1/chat/completions`;
    
    try {
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `DATABASE CONTEXT:\n${JSON.stringify(dbContext, null, 2)}\n\nUSER PROMPT: "${text}"` }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "HTTP Error contacting OpenAI API.");
      }

      const resJson = await response.json();
      const rawText = resJson.choices?.[0]?.message?.content;
      
      if (!rawText) throw new Error("Empty response received from OpenAI.");
      
      const parsedRes = JSON.parse(rawText);
      const executionResult = this.applyMutations(parsedRes.mutations);
      
      return {
        success: executionResult.success,
        action: executionResult.action || null,
        params: executionResult.params || null,
        feedback: parsedRes.feedback || executionResult.feedback
      };
    } catch (e) {
      console.error(e);
      return {
        success: false,
        feedback: `OpenAI API Error: ${e.message}`
      };
    }
  }

  // --- OPENROUTER API CALLER (AUTO-DETECTED BY KEY PREFIX) ---
  async processOpenRouterCommand(text) {
    const dbContext = this.getSerializedDbContext();
    const systemPrompt = this.getSystemMutationPrompt();

    const requestUrl = `https://openrouter.ai/api/v1/chat/completions`;
    
    let model = this.config.model;
    if (!model || model.includes("gemini-") || model.includes("gpt-")) {
      model = "google/gemini-2.5-flash"; 
    }

    try {
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
          "HTTP-Referer": "http://localhost:8085",
          "X-Title": "SchedulerAI"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `DATABASE CONTEXT:\n${JSON.stringify(dbContext, null, 2)}\n\nUSER PROMPT: "${text}"` }
          ],
          response_format: { type: "json_object" },
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "HTTP Error contacting OpenRouter API.");
      }

      const resJson = await response.json();
      const rawText = resJson.choices?.[0]?.message?.content;
      
      if (!rawText) throw new Error("Empty response received from OpenRouter.");
      
      const parsedRes = JSON.parse(rawText);
      const executionResult = this.applyMutations(parsedRes.mutations);
      
      return {
        success: executionResult.success,
        action: executionResult.action || null,
        params: executionResult.params || null,
        feedback: parsedRes.feedback || executionResult.feedback
      };
    } catch (e) {
      console.error(e);
      return {
        success: false,
        feedback: `OpenRouter API Error: ${e.message}`
      };
    }
  }

  // --- TIMETABLE DOCUMENT PARSER AI PIPELINE ---
  async parseUploadedTimetable(extractedText, instructions) {
    if (this.config.provider === "local" && !this.env.PRIMARY_GEMINI_KEY) {
      throw new Error("AI Timetable Document processing requires an active API Key. Please configure your Gemini or OpenAI API Key in Copilot Settings first.");
    }

    const systemPrompt = `You are a professional university scheduling parser.
We have processed a previous timetable document (PDF, CSV, or Image) and extracted the raw text content.
Your task is to parse this text, identify all structured entities, and compile them.

ENTITIES TO EXTRACT:
1. Teachers: Names, Emails (if not found in text, construct a standard university email like: name@university.edu)
2. Rooms: Names/numbers, Type ("lecture" or "lab" based on course type or name), Seating Capacity (estimate if not mentioned, e.g., 40 for standard rooms, 30 for labs, 120 for seminar halls)
3. Sections (Student Batches): e.g., BSCS-1A, BSEE-3B. Identify size (default 35), Program (e.g. Computer Science, Electrical Engineering), Semester (number 1 to 8).
4. Courses: Code (e.g., CS-101), Title, sessionsPerWeek (number of lectures/labs per week - if not clear, default to 2), roomType required ("lecture" or "lab"). Map each course to its Assigned Instructor and Assigned Sections.
5. Scheduled sessions: Mapping where each course is scheduled. 
   - Day index: Monday is 0, Tuesday is 1, Wednesday is 2, Thursday is 3, Friday is 4.
   - Slot index: Period S-1 is 0, S-2 is 1, S-3 is 2, S-4 is 3, S-5 is 4, S-6 is 5, S-7 is 6, S-8 is 7, S-9 is 8, S-10 is 9, S-11 (Lunch break, index 10, ALWAYS LOCKED), S-12 is 11, S-13 is 12, S-14 is 13, S-15 is 14.
   - Note: Lecture sessions are 1.5 hours long (occupying 3 slots). Lab sessions are 3 hours long (occupying 6 slots, or 4 slots if in the afternoon). Do NOT place any starting slots at index 10 (S-11) as it is the Lunch/Prayer Break.

USER EXTRA INSTRUCTIONS:
The user has provided custom instructions to adjust constraints/entities during this extraction:
"${instructions || "None"}"

Please carefully apply these instructions! For example, if they say "assign CS-101 to Dr. Jones" or "restrict Dr. Bob on Monday morning" or "set Seminar Hall capacity to 150", implement these modifications on the extracted data structures.

RETURN FORMAT:
You must output a single, valid JSON object following this EXACT structure:
{
  "teachers": [
    { "name": "Dr. Alice", "email": "alice@university.edu", "maxHours": 12 }
  ],
  "rooms": [
    { "name": "Room 201", "type": "lecture", "capacity": 50 }
  ],
  "sections": [
    { "name": "BSCS-3A", "size": 35, "program": "Computer Science", "semester": 5 }
  ],
  "courses": [
    { "code": "CS-101", "name": "Object Oriented Programming", "sessionsPerWeek": 2, "roomType": "lecture", "teacherName": "Dr. Alice", "sectionNames": ["BSCS-3A"] }
  ],
  "sessions": [
    { "courseCode": "CS-101", "roomName": "Room 201", "day": 0, "slot": 0 }
  ]
}

Ensure all arrays are complete, do not output placeholders or ellipses. Ensure all courses reference valid teacherNames and sectionNames matching the lists.`;

    let responseJson;

    // STEP 1: Always try primary Gemini key first for document parsing
    let primaryGeminiFailed = false;
    try {
      console.log("[Copilot Parser] Attempting primary Gemini API...");
      const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.env.PRIMARY_GEMINI_MODEL}:generateContent?key=${this.env.PRIMARY_GEMINI_KEY}`;
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\nEXTRACTED RAW TEXT:\n${extractedText}`
            }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "Primary Gemini API HTTP error.");
      }
      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Empty response from primary Gemini.");
      responseJson = JSON.parse(rawText);
    } catch (primaryErr) {
      console.warn("[Copilot Parser] Primary Gemini failed, falling back...", primaryErr.message);
      primaryGeminiFailed = true;
    }

    // STEP 2: Fall back to configured provider if primary Gemini failed
    if (primaryGeminiFailed) {
    if (this.config.apiKey && this.config.apiKey.startsWith("sk-or-")) {
      // OpenRouter API
      const requestUrl = `https://openrouter.ai/api/v1/chat/completions`;
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
          "HTTP-Referer": "http://localhost:8085",
          "X-Title": "SchedulerAI"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `EXTRACTED RAW TEXT:\n${extractedText}` }
          ],
          response_format: { type: "json_object" },
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "OpenRouter API Connection failure.");
      }
      const resData = await response.json();
      const rawText = resData.choices?.[0]?.message?.content;
      responseJson = JSON.parse(rawText);
    } else if (this.config.provider === "gemini") {
      const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\nEXTRACTED RAW TEXT:\n${extractedText}`
            }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "Gemini API Connection failure.");
      }
      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      responseJson = JSON.parse(rawText);
    } else {
      // OpenAI
      const requestUrl = `https://api.openai.com/v1/chat/completions`;
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `EXTRACTED RAW TEXT:\n${extractedText}` }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "OpenAI API Connection failure.");
      }
      const resData = await response.json();
      const rawText = resData.choices?.[0]?.message?.content;
      responseJson = JSON.parse(rawText);
    }
    } // end fallback block

    // Now import responseJson to DB
    this.importDataStructure(responseJson);
    this.onMutation("bulkImport");
  }

  // --- DATABASE IMPORT TRANSLATOR ---
  importDataStructure(data) {
    if (!data) return;

    // Reset current database
    this.db.resetToEmpty();

    const teacherMap = {}; // name -> id
    const roomMap = {}; // name -> id
    const sectionMap = {}; // name -> id
    const courseMap = {}; // code -> id

    // 1. Add Teachers
    if (Array.isArray(data.teachers)) {
      data.teachers.forEach(t => {
        const id = this.db.add("teachers", {
          name: t.name,
          email: t.email || `${t.name.toLowerCase().replace(/\s+/g, ".")}@university.edu`,
          maxHours: t.maxHours || 12,
          availability: Array.from({ length: this.db.timeSettings.days.length }, () => new Array(this.db.timeSettings.slotsPerDay).fill(true))
        });
        teacherMap[t.name.toLowerCase()] = id;
      });
    }

    // 2. Add Rooms
    if (Array.isArray(data.rooms)) {
      data.rooms.forEach(r => {
        const id = this.db.add("rooms", {
          name: r.name,
          type: r.type || "lecture",
          capacity: r.capacity || 40,
          availability: Array.from({ length: this.db.timeSettings.days.length }, () => new Array(this.db.timeSettings.slotsPerDay).fill(true))
        });
        roomMap[r.name.toLowerCase()] = id;
      });
    }

    // 3. Add Sections
    if (Array.isArray(data.sections)) {
      data.sections.forEach(s => {
        const id = this.db.add("sections", {
          name: s.name,
          size: s.size || 35,
          program: s.program || "General",
          semester: s.semester || 1
        });
        sectionMap[s.name.toLowerCase()] = id;
      });
    }

    // 4. Add Courses
    if (Array.isArray(data.courses)) {
      data.courses.forEach(c => {
        const mappedTeacherId = c.teacherName ? (teacherMap[c.teacherName.toLowerCase()] || "") : "";
        const mappedSectionIds = Array.isArray(c.sectionNames) 
          ? c.sectionNames.map(name => sectionMap[name.toLowerCase()]).filter(Boolean)
          : [];

        const id = this.db.add("courses", {
          code: c.code,
          name: c.name,
          sessionsPerWeek: c.sessionsPerWeek || 2,
          roomType: c.roomType || "lecture",
          teacherId: mappedTeacherId,
          sectionIds: mappedSectionIds
        });
        courseMap[c.code.toUpperCase()] = id;
      });
    }

    // 5. Add Schedule Sessions
    const sessions = [];
    if (Array.isArray(data.sessions)) {
      data.sessions.forEach((s, idx) => {
        const course = this.db.getAll("courses").find(c => c.code.toUpperCase() === s.courseCode.toUpperCase());
        const room = this.db.getAll("rooms").find(r => r.name.toLowerCase() === s.roomName.toLowerCase());
        
        if (course && room) {
          sessions.push({
            id: `sess_${Date.now()}_${idx}`,
            courseId: course.id,
            roomId: room.id,
            day: s.day !== undefined ? s.day : 0,
            slot: s.slot !== undefined ? s.slot : 0
          });
        }
      });
    }

    if (sessions.length > 0) {
      // Save schedule
      const newSchedule = {
        id: `sched_${Date.now()}`,
        name: "Imported Schedule State",
        fitness: 100,
        sessions: sessions
      };
      this.db.schedules.push(newSchedule);
    }

    this.db.save();
  }

  // --- MUTATIONS RUNNER FOR CHAT AGENT ---
  applyMutations(mutations) {
    if (!Array.isArray(mutations) || mutations.length === 0) {
      return { success: true, feedback: "No database changes requested." };
    }

    // Intercept reschedule inquiries to return suggestion options
    const inquiry = mutations.find(m => m.action === "reschedule_inquiry");
    if (inquiry) {
      return { success: true, action: "reschedule_inquiry", params: inquiry.params };
    }

    let changeCount = 0;
    try {
      mutations.forEach(mut => {
        const { action, params } = mut;
        
        switch (action) {
          case "moveSession": {
            const activeSchedule = this.db.getActiveSchedule();
            if (activeSchedule) {
              const session = activeSchedule.sessions.find(s => s.id === params.sessionId);
              if (session) {
                session.day = params.day;
                session.slot = params.slot;
                changeCount++;
              }
            }
            break;
          }
          case "updateTeacherAvailability": {
            const teacher = this.db.getById("teachers", params.teacherId);
            if (teacher) {
              teacher.availability[params.day][params.slot] = params.available;
              changeCount++;
            }
            break;
          }
          case "addTeacher": {
            this.db.add("teachers", {
              name: params.name,
              email: params.email || `${params.name.toLowerCase().replace(/\s+/g, ".")}@university.edu`,
              maxHours: params.maxHours || 12,
              availability: Array.from({ length: this.db.timeSettings.days.length }, () => new Array(this.db.timeSettings.slotsPerDay).fill(true))
            });
            changeCount++;
            break;
          }
          case "addRoom": {
            this.db.add("rooms", {
              name: params.name,
              type: params.type || "lecture",
              capacity: params.capacity || 40,
              availability: Array.from({ length: this.db.timeSettings.days.length }, () => new Array(this.db.timeSettings.slotsPerDay).fill(true))
            });
            changeCount++;
            break;
          }
          case "addCourse": {
            this.db.add("courses", {
              code: params.code,
              name: params.name,
              sessionsPerWeek: params.sessionsPerWeek || 2,
              roomType: params.roomType || "lecture",
              teacherId: params.teacherId || "",
              sectionIds: params.sectionIds || []
            });
            changeCount++;
            break;
          }
          case "deleteEntity": {
            this.db.delete(params.type, params.id);
            changeCount++;
            break;
          }
          case "runSolver": {
            setTimeout(() => this.onRunSolver(), 500);
            break;
          }
          case "switchView": {
            this.onSwitchView(params.view);
            break;
          }
          default:
            console.warn(`Unknown mutation action: ${action}`);
        }
      });

      if (changeCount > 0) {
        this.db.save();
        this.onMutation("apiMutations");
      }
      return { success: true, feedback: `Applied ${changeCount} modifications to the scheduling database.` };
    } catch (e) {
      console.error(e);
      return { success: false, feedback: `Failed applying mutations: ${e.message}` };
    }
  }

  // --- SERIALIZATION HELPERS ---
  getSerializedDbContext() {
    const activeSchedule = this.db.getActiveSchedule();
    
    return {
      teachers: this.db.getAll("teachers").map(t => {
        // Create availability summary to save context window tokens
        const busySlots = [];
        t.availability.forEach((dayRow, dayIdx) => {
          dayRow.forEach((val, slotIdx) => {
            if (!val) busySlots.push(`${this.db.timeSettings.days[dayIdx]} P${slotIdx + 1}`);
          });
        });
        return {
          id: t.id,
          name: t.name,
          email: t.email,
          maxHours: t.maxHours,
          busyPeriods: busySlots.join(", ") || "None (Fully Available)"
        };
      }),
      rooms: this.db.getAll("rooms").map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        capacity: r.capacity
      })),
      sections: this.db.getAll("sections").map(s => ({
        id: s.id,
        name: s.name,
        size: s.size
      })),
      courses: this.db.getAll("courses").map(c => {
        const teacher = this.db.getById("teachers", c.teacherId);
        const sections = c.sectionIds.map(sid => this.db.getById("sections", sid)?.name).filter(Boolean);
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          sessionsPerWeek: c.sessionsPerWeek,
          roomType: c.roomType,
          assignedTeacher: teacher ? teacher.name : "Unassigned",
          assignedSections: sections.join(", ")
        };
      }),
      activeSchedule: activeSchedule ? {
        id: activeSchedule.id,
        fitness: activeSchedule.fitness,
        sessions: activeSchedule.sessions.map(s => {
          const course = this.db.getById("courses", s.courseId);
          const teacher = course ? this.db.getById("teachers", course.teacherId) : null;
          const room = this.db.getById("rooms", s.roomId);
          return {
            sessionId: s.id,
            courseCode: course ? course.code : "Unknown",
            courseName: course ? course.name : "Unknown",
            teacherName: teacher ? teacher.name : "Unassigned",
            roomName: room ? room.name : "Unassigned",
            dayIndex: s.day,
            dayName: this.db.timeSettings.days[s.day],
            periodIndex: s.slot,
            periodName: `Period ${s.slot + 1}`
          };
        })
      } : null
    };
  }

  // --- SYSTEM MUTATIONS SYSTEM PROMPT ---
  getSystemMutationPrompt() {
    return `You are Scheduler Copilot, an AI assistant built into a university timetable application.
Your goal is to parse user natural language commands and convert them into structured database operations (mutations) to modify the timetable configuration.

You will be given a JSON object containing the current DATABASE CONTEXT (teachers, rooms, courses, sections, and active schedules).

SUPPORTED MUTATION ACTIONS:
- "moveSession": Move a scheduled session to a new day/period slot.
  Params: { "sessionId": string, "day": number (0-4), "slot": number (0-14) }
- "updateTeacherAvailability": Update an instructor's availability.
  Params: { "teacherId": string, "day": number (0-4), "slot": number (0-14), "available": boolean }
- "addTeacher": Create a new instructor.
  Params: { "name": string, "email": string (optional), "maxHours": number (optional, default 12) }
- "addRoom": Create a new classroom.
  Params: { "name": string, "type": "lecture" | "lab", "capacity": number }
- "addCourse": Create a new curriculum course.
  Params: { "code": string, "name": string, "sessionsPerWeek": number, "roomType": "lecture" | "lab", "teacherId": string (optional), "sectionIds": string[] (optional) }
- "deleteEntity": Delete an entity from database.
  Params: { "type": "teachers" | "rooms" | "courses" | "sections", "id": string }
- "runSolver": Start the AI Genetic Algorithm Optimizer solver to reconstruct schedule.
  Params: {}
- "switchView": Navigate to a different tab within the application.
  Params: { "view": "dashboard" | "teachers" | "courses" | "rooms" | "sections" | "importer" | "schedule" | "logs" }
- "reschedule_inquiry": Query for conflict-free slots to move/reschedule a class when the destination is unspecified or when options are requested.
  Params: { "courseCode": string (optional), "courseName": string (optional), "teacherName": string (optional), "dayName": string (optional), "periodName": string (optional) }

OUTPUT JSON STRUCTURE:
You must output a single, valid JSON block following this EXACT structure:
{
  "mutations": [
    { "action": "reschedule_inquiry", "params": { "teacherName": "Usman", "dayName": "Friday" } }
  ],
  "feedback": "I am looking up conflict-free slots for Dr. Usman's class."
}

INSTRUCTIONS:
1. Ensure sessionId, teacherId, roomId, and courseId match the exact GUID strings provided in the DATABASE CONTEXT.
2. If the user asks to shift a class, locate the correct sessionId from the activeSchedule.sessions array.
3. If they ask a general question that does not require database changes (or is unsupported), return an empty "mutations" array and write your response in the "feedback" string.
4. Always write a friendly, concise summary of the changes you performed in the "feedback" property. Ensure the feedback is formatted in markdown (e.g. bolding names/codes).
5. If the user asks to move/reschedule a class, but does NOT specify a target day/period (e.g., "reschedule Usman's class on Friday" or "where can we place the CS103 class"), return a "reschedule_inquiry" mutation containing any identified search details so the application can look up available slot options.`;
  }
}
